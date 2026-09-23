# HOMEWORLD × GUNDAM — 중력의 저편 (BEYOND THE GRAVITY WELL)

Real-time WebGPU short film, ~6:12 (372 s). Models built in Blender (python, exported GLB),
rendered by a custom WebGPU engine (`js/`), score + SFX synthesized with WebAudio (`js/audio.js`).

## Story / shot list (film time in seconds)

### ACT I — EXODUS (0–62)
| id | t | shot |
|---|---|---|
| S1 | 0–14 | Black. Text: "케셀 성운 외곽 — 망명 선단, 표류 41년째". Stars fade in. Music: low choir drone, D minor. |
| S2 | 14–34 | Nebula vista, slow push. Mothership **KHAR-SAJUUK** crosses frame, camera dollies along the hull. Choir swells. |
| S3 | 34–48 | Hyperspace windows: 4 frigates emerge one after another at 36, 39, 42, 45 (whoosh each). Radio: "하이퍼스페이스 이탈 완료. 선단 전원 무사." |
| S4 | 48–62 | Hangar interior, Gundam RX-H1 standing on catapult, eyes dark. "RX-H1, 대기 중." Uneasy pulse starts at 55. |

### ACT II — THE WELL (62–120)
| S5 | 62–76 | Space ahead starts warping. Klaxon at 63. "경고: 전방 중력 이상 반응. 하이퍼드라이브 재충전 불가!" |
| S6 | 76–92 | Reveal of the enemy Gravity Well Generator (black core, violet ring). Einstein ring lensing. Deep sub-bass. |
| S7 | 92–108 | Enemy (crimson) fleet hyperspaces in behind: red windows at 93, 95, 97, dreadnought at 100 (big). Drums start at 96. "적 함대 출현! 후방을 잡혔다!" |
| S8 | 108–120 | Fleet turns to face. Brass ostinato. "전 함 전투 대형. 이온 캐논 충전." Charge whine 114–120. |

### ACT III — BATTLE (120–200)
| S9 | 120–134 | Ion cannon volley at 120.0 (massive hit), beams continue to 128. Enemy frigate explodes 124, 127. |
| S10 | 134–150 | Dogfight: fighters, tracers, missiles. Explosions 138, 141, 145, 148. |
| S11 | 150–170 | Gundam launch: hangar lights on 150, eyes ignite 153 (sting), "RX-H1 건담, 발진한다!" 156, catapult fire 158, fly-by 162. Heroic theme starts 158. |
| S12 | 170–200 | Gundam combat. Beam rifle shots 172, 174, 176.5, 179; enemy MS explodes 180. Beam-saber ignite 184, clash 186 (sparks), slow-motion 190–194, second enemy MS explodes 194. |

### ACT IV — GRAVITY LANCE (200–262)
| S13 | 200–216 | Dreadnought charges gravity lance; light sucked into its prow; rising dissonant choir 200–216. "적 주포에 고에너지 반응… 모선을 노린다!" |
| S14 | 216–226 | Lance fires at 216.0 (warped purple beam). Impact on mothership 217. Sound drops to tinnitus ring 218–224. |
| S15 | 226–240 | Mothership burning. "선체 32% 손실… 중력 우물을 끄지 않으면 전멸이다." Gundam turns: "…내가 간다." (236) |
| S16 | 240–262 | Gundam dives into the well. Extreme lensing, time dilation. Heartbeat 244–262 accelerating. |

### ACT V — SINGULARITY (262–320)
| S17 | 262–278 | Core. Saber max output 266 (roar), "끝이다!" 272, slash 273. |
| S18 | 278–292 | Implosion 278–280 (reverse suck), shockwave + white flash 280 (biggest boom). |
| S19 | 292–310 | Mothership main ion array charges 292–300, "주포, 발사!" 299, fires 300.0, dreadnought breaks 303, explodes 306. |
| S20 | 310–320 | Enemy survivors flee through red hyperspace windows 312, 314, 316. |

### ACT VI — HOMEWARD (320–372)
| S21 | 320–340 | Quiet. Debris. Damaged Gundam drifting, one eye flickering. "RX-H1… 응답하라." (324) … "…여기는 RX-H1. 귀환한다." (332) |
| S22 | 340–356 | Fleet forms up; hyperspace windows at 346, 348, 350, 352. Choir theme returns (Adagio feel). |
| S23 | 356–372 | Title card 356, credits, fade to black by 372. |

## Coordinate / asset contract

- All models: GLB in `assets/`, exported from Blender with +Y up (glTF). In **glTF space** ships face **+Z**
  (nose toward +Z), up is **+Y**. In Blender that means nose along **-Y**, up **+Z**.
- Materials: Principled BSDF only, no textures. Engine reads baseColorFactor, metallic, roughness,
  emissiveFactor (+ KHR_materials_emissive_strength). Material *names* matter for a few effects (see below).
- The engine adds procedural panel lines / greeble shading from object-space position, so
  surfaces can be flat-colored; silhouettes and mid-scale greebles must come from geometry.

| file | size (glTF units) | notes |
|---|---|---|
| mothership.glb | length ~600 along Z | Hiigaran look: sand/ivory hull, rust-red + blue accent stripes. Giant engine block at rear (-Z) with emissive nozzles (material `engine`). Forward prow with two long arms; main ion cannon at nose (empty named `main_cannon`). Side hangar opening (empty `hangar_exit` at opening, pointing +X). Many window strips (material `window`). |
| ion_frigate.glb | ~60 | long spine = cannon barrel, emissive muzzle ring (`muzzle`) at +Z tip, engines (`engine`) at -Z. Same palette as mothership. |
| assault_frigate.glb | ~45 | chunkier escort. |
| interceptor.glb | ~8 | small fighter, `engine` glow. |
| enemy_frigate.glb | ~55 | crimson/charcoal, sharp angular blades (Vaygr-like), `engine` orange-red. |
| enemy_dreadnought.glb | ~400 | crimson/black, forked prow; empty `lance_emitter` between forks at nose; `engine`. |
| enemy_fighter.glb | ~9 | crimson dart. |
| gundam.glb | height ~18 (feet at y=0) | RX-78 palette. Hierarchy below. Eyes material `eye`. |
| enemy_ms.glb | height ~18 | Zaku-like crimson mono-eye. Same hierarchy names. Eye material `eye`. |
| gravity_well.glb | ring diameter ~220 | nodes `ring` (rotates about Z), `core` (sphere r~25), `pylons`. Dark metal, violet emissive strips (`violet`). Ring axis = Z. |
| hangar.glb | tunnel 90 long (z -60..+30), 24 wide, 22 high | catapult deck, rails with emissive guide lights (`guide`), ceiling lamps (`lamp`), open at +Z. Gundam stands at origin on deck (y=0). |
| debris.glb | nodes `rock0..rock3` (asteroid chunks ~5–15) and `hull0..hull3` (twisted hull plates ~8) | each node centered at origin. |

### Mobile suit hierarchy (gundam.glb, enemy_ms.glb)
Each node's origin is its joint pivot; rest pose = standing, arms down. Parent → children:
```
ms_root (at hip center, y≈9)
  pelvis
    leg_L_upper (hip joint) → leg_L_lower (knee) → foot_L (ankle)
    leg_R_upper → leg_R_lower → foot_R
  torso (waist pivot)
    head (neck pivot)
    backpack (thrusters, emissive `engine` nozzles facing -Z)
    arm_L_upper (shoulder) → arm_L_lower (elbow) → hand_L (wrist) → saber_hilt
    arm_R_upper → arm_R_lower → hand_R → rifle (muzzle empty `rifle_muzzle`)
    shield attached to arm_L_lower
```
Left = +X side of the model (model faces +Z).

## Audio contract (`js/audio.js`)
ES module, default export `class Score`:
- `constructor()`; `async init()` (creates AudioContext, builds reverb etc.)
- `start(offset=0)` plays from film time `offset` (seconds) — schedules music & SFX from that point.
- `get time()` current film time (seconds) derived from `AudioContext.currentTime` — the film's master clock.
- `stop()`; `setVolume(v)`.
- Everything procedurally synthesized (no sample files). All cue times come from the shot list above,
  kept as an editable data table at the top of the file.
