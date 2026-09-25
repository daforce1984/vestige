#!/usr/bin/env python3
"""Render the film to MP4 (1920×1080, 24 fps, H.264 + AAC) from the existing CDP test tab.

Rules (AGENTS.md): only the saved, user-visible test tab is used — no new browser, no new tab.

  audio   play the score once in real time and capture it sample-exactly (AudioWorklet tap) -> render/audio.wav
  video   step the frozen film frame by frame (FILM.freeze) and capture each frame -> render/seg_XXXX.mp4
          (segments of 240 frames; re-running resumes after the last finished segment)
  mux     concat the segments + audio -> render/VESTIGE.mp4

usage: uv run --with websocket-client --with imageio-ffmpeg tools/render_mp4.py audio|video|mux [from_frame to_frame]"""
import base64, json, os, subprocess, sys, time, wave

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cdp  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'render')
FPS, W, H, SEG = 24, 1920, 1080, 240


def ffmpeg():
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def session():
    _, ws = cdp.pick_tab()
    return cdp.Session(ws)


def ev(s, js, gesture=False):
    r = s.call('Runtime.evaluate', expression=js, awaitPromise=True, returnByValue=True, userGesture=gesture)
    if 'exceptionDetails' in r:
        raise RuntimeError(json.dumps(r['exceptionDetails'])[:800])
    return r.get('result', {}).get('value')


def duration(s):
    return float(ev(s, "import('/js/timemap.js').then(m => m.FILM_DURATION)"))


# ------------------------------------------------------------------ audio
TAP = r"""
class Tap extends AudioWorkletProcessor {
  process(inputs) {
    const i = inputs[0];
    if (i && i.length) this.port.postMessage([currentFrame, i[0].slice(0), (i[1] || i[0]).slice(0)]);
    return true;
  }
}
registerProcessor('film-tap', Tap);
"""

AUDIO_START = """(async () => {
  FILM.freeze(0);                                             // the picture idles: the audio thread gets the machine
  const mod = await import('/js/audio.js');
  const sc = new mod.default(); await sc.init();
  const ctx = sc.ctx; await ctx.resume();
  await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([%s], { type: 'application/javascript' })));
  const tap = new AudioWorkletNode(ctx, 'film-tap', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 2, channelCountMode: 'explicit' });
  const R = window.__AREC = { sc, tap, frames: [], L: [], Rr: [], sr: ctx.sampleRate, done: false };
  tap.port.onmessage = (e) => { R.frames.push(e.data[0]); R.L.push(e.data[1]); R.Rr.push(e.data[2]); };
  const mute = ctx.createGain(); mute.gain.value = 0;
  sc.out.connect(tap); tap.connect(mute); mute.connect(ctx.destination);
  await new Promise(r => setTimeout(r, 300));
  sc.start(0);
  R.t0 = sc._t0;                                              // context time of film t = 0
  return [ctx.sampleRate, R.t0];
})()""" % json.dumps(TAP)

AUDIO_PACK = """(() => {
  const R = window.__AREC, sr = R.sr, n0 = Math.round(R.t0 * sr), n = Math.round(%f * sr);
  const out = new Int16Array(n * 2);
  for (let k = 0; k < R.frames.length; k++) {
    const f = R.frames[k], L = R.L[k], Rr = R.Rr[k];
    for (let j = 0; j < L.length; j++) {
      const i = f + j - n0; if (i < 0 || i >= n) continue;
      out[2 * i] = Math.max(-32768, Math.min(32767, Math.round(L[j] * 32767)));
      out[2 * i + 1] = Math.max(-32768, Math.min(32767, Math.round(Rr[j] * 32767)));
    }
  }
  R.pcm = new Uint8Array(out.buffer); R.frames = R.L = R.Rr = null;
  return R.pcm.length;
})()"""


def audio():
    s = session()
    dur = duration(s) + 0.5
    sr, t0 = ev(s, AUDIO_START, gesture=True)
    print('audio: sr', sr, 't0', t0, 'duration', dur, flush=True)
    while True:
        t = ev(s, 'window.__AREC.sc.time')
        print('\r  t = %6.1f / %.1f' % (t, dur), end='', flush=True)
        if t >= dur + 0.3:
            break
        time.sleep(2)
    print()
    ev(s, 'window.__AREC.sc.stop(), 1')
    nb = ev(s, AUDIO_PACK % dur)
    pcm = bytearray()
    CH = 4 << 20
    for o in range(0, nb, CH):
        b64 = ev(s, """(() => { const u = window.__AREC.pcm.subarray(%d, %d); let s = '';
          for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768)); return btoa(s); })()""" % (o, min(nb, o + CH)))
        pcm += base64.b64decode(b64)
    ev(s, 'window.__AREC.sc.ctx.close(), window.__AREC = null, FILM.unfreeze(), 1')
    os.makedirs(OUT, exist_ok=True)
    with wave.open(os.path.join(OUT, 'audio.wav'), 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(int(sr)); w.writeframes(bytes(pcm))
    print('wrote render/audio.wav', len(pcm) // 4 / sr, 's')


# ------------------------------------------------------------------ video
# Memory safety (GTX 1060 3 GB; an unguarded run rebooted the machine): no viewport resize override (the page renders at
# its own window size, ffmpeg scales/pads to 1920×1080), one frame in flight at a time, the page is reloaded every
# RELOAD_EVERY segments to flush GPU memory, and Windows GPU dedicated usage + free RAM are polled — above the limits
# the page is reloaded, and if that doesn't bring it down the run stops (segments resume on the next run).
# (rejects after 15 s: a hidden/minimised tab stops requestAnimationFrame — the run then brings the tab forward and retries)
WAIT = ('Promise.race([new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>FILM.R.device.queue.onSubmittedWorkDone()'
        '.then(()=>requestAnimationFrame(()=>r(1)))))), new Promise((_, j)=>setTimeout(()=>j(new Error("frame stalled")), 15000))])')
PROJECT_URL = 'http://localhost:8791/'
RELOAD_EVERY = 3                 # segments (720 frames) between precautionary reloads
VRAM_SOFT, VRAM_HARD = 2.25e9, 2.6e9
RAM_MIN_FREE = 3e9
CHECK_EVERY = 48                 # frames


def sysmem():
    """(GPU dedicated bytes in use, free physical RAM bytes) on the Windows host"""
    ps = ("$g = ((Get-Counter '\\GPU Adapter Memory(*)\\Dedicated Usage').CounterSamples | Measure-Object CookedValue -Maximum).Maximum; "
          "$f = (Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory * 1024; Write-Output \"$g $f\"")
    out = subprocess.run(['powershell.exe', '-NoProfile', '-Command', ps], capture_output=True, text=True, timeout=60).stdout.split()
    return float(out[0]), float(out[1])


def load_page(s):
    """(re)load the project in the SAME test tab and wait until the film is ready"""
    s.call('Page.navigate', url=PROJECT_URL)
    for _ in range(120):
        time.sleep(1)
        try:
            if ev(s, "!!(window.FILM && document.querySelector('#start .go') && !document.querySelector('#start .go').disabled)"):
                break
        except Exception:
            pass
    else:
        raise RuntimeError('film never became ready')
    ev(s, "document.querySelector('#start').style.display='none'; document.body.classList.add('nohud'); globalThis.__CAM = null; FILM.freeze(0); 1")
    time.sleep(3)


def guard(s, where):
    s.call('Page.bringToFront')
    g, f = sysmem()
    print('\n  [mem %s] gpu %.2f GB, free ram %.1f GB' % (where, g / 1e9, f / 1e9), flush=True)
    if g < VRAM_SOFT and f > RAM_MIN_FREE:
        return
    print('  memory high -> reloading the page', flush=True)
    s.call('Page.navigate', url='about:blank'); time.sleep(8)
    load_page(s)
    g, f = sysmem()
    print('  after reload: gpu %.2f GB, free ram %.1f GB' % (g / 1e9, f / 1e9), flush=True)
    if g > VRAM_HARD or f < RAM_MIN_FREE:
        raise SystemExit('STOP: memory still high after reload (gpu %.2f GB, free ram %.1f GB)' % (g / 1e9, f / 1e9))


def video(f_from=None, f_to=None):
    s = session()
    s.call('Page.bringToFront')
    load_page(s)
    nfr = int(round(duration(s) * FPS))
    f_from = 0 if f_from is None else f_from
    f_to = nfr if f_to is None else min(nfr, f_to)
    os.makedirs(OUT, exist_ok=True)
    vf = 'scale=%d:%d:force_original_aspect_ratio=decrease:flags=lanczos,pad=%d:%d:(ow-iw)/2:(oh-ih)/2,setsar=1' % (W, H, W, H)
    try:
        t_start = time.time(); done = 0; segs_run = 0
        for seg in range(f_from // SEG, (f_to + SEG - 1) // SEG):
            fn = os.path.join(OUT, 'seg_%04d.mp4' % seg)
            if os.path.exists(fn):
                continue
            if segs_run and segs_run % RELOAD_EVERY == 0:
                print('\n  precautionary reload', flush=True)
                s.call('Page.navigate', url='about:blank'); time.sleep(5); load_page(s)
            guard(s, 'seg %d' % seg)
            a, b = seg * SEG, min(f_to, (seg + 1) * SEG)
            # prime motion blur: render the frame before the segment so frame a blends from a continuous history
            if a > 0:
                ev(s, 'FILM.freeze(%r)' % ((a - 1) / FPS)); ev(s, WAIT)
            p = subprocess.Popen([ffmpeg(), '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', str(FPS), '-c:v', 'mjpeg', '-i', '-',
                                  '-vf', vf, '-c:v', 'libx264', '-preset', 'medium', '-threads', '4', '-crf', '20', '-pix_fmt', 'yuv420p',
                                  '-r', str(FPS), fn + '.part.mp4'], stdin=subprocess.PIPE)
            try:
                for fi in range(a, b):
                    if fi > a and (fi - a) % CHECK_EVERY == 0:
                        g, f = sysmem()
                        if g > VRAM_HARD or f < RAM_MIN_FREE:
                            raise SystemExit('STOP at frame %d: gpu %.2f GB, free ram %.1f GB' % (fi, g / 1e9, f / 1e9))
                    ev(s, 'FILM.freeze(%r)' % (fi / FPS))
                    ev(s, WAIT)
                    r = s.call('Page.captureScreenshot', format='jpeg', quality=95)
                    p.stdin.write(base64.b64decode(r['data']))
                    done += 1
                    if fi % 24 == 0:
                        el = time.time() - t_start
                        print('\r  frame %d / %d  (%.2f s/frame, eta %.0f min)' % (fi, f_to, el / done, el / done * (f_to - fi) / 60), end='', flush=True)
            finally:
                p.stdin.close(); p.wait()
            os.replace(fn + '.part.mp4', fn)
            segs_run += 1
        print('\nvideo segments done')
    finally:
        try:
            ev(s, "document.body.classList.remove('nohud'); FILM.unfreeze(); 1")
        except Exception:
            pass


def mux():
    segs = sorted(f for f in os.listdir(OUT) if f.startswith('seg_') and f.endswith('.mp4') and '.part' not in f)
    lst = os.path.join(OUT, 'segs.txt')
    open(lst, 'w').write(''.join("file '%s'\n" % f for f in segs))
    out = os.path.join(OUT, 'VESTIGE.mp4')
    cmd = [ffmpeg(), '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', lst]
    wav = os.path.join(OUT, 'audio.wav')
    if os.path.exists(wav):
        cmd += ['-i', wav, '-c:a', 'aac', '-b:a', '256k', '-shortest']
    cmd += ['-c:v', 'copy', '-movflags', '+faststart', out]
    subprocess.check_call(cmd)
    print('wrote', out, os.path.getsize(out) // (1 << 20), 'MB')


if __name__ == '__main__':
    c = sys.argv[1]
    if c == 'audio': audio()
    elif c == 'video':
        for attempt in range(8):                 # stalls / CDP timeouts: reconnect, reload the same tab, resume
            try:
                video(*(int(x) for x in sys.argv[2:4])); break
            except SystemExit:
                raise
            except Exception as e:
                print('\n  attempt %d failed: %s -> retrying in 10 s' % (attempt + 1, repr(e)[:200]), flush=True)
                time.sleep(10)
        else:
            sys.exit('STOP: too many failures')
    elif c == 'mux': mux()
    else: sys.exit(__doc__)
