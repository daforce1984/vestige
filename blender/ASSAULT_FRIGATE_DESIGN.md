# Assault frigate — design note (v11, "trident" brawler)

Implemented in `ships_assault_frigate.py:assault_frigate()` (wired into `build_models.py` as `assault_frigate`).
It replaces the v5 white/light-grey boxy "workhorse" (`ships_hiigaran_v5.assault_frigate`, which is still in place;
the old GLBs are in `assets/v11_backup/`). This is an original design. It shares the family look of the v10 ion
frigate and the v9 flagship: blue-black gunmetal armour laid with `shipkit.armor()` + `cuts()` + `plate()`, lighter
hull2 plates, a slate-blue accent, amber markers, blue beacons, and no masts.

Coordinates: station `s` = metres forward (glTF +z). The prow tip is at s = +22 and the nozzle exits at s ≈ −25.3.
`x` = starboard(+)/port(−) and `z` = up (glTF y). Bounds are x ±9.0, y −4.8…7.9 and z −25.3…22.0 (47.3 m long).

## What it is for

The ion frigate is a long-range line ship. The assault frigate closes the distance and fights at short range.
Its plan is a **trimaran**. A narrow, heavily sloped centre hull ends in an armoured **wedge ram prow**. Two
**sponson gun pods** ride outboard on **swept armoured pylons**, and the open slot between the two pylons on each
side keeps the three hulls legible at distance. Each pod carries one heavy **breaching cannon** in a gun shield at
its nose and one engine at its stern. The centre hull carries the missile armament: in the film the assault frigates
fire the missile salvos. That armament is a dorsal **VLS citadel** placed between two twin turrets, with the aft
turret superfiring over the missile cells. A raked **blade bridge tower** stands aft.

Silhouette: from the side, a low wedge climbs from the ram to the tower. From above, a three-pronged trident: two
gun barrels flank the ram. From astern, two big main nozzles sit between two pod engines.

## Zones, bow → stern

| zone | s range | contents |
|---|---|---|
| Ram prow | 14 … 22 | Tapering wedge (deck slopes down to the ram), hull2 ram cap, a trim cutwater along the keel line, prow fire-control array, bow RCS quads on the upper and lower slopes, chin sensor dome, blue tip beacons. The fire-control arrays are on the forward walls. |
| Turret A | ≈ 11 | Twin gun house (sloped front, mantlet, jacketed barrels, muzzle brakes) on a low barbette on the prow deck. |
| VLS citadel | 0.6 … 8.6 | Sloped armoured box with 4 × 6 hatch cells (hinged lids) around a centre walkway rail, five blast vents per side slope, a slate-blue band on the front slope, and amber corner lamps. |
| Turret B | ≈ −3.4 | The same twin house on a tall ribbed barbette, superfiring over the citadel. |
| Pylons | −12 … −6.4, 0.8 … 6.2 | Swept armoured struts from the lower hull wall into each pod, with sloped top slabs, a trim leading edge, conduit pairs underneath and an amber lamp. A mess-deck window band runs between the pylons. |
| Sponson pods | −18 … 12.8 (x = ±7.2) | Octagonal armoured pods: a slate-blue collar ring, gun shield + cheek armour + beacon, a breaching cannon (recoil jacket, heat rings, ported muzzle brake) reaching s ≈ 20. They also carry a PD turret, RCS quads, vent louvres, a hatch, a ventral radiator, marker lamps, and an engine with gimbal struts at the stern. |
| Bridge | −19.8 … −8.4 | Armoured casemate (plated roof, a lit window row on the front slope) under a raked blade tower. The tower has two rows of bridge windows on the raked front, an armoured brow, side plates, side ports and an accent edge stripe. Its roof carries a comms array, two sensor blisters and amber beacons. |
| Stern | −23 … −25.3 | Engine frame (plate slab, centre post, upper/lower beams), two deep main nozzles (r 1.3) with gimbal actuators, blue corner beacons, amber lamp rows, engineering louvres and stern RCS. |
| Keel | whole length | Keel spine blocks, ventral twin turret C (≈ s 4.8), keel sensor arrays, magazine hatches, and aft radiator banks. |

The PD turrets sit on the prow and aft upper slopes, the midships low slopes and the sponson tops. Crew window
bands run on the aft hull walls (two belts), and amber marker rows follow the upper and lower slope breaks.

## Rules / contract

* Materials: hull, hull2, plate, greeble, trim, accent (slate blue), exhaust, glass, window, amber, blue_light and
  engine. The palette values are the same as the ion frigate's, so the renderer's PBR remap treats both alike.
  There is no white paint.
* `engine` is used only on the four aft-facing nozzle throat discs, with normals forced to glTF −Z
  (`fix_normals`). The renderer's `emissiveClusters('engine')` therefore finds four plume points: two main
  nozzles and two pod engines.
* Tris: 54,310 (budget 60,000). The LOD (`make_lods.py`, ratio 0.35) has 19,008. The engine discs survive in the
  LOD with −Z normals.
* Deterministic: `rng(1111)` drives the armour cuts, sub-plates, plate tones and which windows are lit.
* Placement: the structure is built first, then every piece of equipment is placed by ray casting onto the
  finished armour (`Surf` from `ships_ion_frigate`), mirrored port/starboard.
* Previews: `render_assault_frigate.py` (Cycles CPU) writes `previews/assault_frigate_v11_{hero,side,rear}.png`.
