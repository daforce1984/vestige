# Open requests (checked off as they are verified in Chrome)

- [x] 1. First-person barrier tear ≥10 s, hands only, head-cam shake + glitch, mech straining/breaking (timemap insert)
- [x] 2. Remove red eye streak from the first-person view
- [x] 3. Mech duel: fluid animation; rifle raised in hand, shots leave the rifle muzzle
- [x] 4. Mech paint: UV atlas + 2048 baked PBR (edge wear to silver metal, grime, scorch), no grid; visor recess fixed
- [x] 5. When the enemy first appears, both fleets already face each other
- [x] 6. Hyperspace in/out: ONLY the homeland effect
- [x] 7. Thruster flames bend smoothly along the flight path
- [x] 8. Mech thruster flames emit flying particles
- [x] 9. Mech combat SFX
- [x] 10. Hangar: PBR gunmetal + box-projected reflection, no grid, darker (was too bright)
- [x] 11. Catapult launch: depth of field + strong background motion blur (mech stays sharp)
- [x] 12. Weapon: beam saber → war mace (assets/mace.glb, tools/make_mace.py); fist grip with a natural wrist
- [x] 13. Mace blows crumple the target (world-space crush deformation in the mesh shader); decisive blow on RONIN #2 at 192.4
      lands exactly on the torso (solver residual ≈ 0), sparks/plates/shock ring/shake; berserk smash dents the well core at 273
- [x] 14. Real-time playthrough 140–285: 23.8–24.2 fps except 219–232 (~19–20 fps, heavy debris shots), JS heap flat 14–25 MB; README updated
- [x] 15. Removed the idle mech cut before the dreadnought charge (D25 aftermath → dreadnought shot)
- [x] 16. Gravity-well blast: hero no longer spins — slack body drifts back, shown from behind against the core light
- [x] 17. Cold open after the whip pan: camera ~260 m off the enemy line; fighters dogfight past the lens with bolt exchanges,
      close kills, crossing ion slugs, drifting debris, flak
- [x] 18. Every hyperspace exit (and jump-out) takes 1 s; mothership reveal is a far wide shot with a slow push-in
- [x] 19. Mothership redesign (dark arrowhead, greebled, swept sponsons, amber lights; reference image) — blender/ships_mothership_v9.py
- [x] 20. Lance GRAZES the starboard flank (no turn; deflected beam + sparks), wall melts into a gouge (molten rim, globs, sag),
      multi-deck interior cross-section visible (mother_bay.glb), crates/people spill out (bay_props.glb); bow cannon intact
- [x] 21. Dive into the well: fleet radio breaks up (broken-radio FX + 2 new garbled lines + static bed); livelier post
      (heartbeat gravity pulses, radial zoom blur, interference, CA, vignette); no swirl anywhere
- [x] 22. Visor ignition: flicker → flare → steady glow with anamorphic streak
- [x] 23. Hyperspace in/out sound = Pixabay "Atomic Impact" (first result), old warp sounds removed; sample polyphony 96
- [x] 24. Enemy gunfire leaves RONIN's aiming hand (was the chest); hero rifle verified exactly at the muzzle
- [x] 25. Hero textures 4096² (denser UV atlas); enemy 2048² downscaled from its 4K bake (GPU memory)
- [x] 26. Mothership / frigate turn to face the enemy slowed (24 s / 22 s)
- [x] 27. Standoff shot: side-on profile of the whole gap, dreadnought visible; dreadnought scaled ×1.65 (~720 m > flagship 637 m)
- [x] 28. First-person tear: eye at the visor, camera aims at the fists (FK), upper arms hidden, arms reach forward, articulated
      hands with fingers (assets/mech_hand.glb, tools/make_mech_hand.py) clawing in; red wash reduced; blue-white rip energy
- [x] 29. Berserk strikes: three heavy distinct blows (hammer / haymaker / claw rake) with wind-up, snap, follow-through;
      per-hit medium-close angles; red streak behind the back removed
- [x] 30. Sigma is recovered: flies into the flagship's port launch bay (story 336–341.4) before "All ships, jump!" (342.4)
- [x] 31. Hero name SIGMA everywhere (6 voice lines regenerated, subtitles, labels; no hyphen)
- [x] 32. Launch bay dark: three pools of light + floor rails/chevrons chasing toward the mouth (surge before the catapult)
- [x] 33. Perf: depth prepass (+ shared cut-away discards) for the mothership and interior bay; noise gated near the wound →
      wound close-ups 19 → 23–24 fps
- [x] 34. Enemy retreat: warp out along the current heading (no 180° turn)
- [x] 35. Sigma launches with the mace in hand and fights ONLY with the mace (no rifle)
- [x] 36. Warp sound trimmed front/back and synced to each warp's actual snap moment
- [x] 37. Gunfire sound = laser beam; shots leave along the real muzzle direction
- [x] 38. Shield destruction easier to read (crack wave from the tear → shatter into shards → collapse) + sound
- [x] 39. Well kill: two-handed mace grip, full-body ram into the core (heavy)
- [x] 40. Close-up at the well explosion: Sigma is caught in the blast
- [x] 41. Bigger flagship: fix shots whose camera ends up inside the hull
- [x] 42. Flank hit: interior objects pushed, exploding, burning, crushed, floating in zero-g
- [x] 43. Flagship warp out/in: interior (bay) travels with the ship
      (34) warp out along the current heading · (35) mace from the hangar, rifle hidden, RONIN #1 killed by a solved mace smash at 179
      (36) Atomic Impact trimmed to 3.4 s; cues generated from world.warpSchedule() (125 events, snap-synced, clustered)
      (37) all gunfire = laser zaps; RONIN's wrist laser fires along its forearm · (38) shield collapse wave + shards + shock ring + sound
      (39) two-handed ram grip solved with FK, body drives into the core and grinds · (40) engulf close-up: fireballs, ripped plates, late white-out
      (41) hull scan: no camera inside the flagship anywhere; line ships moved clear · (42) zero-g interior props, fires, crush, blasts
      (43) interior bay copies the hull's live matrix/stretch/visibility through warp out and in
- [x] 44. Fixed a latent bug: 4-argument calls to the 3-argument madd() helper produced NaN (lance ricochet, spark fans, grip solver)
- [x] 45. Battle: many of our ships get destroyed
- [x] 46. Mech combat impacts = heavy metal; final mace kill: the mace crushes THROUGH the enemy in slow motion, it disintegrates in all directions
- [x] 47. "Enemy above" reveal (E2 dive) — make it cool
- [x] 48. Berserk: remove the beam lines in the hands
- [x] 49. Recovery: rotation pops — make it smooth
- [x] 50. Stowing: design the docking bay + a proper stow animation (no vanishing)
- [x] 51. Earth arrival: Earth's blue fills about half the frame
- [x] 52. Title: short, about home / hometown / origin
      (45) 7 of 18 line ships die on their 2nd enemy hit (explode + shatter, stop firing, don't jump), each with explosion + hull groan
      (46) Pixabay: axe-on-metal ×2, Heavy Metal Crush, Big Metal Knock, large metal door → duel clashes/hits/kills; finisher = shatter into
           ~36 posed chunks drifting in slow motion + exit spray, reactor blast at 194
      (47) reveal: visor spike (red) → silhouette against a backlight with red ignition → plunge cam with streaks/shock rings; alarm/braam/thruster/flyby
      (48) berserk: no arcs at the mace head, no thruster trails from the limbs
      (49/50) recovery path + heading from velocity, smooth 180° yaw; dock rig (tools/make_dock.py): pad, cradle, shoulder clamps, sliding doors
      (51) homecoming sun from the side: ~half of Earth in blue daylight · (52) title VESTIGE (user's choice)
- [x] 53. Ending: keep the original Earth camera (tilt up → title); Earth bottom 70% night, top 30% day
- [x] 54. Recovery: third person farther; heavy inertia; no blinking yellow ring after docking
- [x] 55. RONIN #1 approach: animated, aggressive pose driving at Sigma
- [x] 56. RONIN #1 also breaks apart when it explodes
- [x] 57. Ship breakup chunks: only the torn edges glow dark red (not the whole piece)
- [x] 58. Title → VESTIGE
- [x] 59. Mech fight: natural inertia in the animation + physical collisions
- [x] 60. After the well blows: a gravity-distortion wave spreads far out and fades; the whole fleet in view
- [x] 61. Enemy arrival: camera shot that shows the whole enemy force
- [x] 62. After the blast: no camera/ship shake (S18a/S18b)
- [x] 63. Exposed interior: pushed around, wrecked, soiled, broken — not tidy
      (53) original ending framing restored; homecoming sun at cos θ = −0.4 → top 30 % day · (54) spring-damped docking path, wider cams, beacons off
      (55) RONIN #1 assault poses (lean, gun arm levelled, katana cocked) · (56) RONIN #1 shatters at 180.2 · (57) chunks: soot + thin dark-red torn edges
      (59) contact momentum (victim shove/stagger, attacker recoil), inertial lean/bank; contacts still exact · (60) gravity-wave rings, side-on wide
      (61) enemy arrival wide from our bow · (62) no shake after the blast · (63) wreckage, soot (instance shade/soot), fires, sparks, brown-out
      perf: engine-trail past-state memo (duel CPU 12 → 4.5 ms/frame), duel state cache enabled after solving
- [x] 64. Remove the blue gas (nebula) from the background
- [x] 65. "12 HOURS EARLIER" + coordinates + coordinate-system name, typed out with typing.mp3
- [x] 66. Warp sound → warp_out2.mp3
- [x] 67. Main ion cannon firing sound → beam.mp3
- [x] 68. Ion cannon charge: energy sucked in much faster from the start, accelerating
- [x] 69. Dreadnought charge emitter: more detail
- [x] 70. Find and remove single-frame flash flickers
- [x] 71. Flank hit: the small craft inside the bay are knocked off their cradles / toppled
- [x] 72. No weapon/limb trails in the mech fight (plume history off 169.5–200)
- [x] 73. Heavy motion: pose springs ~40 % lower frequency; zero-g ragdoll (RONIN #1 after the smash, Sigma after the blast)
- [x] 74. No foreign debris pieces in ship/mech explosions (only the models' own breakup chunks)
      (64) nebula 0 + neutral sky haze · (65) typed HUD card + typing.mp3 · (66/67) warp_out2 / beam · (68) chargeInflow (integrated,
      accelerating) · (69) dreadnought emitter: coil rings, plasma arcs, vortex, layered core, pulses · (70) duel screen flashes removed,
      muzzle pops decay, hangar/bay lamp strobing fixed · (71) six bay craft replaced by toppled live models
- [x] 75. Motion blur no longer smears the tracked subject (depth mask post.mbNear) in the dive, rush and recovery shots; dive: zoom
      blur / star streaks / interference / CA toned down, no shake blur
- [x] 76. Standby flashing = the mace sweeping past the lens → mace racked in the standby shot; mace glow calmer everywhere
- [x] 77. Grating crackle removed: radio click/squelch/static under every radio line, broken-radio crackle/hiss/dropouts, dive static
      bursts, glitch zaps, electrical flicker; the POV tear crackle softened
- [x] 78. First-person tear: hands rolled palm-outward (elevator-door grip) prying the seam apart
- [x] 79. Last shout in the POV tear removed (v8p_strain2 + the final synth growl)
- [x] 80. Single-frame white bloom flashes: cause = NaN/inf HDR pixels (e.g. envInterior division by a zero reflection component)
      → guarded + `sane()` on mesh / sprite / lens outputs (film-wide); full-film 24 fps brightness scan to verify
- [x] 81. Hangar standby crackle: gritty servo whines removed
- [x] 82. Gravity-core red alert: heavy hull horns (braam ×3 slowed), sub thumps, muffled low siren; synth klaxon/stinger/glass removed
- [x] 83. Flicker sources smoothed: explosion flash spread over ~5 frames; charge streaks kept off the lens; dreadnought plasma arcs
      fade in/out at 3–5 Hz (was 8–24 Hz re-rolls); POV arcs 4 Hz; dive interference smooth. Re-scan (stopped at user request):
      dreadnought charge clean; residual small jitter in the POV tear, the ion-muzzle close-up and the main-cannon charge
- [x] 84. After the well collapses: Sigma unconscious, drifting calmly (the body swaying looked like a bug)
- [x] 85. Recovery: strong boosters on the way back
- [x] 86. Ship thrusters: cross-shaped billboards with glow, sized to each nozzle, scaled by speed, off when stopped
- [x] 87. Bug: thruster fire shows up at the arrival point before the ship during warp
- [x] 88. Final scene: the sun as a strong light with lens flare (reference image)
- [x] 89. Recovery bay: translucent blue containment field (sprite shader 11: hex lattice, scan bands, bright frame, pass-through ripple);
      Sigma glides through into the middle of the cradle (spring-damped path, smooth yaw, landing)
- [x] 90. Main cannon charges only after "Bring us about! All power to the main gun" (line 292.1 → charge 295.7 → fire 300)
- [x] 91. Sun lens flare is a final-pass shader (core, round glare, fine starburst, chromatic ghosts, halo), fades off-frame;
      no sideways streak
      (86) cross plumes (sprite shader 10) sized by nozzle radius, throttle from measured ship speed (off when stopped);
      (87) no thruster fire while a hull is warp-stretched
- [x] 92. Warp stretch anchored: arrivals keep the bow at the arrival point (hull trails, then contracts); departures keep the stern (`stretchOut` / `stretchAnchor`, attached bay/dock/doors share the flagship anchor).
- [x] 93. A4 (40–50) is one wide 3/4 shot holding the whole formation so every frigate's hyperspace exit is visible (A5 removed).
- [x] 94. Blue translucent energy curtain across the launch-hangar mouth (150.6–159), ripples as Sigma punches through.
- [x] 95. Removed the lit horizontal strips on the port launch bay back wall (mothership rebuilt).
- [x] 96. Recovery: docking spring integrated in the flagship frame so Sigma seats exactly in the middle of the cradle.
- [x] 97. No battle wreckage (shatter chunks) after the Earth arrival.
- [x] 98. Title ×2 with a full technology credit block.
- [x] 99. Story: until the well collapses (280) the gravity well drains every Hiigaran ion coil — charges stall and bleed
      away toward the well (`drainOutflow`), no beam ever leaves a muzzle, missiles are swatted down by point defence,
      only the enemy fires (denser `ION_SHOTS`), 16/18 line ships die, featured on-camera losses (`H_FEATURED`);
      all enemy losses moved to the counterattack after the well dies (EF / EXTRA_E die 288–308). New lines v10w01,
      v10s01, v10w02 (ElevenLabs v3); power-down whines instead of volley sounds.
- [x] 100. Warp sound (warp_out2) louder, unpitched, up front, with ducking (it was pitched down and masked).
- [x] 101. Recovery: Sigma comes to slowly (visor steadies 331–334, head lifts, limbs gather over 5 s, thrusters cough
      then catch), creeps forward at 3 m/s² from 334.3, the docking pull and the burn build up over 336–338.3.
- [x] 102. Launch run barrel roll is now an evasive roll + 13 m jink away from an enemy ion bolt (duel.js DODGE, 166.65).
- [x] 103. Duel weight: 1-frame contact bites with long eased releases instead of 2–4 frame freezes; hits carry 30 %
      follow-through; hips counter-rotate the chest twist, legs brace with swing speed, head stabilises (weightShift);
      contact residuals unchanged.
- [x] 104. Procedural asteroids (`tools/make_asteroids.py` → `assets/asteroids.glb`, 6 rocks × 20k tris): warped fBm
      potato shape, ridged fault relief, creases, terraces, power-law craters with rims/ejecta, soft fracture planes;
      shader mode texSet = -1: dark regolith albedo, iron stains, grains, finite-difference bump, pit AO, no sheen.
      Debris field: 34 rocks + 5 hero rocks placed in the drift/return camera views; old low-poly rocks retired.
- [x] 105. Hitboxes: capsule per mech part (both models) + weapon capsules (mace shaft + head, katana); the duel is swept
      at 96 Hz after solving (~0.4 s at load) → AUTO_CONTACTS (entry with closing speed > 4 m/s, merged per 0.2 s):
      sparks/glow/shake (shots.js via AUTO_FX), impact sounds (audio.js duelCues), and a physical response for both
      mechs — impulse along the contact normal (mass-weighted, Newton's third law) + twist from the lever arm about the
      hip, damped-spring profile, zero at contact frames (solved contacts stay exact; residuals unchanged).
- [x] 106. Flagship wound has thickness: `tools/make_wound_rim.py` → `assets/wound_rim.glb` (rolled molten lip, ~11 m
      laminated cut face, ragged inner edge) sharing the exact hole boundary B(θ) with the melt shader; shader mode
      texSet −2: glowing runs, slag crust plates with molten cracks, plate seams; scaled with the growing hole, crushed
      and warped with the hull.
- [x] 107. Every warp gets its own warp_out2 on its visual snap (only simultaneous < 0.15 s share); small ships lighter/panned — the enemy's fleeing line ships at 313.0 / 315.2 were silent (1.2 s clustering).
- [x] 108. Wound rim conforms to the real hull (ray-cast skin under every column; no wall where the hole runs off the hull or deeper than the melt); FLEET COMMAND + SENSORS voices at 80 % (VOICE_TRIM).
- [x] 109. Launch run: no barrel roll — Sigma bats the enemy ion bolt away with his right vambrace (parryPose; the bolt
      is aimed at the solved wrist point, glances off with a spark fan and ricochets away; knock + ring + whoosh).
- [x] 110. S10a: the strike leader flies a four-ship finger formation, jumped by three bandits; wingmen die at
      136.1 / 137.9 / 139.7 (fireball + break-up), new line v10w03 "I'm the only one left!" (140.1).
- [x] 111. Cold open: the calm view slowly tilts down and sinks a little (0.8–8.2 s) before the whip pan.
- [x] 112. Final shot: the sun rests on Earth's upper limb at the horizontal centre of the frame, just touching it.
- [x] 113. warp_out2 always clearly heard: dry bus (past sfx ducking/filters), top priority, level by size (1.0 / 1.35 / 1.8), ducks the mix.
- [x] 114. Return after the blackout: he sets off the way he already faces (no turn), jerk-limited acceleration (0 → 16 m/s²
      over 334.3–339), roll levels out gently, waking pose blend kept until landing; the cut at 340 picks him up gliding
      into the bay (ease-out along the bay axis), slow 1.6 s turn to face out. Frame-to-frame check: no jumps 330–340.
- [x] 115. Dreadnought lance charge audible: hl_charge2 rising whine (rate 0.62 → 1.2) + charge_weapon on the dry bus + final spike.
- [x] 116. Dreadnought death: 240 m core blast + 7 chained detonations down the hull, additive white-hot flash sprite
      (eased, no screen wash), 3 km light, expanding shock ring + ripple; the cut-in that hid it moved to 308.4; louder chain audio.
- [x] 117. Failed ion charges: brief inflow, then filaments peel off and race 1.1 km down the line toward the gravity well
      (Bézier streams, accelerating/stretching); B5 camera swings side-on to the drain line.
- [x] 118. Flagship cinematic hull detail (shader, shade.z material class): staggered plate courses + sub-plates, recessed seams with bevelled raised edges, rivet rows, worn edges, tone courses, decals per plate/material (hazard bands, stencilled numbers, maintenance text, vent grilles, access hatches, chevrons, fleet emblem, 5 m registration numerals), chipped paint, grime streaks; AA by pixel footprint, skipped when sub-pixel.
- [x] 119. Idle thrusters keep a faint slow glow pulse (per-nozzle phase); ship plumes ~1.8× wider (cross planes r·1.9, less taper), exhaust trails and mech flames fuller.
- [x] 120. Thruster trails are cones: full nozzle width → thin tip, transparent toward the end; the thick first third is additive-bright with a glow halo (ships + mechs; mechs also get the cone plume, larger scale).
- [x] 121. Dreadnought gravity lance: blueprint blender/DREAD_LANCE_BLUEPRINT.svg + assets/dread_lance.glb from the same parameters (tools/make_dread_lance.py, 32k tris): reactor cradle, radiator banks, 2×2×21 capacitor cells, copper bus bars/feeders, wound coil stack + field shapers, guide rails/clamps/status lamps, emitter crown with 6 electrode horns + focus lens; glow/lamps driven by the charge. Arc-discharge sprite shader (shape 12): jagged stepped-leader channel, forks, white core + sheath + glow, crossfaded re-strikes; crown terminal↔terminal/core arcs and coil→rail flash-overs replace the old polyline arcs and ring sprites; core glow toned down.
- [x] 122. RONIN #1's wrist-gun bursts: Sigma keeps the right vambrace up and flicks it into every one of the 24 bolts (volleyParry); each bolt lands on the solved vambrace point and glances off with sparks + a metallic ping.
- [x] 123. RONIN #1 blows apart right after the mace smash (179.15, no long smeared crumple: crush capped), chunks thrown along the swing (shatter impulse option); audio/shake moved with it.
- [x] 124. RONIN #2's entrance: the backlight glow disc + red thruster star removed; mech nozzle glows tightened.
- [x] 125. Finisher follow-through: the mace arm ends across the body with a soft elbow and lowers (no wrap-back); mech rim light ×0.3.
- [x] 126. Arc shader: soft window across the ribbon and along its ends (no visible quad edges), wander kept inside.
- [x] 127. Dive: the line-noise interference is replaced by a GRAVITY ANOMALY final-pass warp — travelling gravitational-wave ripples from the well, frame-dragging swirl, radial red/blue gravitational shift, a faint time-dilation echo, bright ripple crests.
- [x] 128. S16a: the charge opens on the flagship's melted flank; Sigma sweeps past the wound close to the lens (divePass) and the camera pans to follow him toward the well.
- [x] 129. Flagship surface redesigned by function (blender/MOTHERSHIP_SYSTEMS.md): dreadnought-style armour plating (shipkit.armor bands, gaps, sub-plates), zoned equipment (capacitor racks, PD batteries, VLS, sensor arrays/domes, radiator banks, hatches, docking ports, walkways, conduits, RCS), no antennas; 116k tris; wound rim regenerated on the new skin.
- [x] 130. Fighters: three distinct designs per side (blender/fighters_ours.py / fighters_enemy.py / fighterkit.py), 53–64k tris each (~5–7×), glTF metallic-roughness palettes (paint A/B, trim, metal, gunmetal, carbon, heat-tinted exhaust, glass, nav lamps, engine cores); engine picks the variant by index (fighterModel) in the cold open, belly pass, escorts, dogfight pairs, strike formation + bandits.
- [x] 131. Wide establishing shots (A4, B3, B4, S9c, S18a, S20, the enemy-arrival cut): camera lifted to ≥17° above the subject with a slight dutch tilt, and a big moon placed in the background on the sunward side (wideTreatment).
- [x] 132. Ion frigate redesigned (blender/ships_ion_frigate.py, ION_FRIGATE_DESIGN.md, 62.7k tris): spinal 46 m ion cannon — muzzle crown, quadrupole focusing, 4 accelerator stages with copper coils + capacitor modules, breech/charging gallery, radiators, command block, 2×2 engine block; dreadnought-style armour, no antennas. New charge effect (ionCharge): stages wake breech→muzzle, capacitor→coil arcs, energy pulses up the barrel, plasma core inside the bore; failed charges die back and drain to the well.
- [x] 133. Barbatos-style touches (text research only): thruster-driven mace smash on RONIN #1 (boost spike 178.8), pile-driver finish — a white-hot shaft punches out the back of RONIN #2 at 192.4. (A collar-grab before the finisher was tried and reverted: the pass-cut geometry keeps 17–21 m between them.)
- [x] 134. Warp space ripple scales with ship bulk: amplitude/duration ∝ √(L/70); capital ships add a wider aftershock ring.
- [x] 135. Dive: Sigma's charge is one straight line from beside the flagship's wound to the well (he moves there off screen 226–240); S16a looks down that line toward the well with the wound in the foreground — no swerve.
- [x] 136. Return after the well: no ember sparks off the arm thrusters while he comes to / flies home; camera placed behind him on his heading and held still so he slowly draws away (no asteroid in front of the lens).
- [x] 137. Ship/fighter trails: one smooth cone per nozzle (the segmented past-trail capsules read as beads), nozzle glow only at the nozzle.
- [x] 138. Enemy arrival: warp sounds 80–100 s ×3; the wide cut (80.6–88.5) is now high off the enemy flank looking down — every frigate/line ship warp-in plus the dreadnought side-on beside them for scale.
- [x] 139. warp_out2 plays the user's file untouched (full 1.51 s, original level/pitch; build_sfx raw copy), no distance attenuation (far 0, no low-pass), dry bus, top priority; size still sets the level.
- [x] 140. chargeInflow keeps flowing past its ramp (the ion core inflow was frozen: t0 = t−1); streaks fade in and dim/shorten as they are swallowed instead of popping out.
- [x] 141. Vambrace parries are real swats: the forearm whips across through each bolt (±0.12 s) and the bolt ricochets along the swing direction.
- [x] 142. Title: tilt up over Earth twice as fast (2.5 s).
- [x] 143. Dive: continuous burst acceleration (the old curve jumped back at 244.5 — the "teleport"), boost spike at 241.2; S16a camera pulled in.
- [x] 144. Parries: bigger full-arm swats with the shoulders turning into each one.
- [x] 145. Berserk first strike is a true clasped double-fist hammer: both fists solved with FK to meet above/in front (gap ≈ fist width), no per-hit jitter on it.
- [x] 146. RONIN holds the katana two-handed (samurai grip): left arm FK-solved onto the hilt below the right fist, aligned with the blade (two starts incl. mirrored right arm, joint-limited); blade/contacts unchanged.
- [x] 147. RONIN #1 no longer fires on the approach (bolts, laser audio, vambrace parries removed).
- [x] 148. Dreadnought reveal close-up: no planet in the background (B3 dropped from the wide-shot treatment).
- [x] 149. Hands really hold the weapons: Sigma's open model hand is replaced (while the mace is out) by the articulated hand closed into a fist round the haft (bore aligned to the mace line); RONIN's two-handed grip is now baked into the pose keys (both arms solved onto the modelled hilt of the katana, left-arm-only pass at contact keys after the contact solver) — smooth between keys, grip error mostly < 1 m.
- [x] 150. Belly pass (30–40): the flagship is already under way (thrusters forced on), the camera skims just under the keel at constant speed looking up/aft — structure streams past fast, yet the 637 m hull takes the whole 10 s.
- [x] 151. Title card holds 14.8 s (371.8–386.6): film +5 s (STORY_DURATION 387), fade 384.5–387, ending pad/master fade extended.
- [x] 152. Emissive fixtures on every ship/fighter/bay (blender/shipkit.py lamp_fixture, light_bar, lamp_row, chevron_light, window_bay, light_panel, louvre_glow, beacon) replace plain glowing boxes; tri budgets kept; wound rim regenerated.
- [x] 153. Warp in/out sound is now the user's warp_out.mp3: first 3.8 s kept, faded out from 1.6 s (tools/build_sfx.py entry; original kept in assets/sfx_src).
- [x] 154. From scene 5 (40 s) to the Earth arrival the same moon hangs in the background of every exterior shot (frame-anchored upper/lower corner per shot, chosen where it is most fully sunlit); no other planets (the brown planet and the per-shot moon placements removed; interiors excluded; Earth ending unchanged).
- [x] 155. The background moon is enormous: angular radius ≈ 2.3× the half-FOV, centred off the frame corner so its limb sweeps across a third of the frame; albedo toned down.
- [x] 156. Scene 29 (S11d fly-by): the blue containment field is across the flagship's port launch bay as Sigma launches (fades on 150–151.5, ripple as he punches through at 159.55, off by 161.8).
- [x] 157. Cold open: the camera sits off the dreadnought's flank, opens looking up into the stars and whips straight DOWN (pure tilt) onto the dreadnought broadside.
- [x] 158. The moon is a real mesh (tools/make_moon.py → assets/moon.glb, 82k tris: maria, 260 craters, grit; regolith shader) fixed in the world 110 km off the battle (radius 42 km) — it frames/turns consistently with every camera; scene 5 → Earth jump. Frame-anchored sky moon and the default sky moon removed.
- [x] 159. Moon detail ×2 (level-7 icosphere, 328k tris, 560 craters, finer grit); moon shading mode texSet −3 (brighter highlands, soft AO/bump); placed so its vast lit face fills the upper right of scene 12 (B4 standoff; that shot's key light comes from high behind the camera).
- [x] 160. Dreadnought (and its lance) rim light ×0.3 (per-entry rimK → Inst.shade.w).
- [x] 161. The enemy-arrival wide cut now starts at 80.0 (it began at 80.6, leaving a 0.6 s flash of the dreadnought-reveal camera before it).
- [x] 162. Cold open: sun disc off (it slid through the lower-left of the frame during the tilt as a stray light blob).
- [x] 163. Scene 5: the fleet drops out of hyperspace in a tight wave (40.5–43.3 frigates, line ships every 0.14 s from 40.7) — all out by ~44.3, before "exit complete" at 45.
- [x] 164. Scenes 63→64 are one take (homeCam): the camera stays by the fleet and eases onto Earth's limb, then tilts up fast (1.4 s) until the rising sun sits dead centre, holds, turns away into open space and the title holds 20 s (371.8–391.8 story; film end +6 s). Music fades out under the title (unchanged). Fixed a 4-arg madd in the new code.
- [x] 165. Scene 64: one continuous move after the narration (4 s, eased): up through the rising sun (centre of frame mid-move) and straight on round to the title — no stop/restart.
- [x] 166. Scene 64 camera never stops: one arc-length-parametrised move 358→370.8 (fleet → limb → sun → title) with a steady ~3.5–4°/s rise under the narration, a surge through the sun, easing onto the title; fleet kept in the world until the camera has risen past it.
- [x] 167. Scene 64 fake glows removed: the atmosphere glow sprite, the god rays (marched over bloom during the swing) and the hard-edged warm glare disc of the flare (now a soft gaussian + faint tail); the flare and its ghosts fade out completely before the sun reaches the frame edge.
- [x] 168. Scene 60→61: Sigma's exhaust history no longer reaches back across the 340 cut (his path jumps there), which drew a long light streak sweeping across the frame.
- [x] 169. Bug: the hero's leftover beam-saber hilt had 'engine'-coloured faces, so 24 tiny thruster plumes fired from the hand/weapon; excluded from the engine emitters and the hilt part hidden (only the 3 backpack thrusters remain).
- [x] 170. Recovery bay: the field's pass-through ripple starts as a ring (it began as a bright filled dot that read as a light ball by Sigma's hand); visor glow smaller; dock lamp dimmer; mech plumes fade when seen end-on.
- [x] 171. Sigma model: 2 inverted faces re-wound and 150 broken vertex normals (pointing away from their faces) rebuilt from the faces (backup assets/v5_backup/gundam_pre_normalfix.glb). Sigma paint matte (roughness ≥ 0.72), chipped bare metal scuffed (≥ 0.5) and less metallic.
- [x] 172. Flagship plating: one uniform tone per plate (no in-plate noise: grime, streaks, chip noise, edge-wear noise off); decals ~2× (hull numbers 3.2 m, text blocks, chevrons, hazard bands, emblem, 9 m registration numerals).
- [x] 173. Scene 3: camera fixed at the close framing from the first frame (no push-in). Scene 4: the belly pass covers ~72 % of the hull (cuts before reaching the stern).
- [x] 174. Grips: RONIN's grip bake now uses both arms + torso with a loose blade weight, plus a per-frame left-arm grip lock (median grip error 0.1 m); Sigma's closed fist round the mace haft unchanged.
- [x] 175. Flagship side "patchwork" removed: every armour class uses one gunmetal (trim slightly lighter), no 2×2 sub-plate split, no per-plate tone/roughness variation, no brushed-noise sheen, no generic panel/grime layer — only seams, rivets, bevels and decals.
- [x] 176. Grip orientation verified (Sigma: the haft runs through the closed fist, index side toward the mace head; RONIN: both fists on the hilt, axes aligned, roll matched — added a same-roll term to the grip cost).
- [x] 177. Flagship decals: few and huge, sized to their plate and kept inside it with a 0.9 m margin (3-digit hull numbers 62 % of plate height, plate-filling emblem, full-width hazard band); small text/vents/hatches/chevrons and the course-spanning registration numerals removed.
- [x] 178. Flagship decals: bold stroke font (seg7w), hand-placed on the flat side walls and ~5× bigger — hull number "07" 40 m tall, a 60 m fleet emblem, a long hazard band — fully inside the wall band; side-wall mapping flipped so they read correctly on both flanks.
- [x] 179. Rounded plate edges on every ship (shipkit plate()/armor(): 2-segment round on long edges, weighted normals), flagship side walls one continuous plate, wound rim regenerated.
- [x] 180. Distance LOD (blender/make_lods.py → <name>_lod.glb, 9 ships/fighters, 12–45 %): swapped in R.add beyond 5.5 × ship length — battle scenes back to ~21–24 fps (were 12).
- [x] 181. Decals 90 % size, applied as an overlay tint (the armour's metalness/roughness/seams/bump stay underneath).
- [x] 182. Moon: procedural crater field in the shader (4 octaves, cells 1/14…1/260 of the radius, analytic bump gradient, bright rims, ray systems, maria, fine grain) — ~10× the mesh detail at 24 fps.
- [x] 183. Flagship hangar: armoured two-leaf doors (ribs, belts, teeth, hazard chevrons, seam lights) that open sideways during launch/recovery + lit bay mouth frame (tools/make_dock.py, world.js drawDock)
- [x] 184. Flagship decals moved onto clear wall so none are cut or smeared ("07" z −115, emblem z −178, hazard band z 130..185)
- [x] 185. Sigma chest reactor ring glows (heartbeat pulse, red when berserk)
- [x] 186. Hangar doors/frame fitted onto the bay's armoured box face (were floating 4–7 m off it); leaves slide sideways into pocket housings on the hull; door/frame use the hull's own shading (hullDetail gunmetal) so the lighting matches; fore leaf rotated (not mirrored) so its outer face isn't culled.
- [x] 187. Flagship "self light": the camera-side fill is capped to the base level on the flagship's armour (as in S23), so F2 no longer looks lamp-lit and the cut into S23 no longer strips it.
- [x] 188. Lance hit: deflected beam flies on 60 km (out of frame); whole-ship white wash removed (entry flash, 880 m chain-blast lights → local, lingering fire light scaled with it, hit light 900→170 m, S14b exposure 1.25→0.9, gravity-well light 1.2→0.55).
- [x] 189. Duel standoffs: Sigma's guard re-posed (FK-solved) — squared up, mace angled forward-up at the opponent instead of held straight up like a torch, arm cannon raised as a shield, legs split front/back.
- [x] 190. Duel bullet time: speed ramps round the big blows (179.0, 184.5, 188.2, 192.4) — 0.18× at contact, fast catch-up after; the blow lands on its original time, duel SFX follow the ramp (bulletReal); picture drains/vignettes while time crawls.
- [x] 191. Heavy blows leave marks: knee/kick on RONIN #1, shoulder charge on RONIN #2, RONIN #2's kick on Sigma dent the struck plating (crush); the kick (178.55) and the charge (188.2) tear a slab of chest armour off (part-clipped hole with hot edges + the slab tumbling away). Renderer: e.clipPart limits a clip box to one part.
- [x] 192. Mechs (Sigma, RONINs, mace, articulated hands): no rim light and no camera-side fill — lit only by the sun, sky ambient and real lights.
- [x] 193. RONIN #2 kill: a 180° spinning strike — coil 70° away, whip round (back passing the enemy) accelerating into the contact at 192.4 (solved, residual 0.01), spin bleeds off in the follow-through; ends facing the dash line for the walk-away.
- [x] 194. Start screen: '⚔ 메카 전투씬만 보기' button — plays the duel (169.8–195.2) with sound, then returns to the menu (▶ 재생 then starts from the top).
- [x] 195. Duel opening: RONIN #1's approach re-posed (upright swordsman on boosters, katana low/back, legs split — was a flat "flying superhero" with a levelled gun arm); D04 Sigma tracks it with the cannon arm up then crouches/draws the mace back for the hop (was a frozen guard just bobbing); D03/D05 cameras frame the whole RONIN (aimed 8–9 m above the hip they cut it in half).
- [x] 196. Scene tag numbers every camera cut (the duel counts one scene per cut) → 89 scenes.
- [x] 197. Scene 35 (D04): Sigma at the ready — idle pose with the mace hanging from a loose arm by his side (FK-solved), a slow breathing sway + the mace swinging a little like a pendulum (micro jitter cut 70 %), calmer camera; snaps to guard for the hop at 175.2.
- [x] 198. ←/→ step one scene (camera cut) at a time (← first returns to the current cut's start); Shift+←/→ = ±5 s.
- [x] 199. Scene 35 (D04) camera locked off: orientation fixed from the cut's first frame (it swung with RONIN's position), only carried with Sigma's drift; no handheld, no base shake (duel cams can now set baseShake).
- [x] 200. Scene 35 idle: Sigma's body held still (fixed heading — no turning after RONIN, no inertia lean, squash, weight-shift, jitter or pose drift); only a slow float (±0.45 m bob, visible because the locked camera follows the un-floated anchor), breathing and the hanging mace lagging the float.
- [x] 201. The bolt parry on the launch run (166.65): a full left→right swat with the right forearm (reaches across to the left shoulder, whips out to the right, chest turning through); the bolt is batted off to his right and bursts ~22 m away — white core, fireball, shock ring, 90 burning fragments in every direction + burst SFX. The insert cut moved 166.8 → 167.35 so the burst plays on screen. (Fixed: dodgeRight() is his LEFT.)
- [x] 202. Duel opening (to 176.9): the fighters face each other's position averaged over ±0.5 s (no servoing onto every hover wobble), RONIN #1's hover 1.2 → 0.45 m, micro-motion −65 %, D01 camera on the same rough axis with little shake.
- [x] 203. Scenes 32–35 (170–175): both mechs hold still — heading set once (170.3) and never re-aimed, idle poses (Sigma: mace hanging; RONIN: katana low), no squash/weight-shift/jitter/inertia lean, MG-era dodges/jinks/recoil removed, positions a clean approach; only a slow float (cameras follow the un-floated anchors, axes fixed at each cut, no shake).
- [x] 204. Launch-run parry is a backhand: right fist folded over the left chest (FK-solved), arm whips straight out to the right, back of the hand into the bolt; burst sparks are thin streaks flung every way — white-hot/blooming at first, cooling orange → dull red, thinning and fading.
- [x] 205. The swatted bolt bursts ON the back of Sigma's hand at contact (no flight after the swat); sparks thrown every way, a little more along the swat; burst SFX moved to the contact.
- [x] 206. RONIN #1 before the charge (170–176.45, scenes 32–35): two-handed ready stance — katana on the centre line pointed at Sigma (FK-solved right arm; left fist locked on the hilt, grip error ≈ 0.1), leaning in, sword-side leg forward/bent, the other trailing; zero-g float on every joint (torso, head, arm, hand, legs, feet on their own slow phases).
- [x] 207. "⚔ 메카 전투씬만 보기" now starts at 165.9 — from the bolt Sigma swats away on the way in.
- [x] 208. Scene 36 (D05) camera locked (axis fixed at the cut, un-floated anchor, no shake) and moved round to RONIN's side so the katana reads full length.
- [x] 209. Rim light removed in every scene (renderer forces its strength to 0); the duel shot's extra fill/rim (meant for the mechs) dropped — they had washed the distant enemy ships out white.
- [x] 210. Lighting: no camera fill anywhere (shots' env.fill is ignored) and no rim light; instead a BINARY SUN — a second, blue-white sun (SUN2, ≈125° from the first) lights the far sides with the same GGX model (no shadow map), glints in reflections, and both suns are drawn big in the sky (radius 0.011 / 0.008 rad). Off at Earth (t ≥ EARTH_T).
- [x] 211. RONIN #2's dive (180.6–184.25, scenes 43–46): one clean plunge — no hover, jitter, squash, weight-shift or inertia lean; aims at the strike point (Sigma at 184.5), not at his every wobble.
- [x] 212. No screen-space distortion anywhere (post distort forced 0; refraction ripples no longer drawn — they left grey circles).
- [x] 213. All sparks are PARTICLES (fx.spark: tight hot glow points) — duel/mace/lance/bolt-burst/core/hull sparkers; the dive's speed-streak lines are dust motes now.
- [x] 214. The upper sun is the strong key (2.5, 2.12, 1.62); the lower blue-white sun is a weak cool light (0.3, 0.38, 0.6).
