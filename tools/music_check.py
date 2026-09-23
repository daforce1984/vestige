"""Objective checks for generated music cues: duration vs slot, loudness, vocal-like content (Whisper VAD), spectrogram.
usage: uv run --with faster-whisper --with imageio-ffmpeg tools/music_check.py [files...]"""
import sys, json, re, subprocess, os, glob
import imageio_ffmpeg
from faster_whisper import WhisperModel
FF = imageio_ffmpeg.get_ffmpeg_exe()
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
cues = {c['id']: c for c in json.load(open(os.path.join(ROOT, 'assets/music/cues.json')))}
order = list(cues)
m = WhisperModel('small.en', device='cpu', compute_type='int8')
files = sys.argv[1:] or sorted(glob.glob(os.path.join(ROOT, 'assets/music/*.mp3')))
for f in files:
    cid = re.sub(r'_take\d+$', '', os.path.basename(f).split('.')[0])
    c = cues.get(cid)
    o = subprocess.run([FF, '-hide_banner', '-i', f, '-af', 'volumedetect,ebur128', '-f', 'null', '-'], capture_output=True, text=True).stderr
    d = re.search(r'Duration: (\d+):(\d+):([\d.]+)', o); dur = int(d[2]) * 60 + float(d[3])
    lufs = re.findall(r'I:\s+(-?[\d.]+) LUFS', o)
    slot = None
    if c:
        nxt = [cues[k]['t'] for k in order if cues[k]['t'] > c['t']]
        slot = (c.get('end') or (min(nxt) if nxt else 372)) - c['t']
    segs, _ = m.transcribe(f, beam_size=1, vad_filter=True)
    voc = [(round(s.start), round(s.end)) for s in segs if s.no_speech_prob < 0.5 and s.avg_logprob > -0.8]
    subprocess.run([FF, '-hide_banner', '-loglevel', 'error', '-y', '-i', f, '-lavfi', 'showspectrumpic=s=1000x300:legend=0:scale=log', f'/tmp/claude-1000/spec_{os.path.basename(f)}.png'])
    print(f"{os.path.basename(f):28s} dur={dur:6.1f}s slot={slot and round(slot, 1)} {'SHORT' if slot and dur < slot else ''} LUFS={lufs[-1] if lufs else '?'} vocal-like={voc}", flush=True)
