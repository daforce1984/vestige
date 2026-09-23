"""Generate the film's music cues with a MiniMax Music 3 ComfyUI workflow (API-format JSON exported from ComfyUI;
not included in the repository).
usage: comfy_music.py [cue_id ...]   env COMFY=http://192.168.0.148:8188 WORKFLOW=path/to/workflow.json SEED=..."""
import json, os, sys, time, random, urllib.request, urllib.parse
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = os.environ.get('COMFY', 'http://192.168.0.148:8188')
WF = json.load(open(os.environ.get('WORKFLOW', os.path.join(ROOT, 'audio_minimax_music_3.json'))))
CUES = json.load(open(os.path.join(ROOT, 'assets', 'music', 'cues.json')))
want = set(sys.argv[1:])

def req(path, data=None, timeout=60):
    r = urllib.request.Request(BASE + path, data=json.dumps(data).encode() if data is not None else None,
                               headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(r, timeout=timeout) as f:
        return f.read()

for cue in CUES:
    if want and cue['id'] not in want: continue
    wf = json.loads(json.dumps(WF))
    wf['37:13']['inputs']['caption'] = cue['caption']
    wf['37:13']['inputs']['lyrics'] = cue['lyrics']
    wf['37:13']['inputs']['max_duration'] = float(cue['dur'])
    seed = int(os.environ.get('SEED', random.randrange(1, 2**48)))
    wf['37:38']['inputs']['seed'] = seed
    wf['35']['inputs']['filename_prefix'] = f"audio/hwfilm_{cue['id']}"
    pid = json.loads(req('/prompt', {'prompt': wf, 'client_id': 'hwfilm'}))['prompt_id']
    print(cue['id'], 'queued', pid, 'seed', seed, flush=True)
    t0 = time.time()
    while True:
        time.sleep(4)
        h = json.loads(req('/history/' + pid))
        if pid in h:
            st = h[pid].get('status', {})
            if st.get('status_str') == 'error':
                print(cue['id'], 'ERROR', json.dumps(st)[:800], flush=True); break
            outs = [a for o in h[pid]['outputs'].values() for a in o.get('audio', [])]
            if outs:
                a = outs[0]
                q = urllib.parse.urlencode({'filename': a['filename'], 'subfolder': a.get('subfolder', ''), 'type': a.get('type', 'output')})
                dst = os.path.join(ROOT, 'assets', 'music', cue['id'] + '.mp3')
                if os.path.exists(dst): os.replace(dst, dst.replace('.mp3', f'.prev{int(time.time())}.mp3'))
                open(dst, 'wb').write(req('/view?' + q, timeout=300))
                print(cue['id'], 'saved', dst, f'{time.time() - t0:.0f}s', flush=True)
                break
        if time.time() - t0 > 1800:
            print(cue['id'], 'TIMEOUT', flush=True); break
