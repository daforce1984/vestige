"""Build runtime SFX (assets/sfx/) from the Pixabay sources (assets/sfx_src/).

Run:  uv run --with numpy --with imageio-ffmpeg python tools/build_sfx.py

Per file: decode → trim → mono/stereo → fades (one-shots) or crossfaded seamless loop (ambiences)
→ loudness normalisation (EBU R128 via ffmpeg) with a -1 dBFS sample-peak cap → 44.1 kHz MP3 160 kbps.
Writes assets/sfx/sfx.json (runtime sample table: duration, channels, slices, loop points) and CREDITS.md.

Loops are stored as  [tail margin | seamless cycle of length L | head margin]  (cyclic padding, M s each
side); the runtime loops [M, M+L]. Because the padding is cyclic, any window of length L inside the file
is seamless, so MP3 encoder delay/padding can't produce a click at the loop point.
"""
import json, re, subprocess, os, sys
import numpy as np
import imageio_ffmpeg

FF = imageio_ffmpeg.get_ffmpeg_exe()
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'sfx_src')
OUT = os.path.join(ROOT, 'assets', 'sfx')
SR = 44100
LOOP_MARGIN = 0.25
ONESHOT_TARGET = -14.0     # LUFS, max short-term
PEAK_CAP = -1.0            # dBFS sample peak

# name: (source start, end) [s], stereo?, kind ('one' | 'loop'), options
#   target : loudness target (one: max short-term LUFS; loop: integrated LUFS)
#   slices : {slice: (src_start, dur)} in SOURCE seconds; converted to output seconds
#   hit    : source time of the "moment" (the runtime can align it to the cue time)
#   loop   : cycle length L (s), taken from `start`, crossfade X
#   comp   : [(src_start, dur), ...] compile these source regions back-to-back (gap 0.25 s) → slices s0..sn
SPEC = {
    'expl_epic':      dict(seg=(0.0, 2.7),  st=False, kind='one'),
    'boom_cine':      dict(seg=(0.38, 5.5), st=False, kind='one'),
    'hit_heavy':      dict(seg=(0.18, 5.0), st=False, kind='one'),
    'expl_metal':     dict(seg=(0.45, 5.6), st=False, kind='one'),
    'expl_distant_huge': dict(seg=(0.0, 9.0), st=False, kind='one', target=-17),
    'expl_distant':   dict(seg=(0.0, 5.2),  st=False, kind='one', target=-17),
    'expl_nuke':      dict(seg=(0.0, 7.5),  st=True,  kind='one'),
    'shockwave':      dict(seg=(0.0, 1.5),  st=False, kind='one'),
    'expl_debris':    dict(seg=(0.0, 2.7),  st=False, kind='one'),
    'debris_impact':  dict(seg=(0.2, 7.0),  st=True,  kind='one', hit=1.0),
    'laser_shot':     dict(seg=(0.0, 1.0),  st=False, kind='one'),
    'laser_shot2':    dict(seg=(0.0, 4.5),  st=False, kind='one'),
    'laser_cannon':   dict(st=False, kind='one', comp=[(0.0, 1.8), (5.4, 1.7), (9.1, 1.8), (10.95, 1.8), (12.95, 1.8), (24.6, 1.9)]),
    'big_beam':       dict(seg=(0.0, 6.25), st=False, kind='one', hit=2.85, slices={'fire': (2.7, 3.55)}),
    'charge_up':      dict(seg=(0.0, 1.25), st=False, kind='one'),
    'charge_weapon':  dict(seg=(0.0, 8.4),  st=False, kind='one', target=-16),
    'alarm':          dict(seg=(0.0, 11.1), st=False, kind='one', target=-18),
    'alarm_amb':      dict(seg=(0.0, 18.8), st=True,  kind='loop', start=1.0, loop=12.0, xf=1.2, target=-27),
    'hyperspace':     dict(seg=(34.0, 47.0), st=True, kind='one', target=-16),
    'hyperspace_boom': dict(seg=(0.0, 17.0), st=True, kind='one', hit=7.2, slices={'boom': (7.0, 10.0), 'roar': (3.2, 13.8)}),
    'flyby_large':    dict(seg=(0.2, 7.7),  st=False, kind='one', hit=2.0),
    'flyby_fast':     dict(seg=(0.0, 5.5),  st=False, kind='one', hit=2.8),
    'flyby_short':    dict(seg=(0.0, 6.5),  st=False, kind='one', hit=2.8),
    'missile':        dict(seg=(0.0, 2.5),  st=False, kind='one'),
    'minigun':        dict(seg=(1.0, 9.0),  st=False, kind='one'),
    'heavy_mg':       dict(seg=(0.0, 2.9),  st=False, kind='one'),
    'metal_groan':    dict(seg=(0.0, 6.2),  st=False, kind='one'),
    'power_down':     dict(seg=(0.0, 1.8),  st=False, kind='one'),
    'heartbeat':      dict(st=False, kind='one', target=-16, comp=[(0.3, 1.35), (1.8, 1.35), (3.3, 1.3)]),
    'tinnitus':       dict(seg=(0.0, 10.0), st=False, kind='one', target=-24),
    'space_amb':      dict(seg=(0.0, 84.0), st=True,  kind='loop', start=6.0, loop=22.0, xf=3.0, target=-30),
    'mech_powerup':   dict(seg=(0.0, 3.4),  st=False, kind='one'),
    'servo':          dict(seg=(0.0, 1.6),  st=False, kind='one'),
    'mech_steps':     dict(seg=(0.0, 4.9),  st=False, kind='one', target=-16, slices={'four': (0.95, 2.1)}),
    'saber_ignite':   dict(seg=(0.0, 1.6),  st=False, kind='one'),
    'saber_hum':      dict(seg=(0.0, 58.0), st=False, kind='loop', start=10.0, loop=12.0, xf=1.0, target=-20),
    'black_hole':     dict(seg=(0.0, 82.0), st=False, kind='loop', start=8.0, loop=24.0, xf=3.0, target=-24),
    'rumble':         dict(seg=(0.2, 5.5),  st=False, kind='one'),
    'rumble_dark':    dict(seg=(0.0, 56.0), st=False, kind='loop', start=6.0, loop=20.0, xf=2.5, target=-24),
    'whoosh':         dict(seg=(0.2, 14.8), st=False, kind='one', slices={'a': (0.2, 4.3), 'b': (4.55, 3.55), 'c': (8.1, 6.7)}),
    'whoosh_rev':     dict(seg=(0.0, 2.1),  st=False, kind='one', hit=1.45),
    'braam':          dict(seg=(0.0, 3.2),  st=True,  kind='one'),
    'braam2':         dict(seg=(0.6, 6.4),  st=True,  kind='one'),
    # ---- v4: the user's own ../homeland/static sounds + heavy beam layers
    'atomic_impact':  dict(seg=(0.0, 3.4), st=True, kind='one'),
    'warp_out2':      dict(raw=True, kind='one', hit=0.0),                        # hyperspace in/out: the user's file, untouched (full length, full level)
    'beam':           dict(seg=(0.0, 6.3), st=False, kind='one', hit=0.8),        # main ion cannon firing (from ../homeland)
    'typing':         dict(seg=(0.55, 2.3), st=False, kind='one', target=-22),               # title-card typing (from ../homeland)
    'axe_metal1':     dict(seg=(0.03, 1.5), st=False, kind='one', hit=0.1),        # mech impacts (Pixabay, Yodguard)
    'axe_metal3':     dict(seg=(0.03, 1.8), st=False, kind='one', hit=0.1),
    'metal_crush':    dict(seg=(0.3, 2.0), st=False, kind='one', hit=0.5),         # armour crumpling (Pixabay, Soumages)
    'metal_knock':    dict(seg=(0.0, 0.8), st=False, kind='one', hit=0.05),        # weapon clash / block (Pixabay, EdR)
    'metal_door':     dict(seg=(0.08, 4.4), st=False, kind='one', hit=0.15),       # the finisher's huge clang (Pixabay, AudioPapkin)                # hyperspace in/out: trimmed to the hit + 3 s tail                # hyperspace in/out (Pixabay 'Atomic Impact', SoundReality)
    'hl_warp_out':    dict(seg=(0.0, 11.0), st=False, kind='one'),               # hyperspace exit (homeland 'warp')
    'hl_warp_out2':   dict(seg=(0.0, 1.5),  st=False, kind='one'),               # short version (small ships)
    'hl_warp_in':     dict(alias='hl_warp_out'),                                 # byte-identical source
    'hl_warp_in2':    dict(alias='hl_warp_out2'),                                # byte-identical source
    'hl_big_explosion': dict(seg=(0.0, 7.25), st=False, kind='one'),             # capital ship reactor blast
    'hl_explosion':   dict(seg=(0.0, 2.85), st=False, kind='one'),               # standard kill
    'heavy_beam':     dict(seg=(0.0, 7.7),  st=False, kind='one'),               # heavy beam weapon (attack)
    'hl_beam':        dict(seg=(0.0, 7.7),  st=False, kind='loop', start=2.2, loop=2.8, xf=0.6, target=-15),  # sustained beam body
    'beam_blast1':    dict(seg=(0.0, 3.02), st=False, kind='one', hit=2.25),
    'beam_blast4':    dict(seg=(0.0, 3.02), st=False, kind='one', hit=1.8),
    'hl_charge':      dict(alias='charge_weapon'),                               # byte-identical source
    'hl_charge2':     dict(seg=(0.8, 19.85), st=False, kind='one', target=-16),
    'hl_thruster':    dict(seg=(0.0, 8.05), st=True, kind='loop', start=0.5, loop=6.5, xf=1.0, target=-22),
    'hl_thruster2':   dict(alias='hl_thruster'),                                 # byte-identical source
}


def decode(name):
    raw = subprocess.run([FF, '-v', 'quiet', '-i', os.path.join(SRC, name + '.mp3'), '-ac', '2', '-ar', str(SR),
                          '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2).copy()


def lufs(x):
    """(integrated, max short-term) via ffmpeg ebur128 on float PCM."""
    ch = x.shape[1]
    p = subprocess.run([FF, '-hide_banner', '-f', 'f32le', '-ar', str(SR), '-ac', str(ch), '-i', '-',
                        '-af', 'ebur128', '-f', 'null', '-'], input=x.astype(np.float32).tobytes(),
                       capture_output=True)
    err = p.stderr.decode(errors='ignore')
    S = [float(v) for v in re.findall(r'S:\s*(-?[\d.]+)', err)]
    I = re.findall(r'I:\s+(-?[\d.]+) LUFS', err)
    return (float(I[-1]) if I else -70.0), (max(S) if S else -70.0)


def fade(x, fi, fo):
    n = len(x)
    a, b = int(fi * SR), int(fo * SR)
    if a > 0: x[:a] *= np.linspace(0, 1, a)[:, None]
    if b > 0: x[n - b:] *= (np.linspace(1, 0, b) ** 2)[:, None]
    return x


def tail_trim(x, floor_db=-62):
    env = np.sqrt(np.convolve((x ** 2).mean(1), np.ones(441) / 441, 'same'))
    idx = np.where(20 * np.log10(env + 1e-12) > floor_db)[0]
    return x[: (idx[-1] + int(0.05 * SR)) if len(idx) else len(x)]


def encode(x, path):
    ch = x.shape[1]
    subprocess.run([FF, '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', str(ch), '-i', '-',
                    '-c:a', 'libmp3lame', '-b:a', '160k', '-ar', str(SR), path],
                   input=x.astype(np.float32).tobytes(), check=True)


def main():
    os.makedirs(OUT, exist_ok=True)
    man = {m['name']: m for m in json.load(open(os.path.join(SRC, 'manifest.json')))}
    table, credits = {}, []
    for name, sp in SPEC.items():
        if sp.get('alias'):
            table[name] = {'alias': sp['alias']}
            credits.append((name, man.get(name) or man.get('hl_*', {}), [f"alias of {sp['alias']}.mp3 — the source file is byte-identical, so no separate file is built"], 0.0))
            continue
        if sp.get('raw'):                     # the user's own file, copied byte for byte (no trim, no level change)
            import shutil
            shutil.copyfile(os.path.join(SRC, name + '.mp3'), os.path.join(OUT, name + '.mp3'))
            d = len(decode(name)) / SR
            table[name] = {'file': name + '.mp3', 'ch': 2, 'kind': sp.get('kind', 'one'), 'hit': sp.get('hit', 0.0), 'dur': round(d, 4)}
            credits.append((name, man.get(name) or man.get('hl_*', {}), ['used as is (untrimmed, original level)'], 0.0))
            continue
        src = decode(name)
        edits = []
        slices = {}
        if sp.get('comp'):
            parts, t = [], 0.0
            for i, (s0, d) in enumerate(sp['comp']):
                seg = fade(src[int(s0 * SR): int((s0 + d) * SR)].copy(), 0.003, min(0.3, d * 0.25))
                slices[f's{i}'] = [round(t, 4), round(len(seg) / SR, 4)]
                parts += [seg, np.zeros((int(0.25 * SR), 2), np.float32)]
                t += len(seg) / SR + 0.25
            x = np.concatenate(parts)
            edits.append('compiled regions ' + ', '.join(f'{a:.2f}–{a + d:.2f}s' for a, d in sp['comp']) + ' back-to-back (0.25 s gaps) as slices s0…s%d' % (len(sp['comp']) - 1))
            s0 = 0.0
        else:
            s0, s1 = sp['seg']
            x = src[int(s0 * SR): int(s1 * SR)].copy()
            edits.append(f'trimmed to {s0:.2f}–{min(s1, len(src) / SR):.2f} s of the source')
        x = x.mean(1, keepdims=True) if not sp['st'] else x
        edits.append('stereo' if sp['st'] else 'mono (runtime panning)')
        entry = {'file': name + '.mp3', 'ch': x.shape[1]}
        if sp['kind'] == 'loop':
            a = int((sp['start'] - s0) * SR)
            L, X = int(sp['loop'] * SR), int(sp['xf'] * SR)
            body = x[a: a + L + X].copy()
            w = np.linspace(0, 1, X)[:, None]
            cyc = body[:L].copy()
            cyc[:X] = body[:X] * np.sqrt(w) + body[L:L + X] * np.sqrt(1 - w)   # equal-power crossfade
            M = int(LOOP_MARGIN * SR)
            x = np.concatenate([cyc[-M:], cyc, cyc[:M]])
            I, S = lufs(np.concatenate([cyc, cyc]))
            gain = sp.get('target', -24) - I
            entry['loop'] = [LOOP_MARGIN, sp['loop']]
            entry['kind'] = 'loop'
            edits.append(f"seamless {sp['loop']:.1f} s loop from source {sp['start']:.1f} s, {sp['xf']:.1f} s equal-power crossfade, "
                         f"{LOOP_MARGIN} s cyclic padding each side (runtime loops [{LOOP_MARGIN}, {LOOP_MARGIN + sp['loop']:.2f}] s)")
            edits.append(f"normalised to {sp.get('target', -24)} LUFS integrated")
        else:
            if not sp.get('comp'):
                x = tail_trim(x)
                x = fade(x, 0.003, min(0.5, len(x) / SR * 0.12))
                edits.append('3 ms fade-in, tail trimmed below −62 dB, fade-out')
            I, S = lufs(x)
            tgt = sp.get('target', ONESHOT_TARGET)
            gain = tgt - S
            entry['kind'] = 'one'
            edits.append(f'normalised to {tgt} LUFS max short-term')
        pk = 20 * np.log10(np.abs(x).max() + 1e-12)
        if pk + gain > PEAK_CAP:
            gain = PEAK_CAP - pk
            edits.append(f'gain capped by {PEAK_CAP} dBFS sample peak')
        x = (x * 10 ** (gain / 20)).astype(np.float32)
        for k, (a, d) in (sp.get('slices') or {}).items():
            slices[k] = [round(a - s0, 4), round(d, 4)]
        if slices: entry['slices'] = slices
        if 'hit' in sp: entry['hit'] = round(sp['hit'] - s0, 4)
        encode(x, os.path.join(OUT, name + '.mp3'))
        entry['dur'] = round(len(x) / SR, 4)
        table[name] = entry
        m = man.get(name) or (man.get('hl_*', {}) if name.startswith('hl_') else {})
        credits.append((name, m, edits, gain))
        print(f'{name:18s} {entry["dur"]:6.2f}s ch={entry["ch"]} gain={gain:+5.1f} dB  {entry.get("slices", "")}{entry.get("loop", "")}')
    json.dump({'sampleRate': SR, 'samples': table}, open(os.path.join(OUT, 'sfx.json'), 'w'), indent=1)
    with open(os.path.join(OUT, 'CREDITS.md'), 'w', encoding='utf-8') as f:
        f.write('# SFX credits and edits\n\nSources are from Pixabay (Pixabay Content License, https://pixabay.com/service/license-summary/), except the `hl_*` files, which come from the user\'s own project `../homeland/static`.\n'
                'Runtime files were produced by `tools/build_sfx.py` from `assets/sfx_src/` (44.1 kHz MP3, 160 kbps).\n'
                'Loudness is measured with EBU R128 (ffmpeg `ebur128`); gain is capped at −1 dBFS sample peak.\n\n')
        for name, m, edits, gain in credits:
            src_sha = __import__('hashlib').sha256(open(os.path.join(SRC, name + '.mp3'), 'rb').read()).hexdigest()
            if name.startswith('hl_'):
                f.write(f"## {name}\n- Source: `static/{name[3:]}.mp3` from the user's own project `../homeland` (local asset, not Pixabay)\n")
            else:
                f.write(f"## {name}.mp3\n- Source: **{m.get('title', '?')}** by **{m.get('author', '?')}**, {m.get('page', '?')}\n")
            f.write(f"- Source file: `sfx_src/{name}.mp3`, sha256 `{src_sha}`\n")
            for e in edits: f.write(f'- {e}\n')
            f.write(f'- Applied gain: {gain:+.1f} dB\n\n')


if __name__ == '__main__':
    main()
