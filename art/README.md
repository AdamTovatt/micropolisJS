# Art

Sources for rendering the game's tile art in Blender, one zone at a time. Every image here ships with the game's source, so its generator's or author's terms must allow distribution under GPLv3 (`LICENSE`).

- `references/`: concept sheets of whole zones that the scenes are modelled on, described in `references/README.md`.
- `textures/`: seamless surface textures (roofs, paving, glass, grass). Their rules and provenance are in `textures/README.md`.
- `sheets/`: sprite sheets of whole objects drawn on black, seen from above.
- `cutouts/`: each object cut from a sheet into its own transparent PNG by `tools/cutout.py`.
- `fonts/`: the typeface of the zone letters, with its licence.
- `blender/tileart.py`: the shared module: materials, shapes, cutout cards, and the render.
- `blender/zones/`: one script per zone.
- `blender/out/`: rendered zones, one directory of layers each. Ignored by git: a render is rebuilt from its script.
- `tools/`: generating an image from a prompt (`generate.py`, with Google's Gemini image model), cropping a reference zone (`reference.py`), comparing a rendered zone with it (`compare.py`), cutting sheets into cutouts (`cutout.py`), and previewing rendered zones side by side (`preview.py`).

## Rendering a zone

Needs Blender 4.0 or later (`apt install blender` on Ubuntu).

```bash
blender --background --python art/blender/zones/commercial_glass_tower.py
```

This writes the zone's layers into `art/blender/out/commercial_glass_tower/`. Passing `-- <directory>` after the script name writes there instead.

## Layers

A zone renders as three layers, so its shadows can fall across its neighbours without ever darkening a roof:

- `ground.png`: everything that lies on the ground (no taller than `GROUND_TOP`), with no shadow on it.
- `shadow.png`: black, whose alpha is the shadow everything standing casts onto flat ground. It reaches past the zone, by whole tiles, as far as the zone's longest shadow does; `layers.json` records how far on each side.
- `objects.png`: everything standing (buildings, trees, cars) over transparency, with the shadows the zone casts on its own objects.

The game draws every zone's ground, then the shadow layers merged by taking the darkest at each pixel, so overlapping shadows never darken twice, then every zone's objects. A shadow therefore falls across a neighbour's ground but never on its buildings, trees or cars. `tools/preview.py` composites rendered zones in that order, in a grid:

```bash
python art/tools/preview.py city.png commercial_glass_tower,residential_apartment_slabs commercial_office_park,
```

Each argument after the output is a row of zone names; an empty name is bare lawn. It needs Pillow.

## Conventions

- **Units.** One world unit is one tile. A scene puts its zone's south-west corner at the origin, with x east and y north.
- **The view.** The camera looks straight down, and `render()` shears every point up and to the right by `SHEAR` times its height, so the ground grid stays square and the west and south walls show, as in the original tiles. The sun's direction is sheared by the same amount, which keeps every shadow exactly where an upright scene would cast it.
- **Size.** A zone renders at `TILE_PX` pixels per tile, rendered at twice that and scaled down.
- **Fit.** Nothing but a shadow may reach past the zone's edge, sheared tops included: the game draws each tile on its own. `render()` fails, naming the objects, when anything the camera sees stands past the edge. `keep_inside()` moves a tree in from the edge.
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
