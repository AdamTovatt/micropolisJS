# Art

Sources for rendering the game's tile art in Blender, one zone or one set of single tiles at a time. Every image here ships with the game's source, so its generator's or author's terms must allow distribution under GPLv3 (`LICENSE`).

- `references/`: concept sheets of whole zones that the scenes are modelled on, described in `references/README.md`.
- `textures/`: seamless surface textures (roofs, paving, glass, grass). Their rules and provenance are in `textures/README.md`.
- `sheets/`: sprite sheets of whole objects drawn on black, seen from above.
- `cutouts/`: each object cut from a sheet into its own transparent PNG by `tools/cutout.py`.
- `fonts/`: the typeface of the zone letters, with its licence.
- `blender/tileart.py`: the shared module: materials, shapes, cutout cards, and the render.
- `blender/zones/`: one script per zone.
- `blender/tilesets.py`: what the single-tile sets share: the land and water, and the shores, roads, rails and power lines that must meet where two tiles touch.
- `blender/tiles/`: one script per set of single tiles, such as every road piece, rendering each tile id the set covers.
- `blender/stadium.py`: the stands, pitch and game that the empty and the full stadium share.
- `blender/vehicles/`: one script per vehicle sprite, rendering each of its frames.
- `blender/out/`: rendered zones and tiles, one directory of layers each. Ignored by git: a render is rebuilt from its script.
- `painted/`: the renders repainted as oil paintings, in the same layers, described in `painted/README.md`.
- `tools/`: generating an image from a prompt (`generate.py`, with Google's Gemini image model), cropping a reference zone (`reference.py`), comparing a rendered zone with it (`compare.py`), cutting sheets into cutouts (`cutout.py`), previewing rendered zones side by side (`preview.py`), and repainting renders (`paint.py`, as the art-painting skill describes).

## Rendering a zone

Needs Blender 4.0 or later (`apt install blender` on Ubuntu).

```bash
blender --background --python art/blender/zones/commercial_glass_tower.py
```

This writes the zone's layers into `art/blender/out/commercial_glass_tower/`. Passing `-- <directory>` after the script name writes there instead.

A zone with animated tiles, such as a factory whose chimney smokes, renders through `render_animated()`: the still zone as above, then the whole zone again for each frame into `frame-<n>` inside its directory, from which the atlas build cuts the animated tiles. Whatever moves stays inside its tile in every frame. Frame numbers after the directory (`-- <directory> 0,4`) render the still zone and only those frames.

The service buildings and the hospital are zones, each listed by the tiles it renders and, for an animated one, the tiles whose frames it renders into `frame-<n>`:

- `seaport.py`: 693 to 708.
- `airport.py`: 709 to 744; the radar at 711 turns through 832 to 839.
- `coal_power_plant.py`: 745 to 760; the stacks at 747, 748, 751 and 752 smoke through 916 to 931.
- `fire_station.py`: 761 to 769.
- `police_station.py`: 770 to 778.
- `stadium_empty.py`: 779 to 794.
- `stadium_full.py`: 795 to 810; the game at 801 and 805 plays through 932 to 939 and 940 to 947.
- `nuclear_power_plant.py`: 811 to 826; the atom at 820 turns through 952 to 955.
- `hospital.py`: 405 to 413.

## Rendering a set of tiles

A script in `blender/tiles/` renders a set of single tiles, each as a zone of one tile, into `art/blender/out/<set>/<id>/`, the id as `src/tileValues.ts` numbers it, in four digits. Ids after the directory render only those:

```bash
blender --background --python art/blender/tiles/roads.py
blender --background --python art/blender/tiles/roads.py -- art/blender/out/roads 66,80-83
```

- `land.py`: bare land, tile 0.
- `water.py`: open water and the river's shores, 2 to 20.
- `woods.py`: woods and their edges, 21 to 37.
- `parks.py`: what the park tool lays: the gardens, 40 to 43, and the fountain, 840 to 843.
- `rubble.py`: rubble, 44 to 47, and the bulldozer's small explosion, 860 to 867.
- `roads.py`: road pieces, bridges, roads under power lines and the traffic on them, 64 to 207 and 239, and the open drawbridges, 828 to 831 and 948 to 951.
- `power.py`: power lines, 208 to 220, and the unpowered zone's warning, 827.
- `rail.py`: rail, its bridges and crossings, 221, 222 and 224 to 238.
- `houses.py`: the single-tile houses a residential zone grows, 249 to 260.

A set of edge tiles, such as the shores or the road pieces, is one scene with a variant for each pattern of neighbours the game gives it, in which everything that reaches the tile's edge meets it at the same place, width and height, and every ground texture and stain repeats a whole number of times across the tile, so any two tiles side by side join without a seam. Animated tiles are one tile id per frame.

## Rendering a vehicle

A script in `blender/vehicles/` renders a sprite's frames, numbered as the game numbers them (`src/*Sprite.js`), each into `art/blender/out/<vehicle>/<frame>/`, two digits; frame numbers after the directory render only those. A frame is three tiles square, as the original's 48 px cell, with the vehicle standing on its middle, and renders as two layers: `objects.png`, the vehicle over transparency, and `shadow.png`, its shadow on flat ground in the same frame. A vehicle that flies is built above the middle by its height, so the shear draws it up and to the right of where it is and its shadow falls away from it, and it reads as flying.

- `train.py`: the railcar, sprite 1, frames 0 to 4.
- `helicopter.py`: sprite 2, frames 0 to 7.
- `airplane.py`: the airliner, sprite 3, frames 0 to 10.
- `ship.py`: the cargo ship, sprite 4, frames 0 to 7.

## Layers

A zone renders as three layers, so its shadows can fall across its neighbours without ever darkening a roof:

- `ground.png`: everything that lies on the ground (no taller than `GROUND_TOP`), with no shadow on it.
- `shadow.png`: black, whose alpha is the shadow everything standing casts onto flat ground. It reaches past the zone, by whole tiles, as far as the zone's longest shadow does; `layers.json` records how far on each side.
- `objects.png`: everything standing (buildings, trees, cars) over transparency, with the shadows the zone casts on its own objects.

Beside them, `<layer>-letters.png` masks the zone letters of each layer that holds any, its alpha where the camera sees them, and `<layer>-marks.png` the marks that tell a zone apart as a letter does, such as the nuclear plant's atom, which `mark()` names: the painted layers take both from the render through them (`painted/README.md`). They are rendered after the layers, which come out exactly as without them.

The game draws every zone's ground, then the shadow layers merged by taking the darkest at each pixel, so overlapping shadows never darken twice, then every zone's objects. A shadow therefore falls across a neighbour's ground but never on its buildings, trees or cars. `tools/preview.py` composites rendered zones in that order, in a grid:

```bash
python art/tools/preview.py city.png commercial_glass_tower,residential_apartment_slabs commercial_office_park,
```

Each argument after the output is a row of zone names; an empty name is bare lawn. A number is a single tile's id, so a grid of ids previews a strip of map, and `--original` also writes the same grid from the game's 16 px tiles, to `<out>-original.png`. Every entry in one preview must be the same size, so a grid holds tiles or zones, not both. It needs Pillow.

## Conventions

- **Units.** One world unit is one tile. A scene puts its zone's south-west corner at the origin, with x east and y north.
- **The view.** The camera looks straight down, and `render()` shears every point up and to the right by `SHEAR` times its height, so the ground grid stays square and the west and south walls show, as in the original tiles. The sun's direction is sheared by the same amount, which keeps every shadow exactly where an upright scene would cast it.
- **Size.** A zone renders at `TILE_PX` pixels per tile, rendered at twice that and scaled down.
- **Fit.** Nothing but a shadow may reach past the zone's edge, sheared tops included: the game draws each tile on its own. `render()` fails, naming the objects, when anything the camera sees stands past the edge. `keep_inside()` moves a tree in from the edge. The one exception is something that crosses a tile's edge by design, running on into the neighbour that continues it, such as a power line's wire or a bridge's deck: `spans_edge()` marks it, and the scene builds it past the west and south edges by at least its sheared lift, so where the frame cuts it off the neighbour's copy takes over.
- **Neighbours' shade.** A tile's objects are lit as if nothing stood beside it, so trees along a tile's sunny edges come out brighter than the rest, marking out the grid in a forest. `neighbours_shade()` marks a stand-in for a neighbour's object, which shades this tile's objects as the neighbour's would but is never seen and casts nothing in the shadow layer.
- **No streets.** A zone holds no road that runs to its edge: roads are what the player builds between zones, and a street drawn into a zone would end at its neighbour. Footpaths, car parks and the drives inside them are fine.
- **Light.** One warm sun from the north-west and a weak blue sky, set in `render()` so every zone is lit alike.
- **Zone letters.** `zone_letter()` sets the R, C and I in `fonts/Tomorrow-ExtraBold.ttf`, sized to the height asked for and raised from the roof so they cast a shadow. The font ships under the SIL Open Font License, in `fonts/OFL.txt`, which must stay beside it.
- **No coplanar overlaps.** Two surfaces overlapping at exactly one height render a dark seam. Give overlapping ground layers different heights, or make them one shape.
- **Repeatable.** A scene that scatters things draws from its own seeded `random.Random`, so it renders the same every time.

## Cutouts

A cutout goes into a scene through `car()`, `tree()` or `shrub()` in `tileart`. Each lays the cutout on a flat transparent card at the object's height, and gives the card a body down to the ground, so its shadow starts where the object stands: a tree gets a trunk, and a car or shrub gets a solid that only the sun sees. Cars are parked with `parking_row()`, which draws the bays and stands each car inside one. A cutout's name is its sheet's prefix and its place on the sheet in reading order. To cut a new sheet:

```bash
python art/tools/cutout.py art/sheets/<sheet>.png art/cutouts/<sheet> <prefix>
```

The tool needs Pillow, NumPy and SciPy. It counts near-black area joined to the sheet's border as background, so a sheet's objects must not touch each other or the border.

- **`sheets/cars.png`** → `cutouts/cars/car-01` to `car-21`: cars, nose up, in three rows of seven. The last two in each row are larger: estates and vans (`car-06`, `car-07`, `car-13`, `car-21`) and pickups (`car-14`, `car-20`).
- **`sheets/plants.png`** → `cutouts/plants/plant-01` to `plant-40`: trees (`01` to `11`), small trees and flowering shrubs (`12` to `19`), hedges and bushes (`20` to `29`, with `20` and `21` hedge-shaped), and small plants (`30` to `40`). `plant-34`, `plant-36` and `plant-40` show black from the sheet between their leaves and twigs.
