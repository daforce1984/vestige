# Flagship surface systems — zoning plan (v9 mothership)

Implemented in `ships_mothership_v9.py` (section "SYSTEMS"). This replaces the random box scatter with purpose-built
machinery. The silhouette is unchanged: hull stations, profile, spine/bridge, sponsons, strakes, bow cannon, stern,
starboard bay wall and port launch bay stay exactly where they were.

Coordinates: station `s` = metres forward of midship (glTF +z, bow at s = +309, muzzle ~ +337, stern at s = -291),
`x` = starboard(+)/port(-), `z` = up. Main deck is at z ~ 55 amidships, keel at z ~ -36.

## Structural grid (why everything lines up)

* **Frames every 6 m, bulkheads every 24 m** starting at the starboard bay bulkhead s = -44 (…, -44, -20, 4, 28, …,
  124, 148, …). The bay bulkheads (s = -44 / +124) fall on the grid, so the hangar wall, the armour and every row of
  equipment share the same rhythm.
* **Armour**: one plate per 24 m bay (split at the 12 m frame on the deck), fixed thickness per surface, three
  horizontal belts on the walls (upper / citadel / lower). Calm armour is the default; machinery appears only where a
  system needs hull access.
* Everything is snapped to that grid, oriented along the hull axis and placed by ray-casting the finished armour
  (component plinths sit on the plate they are bolted to; anything that would overhang an edge is dropped).

## Zones, bow -> stern

| zone | s range | what & why | typical sizes |
|---|---|---|---|
| **A  Main gun** | 240 … 337 | Ion cannon (existing) + armoured brow. **Capacitor banks** flank the brow on the deck: the gun needs its storage as close to the breech as possible (short high-current bus). **Fire-control phased arrays** on both forward walls: widest field of view along the barrel line. **Breech coolant louvres** on the walls just aft of the arrays. **PD pairs** on the lower chamfers cover the bow's blind arc under the barrel. **RCS quads** at the four bow corners (longest lever arm for pitch / yaw). | capacitor cans r 1.1 x 2.4 m in 2x3 racks; arrays 14 x 16 m; PD 3 m; RCS block 3.5 m |
| **B  Forward battery** | 150 … 240 | Four heavy dorsal turrets (existing positions). **VLS missile cell blocks** in the deck lanes between them (magazine directly below, far from crew). **PD batteries** in threes on the upper chamfer each bulkhead bay (overlapping arcs down the flanks). **Sensor/comms masts** on the forward spine (clear sky arc, above the turret blast). **Crew window bands** (3 decks) on the forward walls; **docking ports** at mid-wall height (s ~ 140) between the window decks. | VLS 4x6 cells of 2.2 m; masts 9 … 14 m; docking collar r 4.5 m |
| **C  Hangar / midship** | -44 … 150 | Starboard hangar wall and port launch bay (existing, untouched). On the **strake roof over the hangars**: a row of **hangar-lift / cargo hatches** (craft and ordnance come up from the hangar deck below), one per alternating bay. **Shield emitter nodes** on the strake's outer edge every bulkhead (even spacing gives full overlap of the field). **PD pairs** in the bays between the hatches. Deck lanes: **main power trunk** conduit (reactor -> cannon) along the spine foot, **service trench** with walkway + guide lights at x = +-30, small access hatches each 12 m. Spine top: **comms antenna farm** (masts + dishes, above the crew decks). Keel: **cargo transfer hatches** and **ventral docking ports** directly below the hangars. | lift hatches 14 x 10 m; emitters r 2.2 m; trunk 3 x r 0.55 m pipes |
| **D  Command** | -140 … -44 | Command block + canopy (existing). Roof: **comms dish + command masts** behind the dome. Strake roof: emitters continue, **secondary sensor arrays** (flank coverage), PD pairs. | dish r 3.5 m |
| **E  Engineering** | -291 … -140 | Reactor under the aft spine. **Radiator banks** (fins across the flow, header pipes both ends) line the deck lanes beside the reactor spine and fill the wide aft strake roof and the sponson tops in a regular grid — waste heat is rejected as close to the reactor as possible and on the largest dorsal area that no crew space needs. **Coolant manifolds** at the head of each radiator column feed a **coolant trunk** running along the strake's inner edge back to the reactor. **Engine-room vent louvres** on the stern deck and on the sponson tip faces; **RCS quads** at the sponson tips (fore and aft corners) and stern corners. Keel: reactor **maintenance hatches**, coolant dump ports. | radiator banks 12 x 20 m, fins 0.35 m @ 1.6 m, 2.2 m high; manifolds 6 x 4 x 2.5 m |

## Everywhere

* **Walkways with railings** along the strake's inner edge and the forward deck edges (EVA / maintenance access to
  every row of equipment).
* **Conduit runs** follow hull lines, never diagonal: power trunk on the deck, coolant trunk on the strake, a pipe
  bundle along the top of each wall (under the chamfer) and one along the keel. Clamp brackets every 6 m frame.
* **Access hatches** at walkway ends and on each bulkhead bay; **airlocks** on the walls between window decks.
* **Navigation / marker lights**: amber deck-edge and strake-edge rows (existing, regular pitch), blue beacons at the
  extremities, amber door-edge markers on hatches and docking ports.

## Rules followed

* Components stay low (< ~3 m proud of the armour) except masts, dishes and turrets.
* Nothing inside the starboard bay volume (build-time `check_bay()` = 0) and nothing in or in front of the port launch
  bay mouth (x -74 … -62, z -17 … 26, s 22 … 92).
* Materials keep their meaning: hull / hull2 / plate (armour), greeble (machinery), trim (bare metal: rails, pipes,
  frames), window / amber / blue_light (lights), glass, engine, muzzle.
* Deterministic (seeded RNG, used only for panel tone and which cabins are lit).
