# Art

Sources for rendering the game's tile art in Blender, one zone or one set of single tiles at a time. Every image here ships with the game's source, so its generator's or author's terms must allow distribution under GPLv3 (`LICENSE`).

The generated images come from Google's Gemini image model or from ChatGPT, and where each image is described names its generator. Google claims no ownership of what its Gemini API generates (the [Gemini API Additional Terms of Service](https://ai.google.dev/terms)), and OpenAI's [Terms of Use](https://openai.com/policies/terms-of-use) assign what ChatGPT generates to the user, so images of both kinds can ship under the game's licence.

- `references/`: concept sheets of whole zones that the scenes are modelled on, described in `references/README.md`.
- `textures/`: seamless surface textures (roofs, paving, glass, grass). Their rules and provenance are in `textures/README.md`.
- `sheets/`: sprite sheets of whole objects drawn on black, seen from above, and the game's original 16 px sheets, `tiles-original.png` and `sprites-original.png`, as they were before any art was painted into them.
- `cutouts/`: each object cut from a sheet into its own transparent PNG by `tools/cutout.py`.
- `fonts/`: the typeface of the zone letters, with its licence.
- `blender/tileart.py`: the shared module: materials, shapes, cutout cards, and the render.
- `blender/zones/`: one script per zone.
- `blender/tilesets.py`: what the single-tile sets share: the land and water, and the shores, roads, rails and power lines that must meet where two tiles touch.
- `blender/tiles/`: one script per set of single tiles, such as every road piece, rendering each tile id the set covers.
- `blender/stadium.py`: the stands, pitch and game that the empty and the full stadium share.
- `blender/vehicles/`: one script per vehicle, each sprite and the car, rendering each of its frames.
- `blender/out/`: rendered zones and tiles, one directory of layers each. Ignored by git: a render is rebuilt from its script.
- `painted/`: the renders repainted as oil paintings, in the same layers, described in `painted/README.md`.
- `tools/`: generating an image from a prompt (`generate.py`, with Google's Gemini image model), cropping a reference zone (`reference.py`), comparing a rendered zone with it (`compare.py`), cutting sheets into cutouts (`cutout.py`), previewing rendered zones side by side (`preview.py`), repainting renders (`paint.py`, as the art-painting skill describes), and building the game's atlases from them (`atlas.py`). `designs.py` is what they share: which design fills which tile ids and sprite frames, and the one way to load an asset's layers. `tools/tests/` checks the atlas build's committed output and the painted single tiles against the layers the paint build's join works from (see Building the atlases).

## The Python tools

The tools need the packages in `requirements.txt`, at the versions it pins, which neither the system Python nor Blender's own has. Install them into a virtual environment, whose Python is the `python` in every command in the READMEs under `art/`:

```bash
python3 -m venv <env>
<env>/bin/pip install -r art/requirements.txt
<env>/bin/python art/tools/preview.py ...
<env>/bin/pytest art/tools/tests
```

## Rendering a zone

Needs Blender 4.0 or later (`apt install blender` on Ubuntu).

```bash
blender --background --python art/blender/zones/commercial_glass_tower.py
```

This writes the zone's layers into `art/blender/out/commercial_glass_tower/`. Passing `-- <directory>` after the script name writes there instead.

A zone with animated tiles, such as a factory whose chimney smokes, renders through `render_animated()`: the still zone as above, then the whole zone again for each frame into `frame-<n>` inside its directory, from which the atlas build cuts the animated tiles. Whatever moves stays inside its tile in every frame. Frame numbers after the directory (`-- <directory> 0,4`) render the still zone and only those frames.

The service buildings and the hospital are zones too: the seaport, the airport, whose radar turns, the coal power plant, whose stacks smoke, the fire and police stations, the empty and the full stadium, whose game plays, the nuclear power plant, whose atom turns, and the hospital. Which tile ids each zone fills is `ZONES` in `tools/designs.py`, and which tiles an animated one renders frames of, with each frame's id, is `FRAMES` beside it.

## Rendering a set of tiles

A script in `blender/tiles/` renders a set of single tiles, each as a zone of one tile, into `art/blender/out/<set>/<id>/`, the id as `src/tileValues.ts` numbers it, in four digits. Ids after the directory render only those:

```bash
blender --background --python art/blender/tiles/roads.py
blender --background --python art/blender/tiles/roads.py -- art/blender/out/roads 66,80-83
```

- `land.py`: bare land.
- `water.py`: open water and the river's shores.
- `woods.py`: woods and their edges.
- `parks.py`: what the park tool lays: the gardens and the fountain.
- `rubble.py`: rubble, and the bulldozer's small explosion.
- `roads.py`: road pieces, bridges, roads under power lines, and the open drawbridges. The rules' traffic tiles have no art: the game draws them as the plain road they run on, and its traffic as cars.
- `power.py`: power lines, and the unpowered zone's warning.
- `rail.py`: rail, its bridges and crossings.
- `houses.py`: the single-tile houses a residential zone grows.

Which tile ids each set renders, in named groups such as an open drawbridge's frames, is `SINGLE_TILES` in `tools/designs.py`.

A set of edge tiles, such as the shores or the road pieces, is one scene with a variant for each pattern of neighbours the game gives it, in which everything that reaches the tile's edge meets it at the same place, width and height, and every ground texture and stain repeats a whole number of times across the tile, so any two tiles side by side join without a seam. Animated tiles are one tile id per frame.

## Rendering a vehicle

A script in `blender/vehicles/` renders a vehicle's frames, each into `art/blender/out/<vehicle>/<frame>/`, two digits; frame numbers after the directory render only those. A sprite's frames are numbered as the game numbers them (the `*Sprite.cs` files of `server/Micropolis.Rules`), and the car's, which is no sprite, colour × 4 + way. A sprite's frame is three tiles square, as the original's 48 px cell, with the vehicle standing on its middle, and renders as two layers: `objects.png`, the vehicle over transparency, and `shadow.png`, its shadow on flat ground in the same frame. A vehicle that flies is built above the middle by its height, so the shear draws it up and to the right of where it is and its shadow falls away from it, and it reads as flying. The game draws the train and the helicopter into a square of two tiles, as the original's 32 px sprites, so the atlas build crops their frames to the middle two tiles, and everything of theirs, shadow included, stays inside it.

- `train.py`: the railcar.
- `helicopter.py`: the traffic helicopter.
- `airplane.py`: the airliner.
- `ship.py`: the cargo ship.
- `car.py`: the cars the game drives along the city's trips: a car of each colour of `CAR_COLOURS`, from the cutouts the zones park, facing north, east, south and west, standing in the middle of a frame of one tile, which the game draws whole, so its shadow stays inside it.

Each vehicle's sprite type, the square the game draws it into and its number of frames are `SPRITES` in `tools/designs.py`, and the car's colours and frames `CAR_COLOURS`, `CAR_WAYS` and `CAR` beside it, which the atlas build writes into the manifest's `cars` (`docs/render-assets.md`).

## Building the atlases

The game draws the map from the atlases and manifest in `images/render/`, in the format `docs/render-assets.md` specifies. `tools/atlas.py` builds them from one set of layers, the painted ones or the renders, which are laid out alike:

```bash
python art/tools/atlas.py --source art/painted/out
```

It cuts every asset's ground and objects into a rectangle per tile id and keeps its shadow whole on the zone's centre, gives each tile drawn over shadows its whole tile, opaque, as objects too, packs them with the gutters the format asks for, and writes the manifest. It also writes `images/tiles.png` and `images/sprites.png`, for what the game still draws from them, the splash screen's map and the monster TV: the original sheets in `sheets/`, with each tile id and sprite frame it has art for scaled down to 16 px into its cell, so a cell whose art is removed goes back to the original. Last it writes the page background, `images/dirtbg.png`, from the bare land tile. It reads nothing under `images/`, and `--out <directory>` writes all of it into that directory instead. So a change to the game's own 16 px art, such as one picked up from the upstream repository, goes into `sheets/tiles-original.png` or `sheets/sprites-original.png`, and then the build runs again: the next build writes over a change made in `images/`. Which design fills which tile ids, which frames each animated tile cycles through, which frame is which car, and which tiles are drawn over shadows, is in `tools/designs.py`: `SINGLE_TILES`, `ZONES`, `FRAMES`, `SPRITES`, `CAR` and `OVER_SHADOWS`. The cars are packed into the sprites' atlases, each frame whole, and the manifest names them under `cars`, by colour and way.

It runs by hand, and its output is committed: the renders it would need are not, and CI has no Blender. `pytest art/tools/tests` builds again from `painted/out` into a temporary directory and fails unless the committed manifest is the build's exactly and every committed image is the build's pixel for pixel, naming the tile ids or sprite frames of a sheet that differ. So a painted layer committed without the build it changes fails, as does an image edited by hand. The tests also check the tables in `designs.py` against `painted/out`, a design for every asset they name and every painted asset named, each with its three layers but a vehicle's frame, which has no ground, and no tile id twice; and the build's atlases against the format's size, gutters and shadow sizes.

The painted single tiles come from `paint.py join`, which gives each the paintings of its donor tiles from the layers the paint build kept in `painted/built/`, where its render matches theirs (the art-painting skill). The tests check the painted single tiles against them: every single tile has its built ground and objects, a tile the join leaves (`NOT_JOINED` in `designs.py`) is its built layers pixel for pixel, and every pixel of a joined tile is its built layers' or a donor's painting at that pixel, naming each tile that differs; and the join's rules on a few pixels of their own. The join itself reads the renders too, which CI has not, and only they say which donor gives a pixel, so the test that runs it on the committed layers runs by hand, after rendering the single tile sets (Rendering a set of tiles): `pytest art/tools/tests --renders` joins again from `painted/built/` into a temporary directory and fails, naming the tiles, unless it writes the committed painted layers pixel for pixel. Run it before committing a join: a join that changes a tile that takes nothing from the set that changed is drift in its inputs, such as a render older than its script. The tools load an asset's layers through `designs.py`, which fails on any missing layer but a vehicle's ground, and a single tile's built layers through it too.

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

Each argument after the output is a row of zone names; an empty name is bare lawn. A number is a single tile's id, so a grid of ids previews a strip of map, and `--original` also writes the same grid from the game's original 16 px tiles, `sheets/tiles-original.png`, to `<out>-original.png`. Every entry in one preview must be the same size, so a grid holds tiles or zones, not both.

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

It counts near-black area joined to the sheet's border as background, so a sheet's objects must not touch each other or the border.

- **`sheets/cars.png`** → `cutouts/cars/car-01` to `car-21`: cars, nose up, in three rows of seven. The last two in each row are larger: estates and vans (`car-06`, `car-07`, `car-13`, `car-21`) and pickups (`car-14`, `car-20`). Generated with ChatGPT.
- **`sheets/plants.png`** → `cutouts/plants/plant-01` to `plant-40`: trees (`01` to `11`), small trees and flowering shrubs (`12` to `19`), hedges and bushes (`20` to `29`, with `20` and `21` hedge-shaped), and small plants (`30` to `40`). `plant-34`, `plant-36` and `plant-40` show black from the sheet between their leaves and twigs. Generated with ChatGPT.
