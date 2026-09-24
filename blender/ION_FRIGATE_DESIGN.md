# Ion-cannon frigate — design note (v10, "lance" frigate)

Implemented in `ships_ion_frigate.py:ion_frigate()` (wired into `build_models.py` as `ion_frigate`).
Original design. Same family as the v9 flagship: blue-black gunmetal armour laid out with the dreadnought /
flagship method (`shipkit.armor()` + `cuts()` + `plate()`), lighter armour plates, a restrained slate-blue trim
accent, amber marker lights, and **no antennas or masts** (all sensing is flush arrays and low blisters).

Coordinates: station `s` = metres forward (glTF +z, muzzle exit s = +31.5, stern nozzle exits s ~ -36.6),
`x` = starboard(+)/port(-), `z` = up (glTF y). Barrel axis: x = 0, z = +0.9.

## What it is for

A line ship built around **one spinal ion cannon**. The whole hull is the gun's mounting: the barrel is a straight
46 m accelerator running from the breech inside the main hull to the muzzle at the very bow, so the ship aims the
gun by turning the ship. Everything else exists to charge, cool, aim and protect that gun: a reactor to charge the
capacitors, radiators to dump the heat of a shot, fire-control arrays with a clear view down the barrel line, PD to
keep missiles and fighters off a ship that cannot manoeuvre while it is charging, and a crew section kept as far
from the muzzle and the reactor as the length allows. It fights in tight formations of 4-24 hulls (volley fire),
so it is narrow (13 m) and low (≈15 m with superstructure).

## Zones, bow -> stern

| zone | s range | what & why | sizes |
|---|---|---|---|
| **A Muzzle** | 28 … 31.5 | Heavy muzzle crown: armoured cylinder with 8 radial field vanes, a thick lip ring and a deep dark bore. The emissive `muzzle` disc sits 0.25 m inside the lip at the exit plane (s = 31.25) — the beam leaves from here. | crown r 1.75, bore r 0.95 |
| **A Focusing** | 23.2 … 28 | Quadrupole focusing section: four magnet blocks at 45° around a thickened barrel collar, trim collar rings both ends, coolant jumpers. The strongback's armoured nose carries it. | magnets 0.9 x 4 m |
| **B Accelerator** | 6.8 … 23.2 | Exposed barrel in four **accelerator stages** (armoured stage flange + three copper coil rings each, 1 m pitch). Each stage has its own **capacitor module** on both flanks of the strongback (armoured housing with a 2 x 3 rack of capacitor cans on top) feeding its coils through short diagonal bus bars — storage as close to each coil as possible. The barrel sits on saddles on a narrow armoured **strongback keel** that carries recoil into the main hull. Two coolant lines run the barrel's length. Bow RCS quads on the strongback nose; blue beacons. | coil r 1.65; strongback 4.5 x 3 m |
| **C Breech & charging** | -6 … 7 | Barrel enters the main hull through an armoured collar on the glacis. Deck: armoured **charging gallery** over the breech line (main bus trunk), flanked by the **main capacitor racks** (2 x 3 cans each side). **Fire-control phased arrays** flush on both forward walls (widest view along the barrel). **RCS quads** at the forward deck corners, **PD** pair on the upper chamfers, fire-control blister on the keel. | racks 2 x 3.5 m; arrays 3 x 4 m |
| **D Reactor & heat** | -17 … -6 | Reactor below the deck. **Radiator banks** (fins across the hull, header pipes, fore manifolds) on the deck either side of a central **coolant trunk**, and a second pair on the keel. **Reactor vent louvres** on the walls. **PD** pair on the low chamfers. | radiator banks 3.2 x 4.8 m, fins 0.12 @ 0.45 m |
| **E Command & crew** | -29 … -17 | Low armoured **command block** with a slanted, windowed front and a stepped upper tier; roof: two **sensor blisters** and a flush comms array. Crew **window bands** (two decks) on the walls, an **airlock** and a **docking collar** per flank, **PD** pair on the upper chamfers. | block 8.4 x 11 x 2.6 m |
| **F Engines** | -36.6 … -29 | Engineering deck louvres, **RCS quads** at the four stern corners. **Engine block**: four deep gimballed nozzles (2 x 2) in armoured sleeves with cooling bands, heat-tinted bells, central plug; cross frame between them; the `engine` discs are the aft-facing throat discs only. | nozzles r 1.6, 2.8 m deep |

## Rules

* Armour: long plates (3.6 … 7.5 m) in bands along the hull stations, ~0.3 m gaps, sub-plates on ~20 % of plates,
  hull2 / plate alternation on top, plate / hull underneath. Chamfer, wall (three belts), deck lanes, keel belts +
  keel spine blocks, same routine on the strongback. The deck lane over the breech/reactor stays open for the
  gallery and coolant trunk.
* Equipment is placed by the zoning plan on the finished armour by ray casting (it sits on the plate it is bolted to);
  mirrored port/starboard; nothing more than ~1.5 m proud except the command block.
* Materials (glTF metallic-roughness): hull / hull2 / plate (armour), greeble (machinery), trim (bare metal), coil
  (copper coil windings), accent (slate-blue trim stripes), exhaust (heat-tinted nozzle metal), glass, window,
  amber, blue_light, engine, muzzle. `muzzle`, `engine`, `window` keep the names the engine relies on.
* Deterministic: `rng(1010)` drives armour cuts, sub-plates, plate tones and which windows are lit.
