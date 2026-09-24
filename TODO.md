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
