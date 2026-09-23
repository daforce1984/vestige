# Mech duel 160–200 s: reference study + beat sheet

Implementation: `js/duel.js`. Previews: `blender/previews/duel_*.png`, made with `blender/duel_dump.mjs` and `blender/duel_preview.py`.
The references were studied only for timing, rhythm, camera distance and body mechanics. No designs were copied.

## References

| role | clip | parts studied |
|---|---|---|
| **PRIMARY** | Secret Level, Armored Core "Locked In" (Prime Video): https://www.youtube.com/watch?v=TiQCkRQwEqk | 36–84 s at 10 fps (brightened), plus a cut list |
| secondary | Mobile Suit Gundam 00, Masurao vs Susanowo: https://www.youtube.com/watch?v=-EAfZeIDL9Y | 56–82 s and 104–130 s at 10 fps (sword exchanges, blade lock) |
| secondary | Pacific Rim (2013), Gipsy Danger vs Otachi: https://www.youtube.com/watch?v=AYQjmj7cSM0 | 164–174 s at 10 fps (weight of a heavy sword finish) |

### What AC "Locked In" does (measured from frames)
- **Boost ignition tell.** Before a big dash the rear boosters flare for about 0.3–0.4 s (36.3→36.7). Then the mech leaves the frame fast (~1.3 s hold, rear view). *Used for E1's assault charge: 176.65–176.95 crouch + flare, then 40 m in 0.40 s.*
- **Quick-boost sidestep.** The mech covers about ¼ of the frame width in about 0.2 s (47.3→47.5), then drifts or holds. It stops hard, with no ease-in. *Used for E1's dodges (0.20 s, `out` ease) and the hero's jinks (0.2 s + roll impulse).*
- **Melee commit.** Blade raised for about 0.3 s of anticipation (52.3→52.6, 75.3→75.6). The strike is 0.1–0.15 s of motion-blur smear. **The cut usually lands 1–2 frames after the strike**, on the aftermath: dust, staggering target, sparks (52.88, 75.79). *Used as micro-cuts and cut-on-impact.*
- **Hit-stop.** It is not a literal freeze. It is felt through an impact flash of 1–2 frames plus a 0.3–0.8 s held reaction or explosion frame. *Implemented as a short freeze (2–4 fr) with catch-up, plus `flash` and `shake` in the events.*
- **Ram / body blow.** The quick-boost in (0.3 s) cuts to a 0.2 s close-up and then a tracking shot of the slam (59.7→61.2). *Used for the shoulder charge and push kick.*
- **Camera language.**
  - Wide, near-static frames where the mechs are small and the quick-boosts happen inside the frame (46.3–48.8, 56.3–58.0).
  - Very close handheld frames for the grapples (69–73).
  - 0.05–0.4 s smear inserts at blade swipes (46.12→46.17, 49.5→49.7).
  - Heavy shake only on impacts.
- **Cut lengths.** Cut list: 36.1, 38.0, 40.0, 44.3, 46.1, 46.2, 48.8, 49.5, 52.9, 56.1, 60.6, 61.2, 61.3, 65.0, 67.3, 67.7, 69.0, 69.9, 73.0, 75.0, 75.7, 75.8. That gives a median of about 1.5–2.5 s, with micro-cuts of 0.05–0.5 s around impacts.

### Secondary notes
- **Gundam 00.**
  - A blade lock is held for about 3.6 s with continuous sparks (113.2–116.8).
  - A dash-in toward the camera takes 0.6 s (107.4–108.0), followed by an impact flash hold of about 0.6 s.
  - Smear frames last about 0.1 s.
- **Pacific Rim.** A heavy mech swing takes about 0.5 s. The finish drops through in about 0.7 s (171.7–172.4, 172.9–173.6). This is the weight model for the ATLAS pass-cut in slow motion.

## Numbers used
- **Anticipation:** 0.12–0.35 s real time. The slow-motion wind-up (191.3–191.9) is 0.6 s.
- **Strike:** 0.08–0.15 s, with `in` (cubic) easing into the contact.
- **Hit-stop:** 2–4 frames at 24 fps (0.083–0.167 s). The slow-motion parry holds 0.20 s and the decisive cut holds 0.33 s. Each hit-stop is followed by a catch-up of 0.1–0.5 s, so no anchor time moves (`HITSTOPS` + `warp()`).
- **Recovery:** 0.2–0.6 s, `out` (cubic) or `snap` (overshoot).
- **Combos:**
  - hero S1 → S2 → S3 (3 strikes in 0.85 s)
  - E1 slash → backhand, answered by knee → kick → shot
- **Melee spacing:** blade exchanges happen at 12–30 m hip to hip (18 m mechs). Body blows (knee, kick, shoulder) are at 4–9 m.

## Beat sheet (film time; ★ = audio anchor, unchanged)

| t | beat | attack / action | antic. | strike | hit-stop | recovery | camera cut | shake |
|---|---|---|---|---|---|---|---|---|
| 160–170 | fly-in | launch path; barrel roll 166.2–167.1; turns to face E1 169.3–170.3 | – | – | – | – | (existing S11d/S11e) | – |
| 170–171.6 | range | hero strafes, arm raises to aim; E1 drifts | – | – | – | – | D01 wide establish 1.6 s | handheld |
| ★171 | voice | | | | | | | |
| ★172 | shot 1 | E1 **quick-boosts** 14 m left 171.95–172.15 → miss; hero recoil | – | 0.20 | – | 0.38 | D02 OTS hero 1.0 s | 0.12 |
| 172.55 | jink | hero hops 9 m from the MG burst (+roll) | – | 0.23 | – | 0.45 | D03 E1 boost+MG 1.0 s | 0.12 |
| ★174 | shot 2 | E1 quick-boosts down 13 m → miss | – | 0.20 | – | 0.4 | D04 low hero 1.4 s | – |
| 175.25 | drop-hop | hero drops 7 m | – | 0.2 | – | 0.4 | D05 E1 medium 1.4 s | – |
| ★176.5 | shot 3 | E1 quick-boosts → miss, **ignition tell** 176.65–176.95 | 0.30 | – | – | – | D06 profile charge 1.1 s | – |
| 176.95–177.35 | assault boost | E1 charges 40 m (≈100 m/s, smear) | 0.30 | 0.40 | – | – | | |
| 177.6 | E1 horizontal slash | hero **sways** back 5 m under it (whiff) | 0.25 | 0.10 | – | 0.28 | **D07a insert 0.24 s** | 0.25 |
| 178.0 | E1 backhand | **blocked** on the hero's right forearm | 0.12 | 0.10 | 2 fr | 0.1 | D07b close 0.38 s | 0.6 |
| 178.2 | hero knee to gut | **hit**, E1 doubles over | 0.13 | 0.13 | 3 fr | 0.3 | D08 low impact 0.73 s | 0.8 |
| 178.55 | hero push kick | **hit**, E1 flung 12 m | 0.08 | 0.08 | 2–3 fr | 0.45 | (same) | 0.9 |
| ★179 | point-blank shot | arm snaps up 178.55–178.78, fires; E1 jolts and tumbles | 0.22 | – | – | – | D09 OTS 0.75 s | 0.45 |
| ★180.2 | E1 explodes | hero shoved 6 m, shields face | – | – | – | 0.7 | D10 1.3 s | 1.0 |
| ★181 | "Above—!" | head/torso snap up (snap ease) | – | 0.2 | – | – | D11 hero looks up 1.3 s | – |
| 181–184.35 | E2 dive | E2 dives from 320 m; hero boosts to intercept | – | – | – | – | D12 from under 1.4 s | – |
| ★184 | saber ignite | left arm forward, blade on at 184.35 | 0.35 | – | – | – | D13 hilt close-up 0.85 s | – |
| 184.5 | dive plunge | **clash**, hero high block, driven down 4 m | 0.3 | 0.15 | 4 fr | 0.75 (E2 back-flip) | D14 wide 0.95 s | 1.0 |
| 185.45–186.0 | hero dash + raise | 8 m dash in, blade overhead | 0.40 | 0.15 | | | D15 profile 0.9 s | |
| ★186.0 | S1 diagonal | **clash**, E2 side-block | | | 2–3 fr | 0.15 | | 0.8 |
| 186.45 | S2 backhand | **clash**, E2 cross-block | 0.15 | 0.10 | 2 fr | 0.15 | D16 OTS E2 0.7 s | 0.6 |
| 186.85 | S3 thrust | E2 **side-steps** 10 m (quick-boost, whiff) | 0.12 | 0.13 | – | 0.2 | | 0.2 |
| 187.2 | E2 counter | horizontal cut; hero **ducks** 5 m (clears by 4 m) | 0.15 | 0.15 | – | 0.15 | D17 low angle 0.75 s | 0.2 |
| 187.6 | E2 overhead | **clash**, hero snap high block | 0.13 | 0.13 | 2–3 fr | 0.35 | | 0.8 |
| 188.2 | hero shoulder charge | **hit**, E2 flung 13 m | 0.25 | 0.25 | 3 fr | 0.35 | D18 wide 0.75 s | 0.9 |
| 188.85–189.35 | bind | **blade lock**, grinding sparks every 0.1 s | 0.3 | 0.15 | 2 fr | – | D19 lock close-up 0.9 s | 0.4 |
| 189.45 | E2 kick | **hit** on hero, lock broken, hero knocked 11 m | 0.08 | 0.08 | 2–3 fr | 0.35 | D20 0.6 s | 0.8 |
| 190–194.6 | **SLOW MOTION** | ≈4× authored durations | | | | | | |
| 190.0–190.9 | E2 killing thrust | dash 10 m | 0.1 | 0.9 (slow) | – | – | D21 OTS 1.4 s | |
| 190.9 | hero parry | **clash**, thrust deflected, E2 over-extends | 0.45 | 0.45 | 0.20 s | 0.35 | | 0.7 |
| 191.3–191.9 | side-step + iai wind | blade low across the body | 0.6 | – | – | – | D22 low tracking 0.8 s | |
| **192.4** | **decisive pass-cut** | hero dashes 12 m past E2's side, horizontal cut through the torso | | 0.5 (slow) | 0.33 s | 1.2 follow-through | D23 THE CUT 0.8 s | 1.0 |
| 192.4–194 | E2 dies | jolt, slump, eye flicker, saber off 192.6–193.0 | | | | | D24 walk-away 1.6 s | |
| ★194 | E2 explodes | behind the hero, 33 m away | | | | | | 1.2 |
| 194.6–200 | aftermath | blends into the old gundamState 194–226 formula (identical at 200) | | | | | D25 2.6 s, D26 2.8 s | handheld |

Cut lengths used (170–200): 1.6, 1.0, 1.0, 1.4, 1.4, 1.1, 0.24, 0.38, 0.73, 0.75, 1.3, 1.3, 1.4, 0.85, 0.95, 0.9, 0.7, 0.75, 0.75, 0.9, 0.6, 1.4, 0.8, 0.8, 1.6, 2.6, 2.8 s.

## Precision / verification
- **Contact solver.** `SOLVE` in `duel.js` refines the key poses and positions at every contact time using coordinate descent over forward kinematics identical to the renderer and `msMatrix`. Results:
  - Blade-on-blade gaps: 0.00 m.
  - Forearm block: 0.19 m.
  - Knee and kick: 0.8–1.35 m to the chest surface.
  - Shoulder: 3.96 m, pivot to chest (the armour is about 4 m).
  - Cut: through the torso at 35–65 % of the blade.
- **Sanity check** at 24 fps over 160–200: no NaN; all joints within `JOINT_LIMITS` (also clamped on output); melee distance in range; warp is monotonic; no hit-stop overlaps an anchor; E1 and E2 are visible exactly up to 180.2 and 194; the saber lights at 184; the position is continuous at the 200 s hand-over.

## Revision 2: fluid, high-end anime motion + real rifle aim

### Motion system (js/duel.js)
- **Interpolation.** Every joint, the root position and the root pitch/yaw/roll channels use cubic Hermite through the keys.
  - Tangents are non-uniform Catmull-Rom, clamped per channel so a pose never wobbles past a key.
  - The whole curve is C1 everywhere except at impacts.
  - An anticipation apex (a key followed by a strike) has zero velocity, so the wind-up settles and then explodes.
  - A strike arrives at 1.6× its segment slope.
  - At an impact the outgoing tangent is 0. The hit-stop then freezes, and the release is eased: `warp()` is now a Hermite offset, so playback speed ramps 0 → >1 → 1.
- **Overlapping action and settle.** Each part group is driven through a damped spring (see `GROUPS`). The output is the key curve minus a step-response convolution, so it lags, overshoots and settles with 2–3 wobbles.

  | group | lead | ω | ζ | note |
  |---|---|---|---|---|
  | torso / pelvis / root | leads (0 fr) | 24 | 0.5 | |
  | upper arms | +1 fr | 22 | 0.45 | |
  | forearms | +2 fr | 18 | | |
  | hands | +3 fr | 15 | | |
  | head | | 11 | 0.62 | stabilises against the torso |
  | legs | +1 fr | | | |

  Hips counter-rotate against the chest twist. The root position has its own spring (ω 15, ζ 0.55), which gives the overshoot and settle after dashes.
- **Crisp impacts.** The filters fade to 0 within about 0.15 s of every impact, shot and fast whiff. Contacts stay exact and snappy, and the follow-through blends back in after the release.
- **Arcs.** Dash segments longer than 6 m bulge sideways and upward by 14 % of their length (max 6 m, sin² profile, C1). Boost paths curve instead of running straight.
- **Anticipation squash.** Before every fast dash (over 7 m at more than 28 m/s) a crouch is generated automatically from the position keys: legs load, torso folds, over the 0.2 s before launch.
- **Micro-motion.** Continuous thruster-hover bob, chest breathing, head drift and weight shifts. These are sums of sines in real time, so even hit-stop holds tremble slightly.
- **Joint limits.** Soft limits (tanh over the last 8°) replace hard clamps, so there are no kinks at the stops.

### Rifle (hero)
- **Rig.**
  - `rifle` mesh on `hand_R` at [-0.10266, -1.69395, 0.25666]; `rifle_muzzle` at [0, 0.55, 8.4] on the rifle. Both are read from assets/gundam.glb.
  - The barrel is the rifle's local +Z. The sanity check compares these offsets against the GLB.
- **Poses.**
  - `aimRifle`: one-handed aim with the arm at shoulder height, elbow slightly bent and wrist about +90° to level the barrel.
  - `aimLow`: low-ready between shots.
- **Timing per shot (172 / 174 / 176.5 / 179).**
  - Raise about 0.3 s before the shot, then a steady 0.12 s hold, then the shot.
  - Recoil kick: hand up and back, torso rocks, then a damped spring settle.
  - Lowered to low-ready for the jink and the drop-hop.
  - The point-blank shot comes 0.3 s after the push kick.
- **Aim solve.** At each shot the solver turns the arm, wrist and chest so the barrel points exactly at the target:
  - E1's chest 0.1 s before it quick-boosts, for the misses;
  - E1's chest at 179, for the hit.
  - Aim errors are 0.04–0.12°.
- **Exports.** `duelMuzzle(t)` → {pos, dir}; `DUEL_SHOTS` → [{t, from, dir, to, hit, aimError}]; `RIFLE_T`, `MUZZLE_T`, `SHOT_TIMES`.

### Verification (24 fps sanity + 240 Hz differences)
- Checks pass: no NaN; joints within limits; melee spacing; anchors; hand-over continuity at 200; rifle offsets match the GLB; aim errors under 1°.
- **Outside impacts and strikes:**
  - Max joint angular velocity: 20.6 rad/s (the intended 0.9 s barrel roll).
  - Max joint angular acceleration: 369 rad/s² (the 0.08 s quick-boost roll during the MG jink).
  - Max root acceleration: about 800 m/s² (E1's 100 m/s assault-boost stop).
- **Probe results.** Accelerations are constant as h → 0 (no kinks). The only velocity breaks are the intended impact snaps.
- **Blade-through-body scan** (every blade against the opponent's body volumes, 48 Hz): only 3 sub-frame grazes remain, all within 0.01 s before the S2 and overhead clashes.
