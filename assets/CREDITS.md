# Asset credits

## Used in the film

| file | source asset | author | URL | license | modifications |
|---|---|---|---|---|---|
| `gundam.glb` (hero mecha "RX-H1") | ATLAS / 09 (`public/models/atlas-09.glb`) | Ramon Linares | https://github.com/RamonLinares/atlas-09 | CC0 1.0 (see repo `ASSET-LICENSE.md`) | Rest pose restored and animations dropped. Scaled to 18 u tall with feet at y=0. Skinned mesh split into rigid parts by dominant bone weight and re-parented to the SCRIPT.md hierarchy with joint pivots. Textures flattened into 5 k-means colour materials plus `core` (reactor glow) and `eye` (visor glow). Original split normals kept. Added a procedural thruster backpack with `engine` nozzles and a saber hilt in the left hand. `rifle` is an empty on the right hand; `rifle_muzzle` sits at the source `Muzzle_R` (forearm pulse cannon). |
| `enemy_ms.glb` = `enemy_vanguard.glb` (enemy mecha, from 2026-09-28 (2)) | VANGUARD / 07 (`public/models/vanguard-07.glb`) | Ramon Linares | https://github.com/RamonLinares/atlas-09 | CC0 1.0 | Same conversion; painted white / gunmetal / red (the pale armour → white, blue → dark gunmetal, red trim kept red; `blender/convert_mechs.py` `white()`); its beam rifle is its own `rifle` part on the right hand (`rifle_muzzle` at the source `Muzzle_Rifle`), the shield is split off the left forearm into a `shield` part (faces > 1.15 m from the forearm axis) so it can be shot away. |
| `js/motion_clips.js` (motion data) | the animation clips of ATLAS / 09, VANGUARD / 07, AETHER / 02, SERAPH / 03 | Ramon Linares | https://github.com/RamonLinares/atlas-09 | CC0 1.0 | Sampled at 24 fps and converted to per-part pose quaternions in the engine's part frames (`tools/extract_motion.py`); VANGUARD's RifleBurst / ShieldGuard / BoostJump / Backflip drive its poses in the duel. |
| `enemy_seraph.glb` (enemy mecha 2026-09-28, replaced by VANGUARD) | SERAPH / 03 (`public/models/seraph-03.glb`) | Ramon Linares | https://github.com/RamonLinares/atlas-09 | CC0 1.0 | Same conversion; wing chains (root, outer, five feathers) merged into rigid `wing_L` / `wing_R` parts hinged at the wing roots; the heavy beam cannon rides on `arm_R_lower` (the right hand is inside it: `hand_R` is an empty joint); its small orange panel lights kept as emissive (`em_thresh` 0.12). |
| `enemy_ms.glb` (enemy mecha) | RONIN / 04 (`public/models/ronin-04.glb`) | Ramon Linares | https://github.com/RamonLinares/atlas-09 | CC0 1.0 | Same conversion as above, scaled from 16 u to 18 u. The katana (right hand) is rotated to point forward so the engine's heat-blade beam lines up with it, and given a steel material. Emissive `eye` slits added on the face mask. Procedural thruster backpack added. `saber_hilt` and `rifle` are empties. |

Download and conversion: `blender/convert_mechs.py`. The source GLBs are in `assets/src/`.

## Music
All score stems in `assets/music/` (`A_promise` … `F_homeward`, `G_duel`, `H_duel_win`) are original instrumentals **generated with MiniMax Music 3** (run locally in ComfyUI) for this project — not stock or licensed tracks. Captions, section-tag lyrics, seeds and takes are in `assets/music/cues.json`; placement is in `assets/music/manifest.json`.
- `G_duel.mp3` (the mech duel, 2026-09-28): take `G_duel_t1`, seed 2026092811, 32.0 s; source FLAC sha256 `ad7549ea07483fcfd11c1f63bd752ffee1f104ced6481270c04f83d1ab20810a`. Exported at −1 dB, 224 kbps MP3.
- `H_duel_win.mp3` (the reactor hit and the win, 2026-09-28): take `H_win_t4`, seed 2026092824, 16.0 s; source FLAC sha256 `c28b167631d345fb56b78b11a636061885180619808ecc7579f2d2a3a4dfaa46`. Exported at −1 dB with a stray click in the first 20 ms muted, 224 kbps MP3.
- The source FLACs, graphs and ComfyUI receipts of these two cues (and their rejected takes) are kept locally in `assets/src/music/` (gitignored).

## Evaluated but not used (ships)
No CC0/CC-BY spaceship that downloads without a login came close to the v2 procedural ships (60–90k-triangle hulls with layered armor). Everything found was low-poly or stylized, and most of its look came from textures, which the engine cannot use. So the seven ship GLBs stay procedural (`blender/ships_*.py`, see `blender/DESIGN_NOTES.md`). What was checked:
- OpenGameArt "Spaceships" and "More spaceships" by UnnamedTuesday (CC-BY 3.0). About 3.5–7k triangles each, texture-dependent. Best case (with textures) rendered to `blender/previews/v3_candidate_*.png`.
  https://opengameart.org/content/spaceships-6, https://opengameart.org/content/more-spaceships
- OpenGameArt "3D Spaceships pack" (Inborn Ninja, CC0), "Starship corvette" (CC0), "Space themed turrets/cruiser" (CC0) — untextured low-poly.
- Polyy.AI "3D Spaceships Pack" 1 & 2 (CC0, itch.io) — low-poly fighters only.
- Poly Pizza / Quaternius / Kenney space kits (CC0) — low-poly and cartoon-style.
- Meshy (CC0 gallery) — needs a login to download, so skipped.
- Quaternius "Animated Mech Pack" (CC0, https://opengameart.org/content/animated-mech-pack) — downloaded (`assets/src/mechpack/`) but not used. Its stylized, texture-driven look loses too much when flattened, and the ATLAS/RONIN models are far more detailed.

## Homeworld ship models (searched 2026-09-23, none used)
The request was for downloadable Homeworld / Homeworld 2 / Remastered / HW3 ship models (mothership, ion/assault frigates, interceptor, Vaygr ships). **Nothing was both properly licensed and downloadable without logging in, so no ship was replaced.** The procedural v2 ships stay; since nothing changed, no v3_backup was needed.
- **Sketchfab** (e.g. "Kushan Mothership" by gavinpgamer1, "Beast Mothership" by ArcFlash marked CC-BY, and the collections by sevenupman / paulohmota):
  - The download API returns HTTP 401 without an account, so it needs a login.
  - The listed ones are uploads of the original game meshes (the Beast Mothership description credits Barking Dog/Sierra). An uploader's CC label can't license Gearbox/Relic/Sierra-owned assets.
  - Gearbox's own Sketchfab uploads (e.g. the Hiigaran Battle Cruiser) are view-only and copyrighted.
- **Thingiverse** (Hiigaran Interceptor thing:397216, "Homeworld: Hiigaran Faction" thing:2810070, Hiigaran Battlecruiser thing:2221712): the API needs authentication (401), so the licence and origin couldn't be verified without logging in. The descriptions say the models come from the game.
- **Cults3D / MakerWorld / STLFinder / 3dmdb / rigmodels:** these need a login, are STL models for 3D printing derived from game files, or are aggregators of ripped files.
- **Orbiter Forum "Homeworld 2 3d Ship Models":** explicitly extracted from the game files. That's a rip, so excluded.
- **ModDB mod pages:** mod assets inside mod packages, with no stand-alone permissive licence.
