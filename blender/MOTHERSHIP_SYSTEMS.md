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
* **Armour** follows the enemy dreadnought's construction (`shipkit.armor` + `cuts`, reused directly): long plates
  (22 … 44 m) in bands along the hull stations, ~0.9 m gaps between plates, 20 … 25 % stacked sub-plates, 80/20
  alternation of the flagship's own materials (hull2 / plate over hull). Bands: one per chamfer, two per low chamfer,
  three belts on each wall (upper / citadel / lower), deck lanes that taper with the deck, keel belts either side of
  a structural keel spine. The strake roof and the sponsons are armoured with the same routine through a `RingHull`
  wrapper around their lofted sections, so the plating bands follow the swept wedge line.
* The deck armour leaves **open channels** beside the spine foot (power / coolant trunks lie in them) and the midship
  service trench.
* Equipment rows are snapped to the bulkhead grid, oriented along the hull axis and placed by ray-casting the
  finished armour (plinths sit on the plate they are bolted to and bridge seams; a site that would overhang an edge is
  dropped, and flank pairs are kept only if both sides fit, so the layout stays symmetric).
* **No masts, antennae or dishes anywhere**: all sensing / comms is flush phased-array panels and low blisters.

## Zones, bow -> stern

| zone | s range | what & why | typical sizes |
|---|---|---|---|
| **A  Main gun** | 240 … 337 | Ion cannon (existing) + armoured brow. **Capacitor banks** flank the brow on the deck: the gun needs its storage as close to the breech as possible (short high-current bus). **Fire-control phased arrays** on both forward walls: widest field of view along the barrel line. **Breech coolant louvres** on the walls just aft of the arrays. **PD pairs** on the lower chamfers cover the bow's blind arc under the barrel. **RCS quads** at the four bow corners (longest lever arm for pitch / yaw). | capacitor cans r 1.0 x 2.4 m in 2x3 racks; arrays 12 x 16 m; PD 2.4 m; RCS block 3.2 m |
| **B  Forward battery** | 150 … 240 | Four heavy dorsal turrets (existing positions). **VLS missile cell blocks** in the deck lanes between them (magazine directly below, far from crew). **PD batteries** in threes on the upper chamfer each bulkhead bay (overlapping arcs down the flanks). **Long-range sensor array + blisters** flush on the forward spine roof (clear sky arc, above the turret blast). **Crew window bands** (3 decks) on the forward walls; **docking ports** at mid-wall height (s ~ 140) between the window decks. | VLS 4x6 cells of 2.2 m; spine array 6 x 20 m; docking collar r 4 m |
| **C  Hangar / midship** | -44 … 150 | Starboard hangar wall and port launch bay (existing, untouched). On the **strake roof over the hangars**: a row of **hangar-lift / cargo hatches** (craft and ordnance come up from the hangar deck below), one per alternating bay. **Shield emitter nodes** on the strake's outer edge every bulkhead (even spacing gives full overlap of the field). **PD pairs** and **hangar atmosphere / exhaust vent banks** in the bays between the hatches. Deck lanes: **main power trunk** conduit (reactor -> cannon) along the spine foot, **service trench** with guide lights at x = +-30; **walkway + coolant trunk** along the strake's inner edge. Spine top: **comms phased-array panels + blisters** (flush, above the crew decks). Keel: **cargo transfer hatches** and **ventral docking ports** directly below the hangars. | lift hatches 14 x 10 m; emitters r 2 m; trunk 3 x r 0.55 m pipes; comms arrays 8 x 20 m |
| **D  Command** | -140 … -44 | Command block + canopy (existing). Roof: **flush comms array + two sensor blisters** behind the dome. Strake roof: emitters continue, **secondary sensor arrays** (flank coverage), PD pairs. | roof array 14 x 6 m; flank arrays 12 x 16 m |
| **E  Engineering** | -291 … -140 | Reactor under the aft spine. **Radiator banks** (fins across the flow, header pipes both ends) line the deck lanes beside the reactor spine and fill the wide aft strake roof and the sponson tops in a regular grid — waste heat is rejected as close to the reactor as possible and on the largest dorsal area that no crew space needs. **Coolant manifolds** at the head of each radiator column feed a **coolant trunk** lying in the open deck channel beside the reactor spine. **Engine-room vent louvres** on the stern deck; **RCS quads** at the sponson tips (fore and aft corners) and stern corners. Keel: reactor **maintenance hatches**, coolant dump ports. | radiator banks 12 x 20 m, fins 0.35 m @ 1.6 m, 2.2 m high; manifolds 6 x 3 x 1.8 m |

## Everywhere

* **Walkways with railings** along the strake's inner edge and the forward deck edges (EVA / maintenance access to
  every row of equipment).
* **Conduit runs** follow hull lines, never diagonal: power trunk in the deck channel, coolant trunks on the strake and in the reactor-deck channel, a pipe
  bundle along the top of each wall (under the chamfer) and one along the keel. Clamp brackets every 6 m frame.
* **Access hatches** on the spine roof and strake; **airlocks** in the upper wall belt every other bulkhead forward.
* **Navigation / marker lights**: amber deck-edge and strake-edge rows (existing, regular pitch), blue beacons at the
  extremities, amber door-edge markers on hatches and docking ports.

## Rules followed

* Components stay low (< ~3 m proud of the armour) except turrets; no masts / antennae at all.
* Nothing inside the starboard bay volume (build-time `check_bay()` = 0) and nothing in or in front of the port launch
  bay mouth (x -74 … -62, z -17 … 26, s 22 … 92).
* Materials keep their meaning: hull / hull2 / plate (armour), greeble (machinery), trim (bare metal: rails, pipes,
  frames), window / amber / blue_light (lights), glass, engine, muzzle.
* Deterministic (seeded RNG: armour plate cuts / sub-plates / tones, which cabins are lit). Equipment positions are fixed
  by the zoning plan, not random.
