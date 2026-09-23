# Ship redesign brief (v2)

Goal: move from "primitive stacks" to modern capital-ship concept-art language while keeping the
SCRIPT.md asset contract (names, sizes, +Z nose, empties, `engine`/`window`/`muzzle` materials).

## Shared language (all ships)
- **Big → medium → small**: one dominant silhouette mass (lofted, faceted "stealth-chiseled" hull),
  medium masses (engine block, nacelles, prongs, towers), then small detail (plates, turrets, windows).
  Leave calm "rest areas" between busy zones (Juhani Jokinen / CGMA hard-surface process).
- **Layered armor**: the hull core is a dark mechanical material; armor is built as separate offset
  plates with chamfered edges and panel breaks, so dark trenches and exposed mechanics show between them.
- **Scale cues**: thousands of tiny windows, tiny lights, hull number stripes as geometry, PD turrets,
  antenna/sensor spines ("greebles lend scale" — 99% Invisible).
- **Engines**: clusters of deep bells with a glowing core disk far inside (no flat caps); modest emission.
- **Asymmetry on a symmetric base**: bridge/sensor spines/hull numbers/turret batteries offset to one side.
- 5–9 materials per ship: two hull tones, dark mechanical, accent(s), bare metal, glow.

## Mothership `KHAR-SAJUUK` (mothership.glb, ~600)
1. HW3-style "flying knife chiseled out of stealth angles": faceted arrowhead planform, widest aft-mid, split
   into two long forward tines that frame the main ion cannon (HW3 art direction, Aftermath).
2. Donnager-style "broadhead + fletching": swept pylons carry two engine nacelles out from the stern.
3. Huge engine block with a 3×2 cluster of deep nozzles plus secondary bells, armored cowl and radiator
   fin banks.
4. Side hangar as a real boolean-cut recessed bay with lit interior and landing lights (Donnager's midship
   hangar doors; Ra Cailum side catapults).
5. Low stealthy bridge with an asymmetric sensor spine; turret batteries on the chamfers; hull number "01".

## Ion cannon frigate (ion_frigate.glb, ~60)
1. The spinal cannon *is* the ship (HW ion frigate; Halo Charon keel-mounted MAC in a hull boom).
2. Exposed accelerator coils between armor collars along the spine; glowing `muzzle` ring at +Z tip.
3. Wide armored engine "shoulders" aft with twin deep engine clusters.
4. Offset (port side) bridge blister, swept radiator fins, ivory/sand plates with rust/blue bands.

## Assault frigate (assault_frigate.glb, ~45)
1. Chunky wedge with stepped layered armor (HW3 "aggressive, authentically military stance").
2. Turret batteries: two dorsal twin turrets, one ventral, side missile-cell blocks.
3. Three-bell engine cluster in an armored cowl; sensor spine offset to starboard.

## Interceptor (interceptor.glb, ~8)
1. Needle nose, cranked delta wings with blue tips, twin deep engines, canopy; clean, few parts.

## Enemy frigate (enemy_frigate.glb, ~55) — Vaygr / Zeon Musai influence
1. Blade-like charcoal spine wrapped by overlapping crimson armor scales.
2. Forward "mandible" blades, deliberately asymmetric in length; dorsal knife fin.
3. Musai-like pair of engine nacelles slung low on the flanks; glowing orange vent slits.
4. Turret on one side only (asymmetric), tiny amber windows.

## Enemy dreadnought (enemy_dreadnought.glb, ~400)
1. Tuning-fork prow (contract) with serrated inner edges and lance coils between the tines.
2. Stacked crimson armor scales over a charcoal body with glowing orange vents in the trenches.
3. Offset command tower (Zanzibar-style raised bridge), swept blade wings, turret batteries.
4. Massive rear engine cluster with deep bells and vent grilles.

## Enemy fighter (enemy_fighter.glb, ~9)
1. Crimson dart with forward-swept blades, single deep engine, orange vent.

## Sources
- https://aftermath.site/homeworld-3-concept-art-making-of/ (HW3 shape language: sleeker, aggressive, "flying knife chiseled out of stealth angles")
- https://www.gian-cursio.net/2024/06/comparing-the-homeworld-3-motherships/ (HW3 motherships: hyperspace core, launch bays)
- https://homeworld.fandom.com/wiki/Ion_Cannon_Frigate_(Homeworld_2) (ion frigate built around the cannon)
- https://en.wikipedia.org/wiki/Homeworld_3
- https://www.artstation.com/artwork/Xg8qAl (HW3 concept designs, David Cheong)
- https://expanse.fandom.com/wiki/Donnager-class_(Books) and search summary (Donnager: broadhead arrow, four nacelles as fletching, midship hangar doors, retractable PDCs)
- https://www.halopedia.org/Charon-class_light_frigate (twin fore hull booms, keel MAC, wing structures around engines)
- https://starcitizen.tools/Idris-M (Idris: spinal gun, full-length hangar with armored doors, turret batteries)
- https://gundam.fandom.com/wiki/Musai-class and https://www.mahq.net/musai/ (Musai: low twin engine nacelles, bridge tower, midship mega particle turrets)
- https://gundam.fandom.com/wiki/Ra_Cailum (side catapults, rear landing deck)
- https://wiki.eveuniversity.org/Naglfar (Minmatar vertical monolith dreadnought silhouette)
- https://homeworld.fandom.com/wiki/Battlecruiser_(Homeworld_2) (Vaygr battlecruiser: forward-firing spinal weapon)
- https://99percentinvisible.org/article/interstellar-illusions-greebles-lend-large-sci-fi-structures-a-sense-of-scale/ (greebles as scale cues)
- https://www.artstation.com/blogs/juhanijokinen/El3q/how-i-design-a-spaceship-hard-surface-concept-art-process (silhouette first, detail hierarchy)
- https://polycount.com/discussion/215777/how-to-design-3d-hard-surface-spaceships (decide scale before detail size)
