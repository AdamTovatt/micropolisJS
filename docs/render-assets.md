# Render assets

The map, the monster TV and the splash screen's map preview are drawn with WebGL2 from a manifest and the atlases it names, in `images/render/`. This document specifies the manifest: what an atlas build must write from the zones' rendered layers (`art/README.md`), which `art/tools/atlas.py` does, and what the client (`renderManifest.ts`, `renderAssets.ts`) reads. A tile id or sprite frame the manifest leaves out is drawn from the 16 px sheets, `images/tiles.png` and `images/sprites.png`, so a manifest of no entries draws the game as those sheets always have.

## How the map is drawn

The map is drawn in this order:

1. the world grass, then every tile's ground over it, in one pass (The world grass, below);
2. every anchor's shadow, from the tiles in view and, around them, as many tiles as the farthest shadow reaches, merged into a shadow buffer by the darkest value at each pixel (`blendEquation(MAX)`), which then darkens what the ground pass drew, once;
3. every tile's objects;
4. the map overlay's tint;
5. the cars (`cars.ts`), then the sprites over them.

The tools' outlines are drawn on a 2D canvas over the map. A shadow therefore falls across any tile's ground, but never on objects, and overlapping shadows never darken twice. Ground and objects fill their tile exactly and never reach past it, so neither pass depends on the order tiles are drawn in, and the game can draw the map again in part, around the tiles that changed and as far as their shadows reach.

A frame draws the tile id the animation manager picks for each tile (`animationManager.ts`): each frame of an animated tile, and the lightning bolt an unpowered zone blinks to, is drawn from its own entry. Traffic is drawn as cars, so a traffic tile, light or heavy, and each frame of one, is drawn from the entry of the plain road tile of its shape (`trafficTiles.ts`), every layer of it: its shadow comes from the anchor's own value, and a traffic value's is the plain road's. The map, the monster TV and the preview alike look up a tile's art in one place, `buildMapFrame` in `mapFrame.ts`. A shadow is drawn from the anchor's own tile id, so it doesn't blink. The bolt's entry has objects as well as ground, the whole tile, opaque, which no shadow darkens: the bolt replaces the centre tile of a zone or a service building, whose own shadow lies dense under the roof the bolt replaces.

The monster TV draws its view in the same passes, but for the overlay's tint, the world grass included. The splash screen's preview draws the whole map in the first three, with no overlay and no sprites, each tile's own id unanimated, and the shadows of none but the tiles on the map.

## The manifest

`images/render/manifest.json`:

```json
{
  "version": 1,
  "atlases": {
    "ground-0": "ground-0.png",
    "shadow-0": "shadow-0.png",
    "objects-0": "objects-0.png"
  },
  "tiles": {
    "244": {
      "ground": {"atlas": "ground-0", "x": 0, "y": 0, "width": 64, "height": 64},
      "objects": {"atlas": "objects-0", "x": 0, "y": 0, "width": 64, "height": 64}
    },
    "249": {
      "ground": {"atlas": "ground-0", "x": 64, "y": 0, "width": 64, "height": 64},
      "objects": {"atlas": "objects-0", "x": 64, "y": 0, "width": 64, "height": 64},
      "shadow": {"atlas": "shadow-0", "x": 0, "y": 0, "width": 384, "height": 320,
                 "reach": {"left": 2, "top": 1, "right": 3, "bottom": 3}}
    }
  },
  "sprites": {
    "5": {
      "1": {"atlas": "objects-0", "x": 0, "y": 512, "width": 192, "height": 192}
    }
  },
  "cars": {
    "red": {
      "north": {"atlas": "objects-0", "x": 192, "y": 512, "width": 64, "height": 64}
    }
  }
}
```

- `version` is 1.
- `atlases` names each atlas image, by a path relative to the manifest. A name may not start `fallback:`: the client keeps those names for its own atlases, the 16 px sheets (`fallback:tiles`, `fallback:sprites`) and the white pixel the overlay's tints are drawn from (`fallback:white`).
- `tiles` maps a tile id, from 0 to 1023 (`tileValues.ts`), to its layers:
  - `ground`, required: everything that lies on the ground, drawn into the tile over the world grass. It is opaque but
    where it lets the grass through: a single tile the paint build's join gives the bare land's painting (`art/README.md`)
    is transparent wherever it does, tile 0, bare land, all over, so bare land and the land of every tile joined to it
    are one grass.
  - `grass`, optional, only where the ground lets the world grass through: `all`, where it is transparent all over, so
    the tile draws the grass alone and never samples its ground, or `part`, where it draws its ground over the grass.
    A tile without it draws its ground alone and never samples the grass, so no tile pays for a layer it doesn't show.
  - `objects`, optional: everything standing, over transparency, drawn into the tile over the shadows. A tile the game draws in place of another asset's tile has the whole tile here, opaque, so no shadow darkens it.
  - `shadow`, optional, and only on an asset's anchor: black whose alpha is the shadow's darkness, drawn over the anchor and `reach` whole tiles past it on each side.
- `sprites` maps a sprite type, from 1 to 7, and a frame, from 1 to that type's last, to its rectangle, drawn into the sprite's square. The types are, in order: train (5 frames, 32 px square), helicopter (8, 32 px), airplane (11, 48 px), ship (8, 48 px), monster (16, 48 px), tornado (3, 48 px) and explosion (6, 48 px), the square's side measured at 16 px a tile (`SPRITE_SHEET` in `renderManifest.ts`). No simulation sprite is a train: the client draws each car of a train from the train's first frame running north or south and its second running east or west, into the car's square, a tile a side, centred on the right-hand track of the rail tile's double track, `TRACK_OFFSET` right of the railway's middle, where the rail art lays it (`TRACK` in `art/blender/tilesets.py`; `trainCar` of `RenderArt` in `renderManifest.ts`).
- `cars` maps a car's colour, one of the client's (`CAR_COLOURS` in `cars.ts`: red, blue, yellow, white, green and orange), and a way it faces, `north`, `east`, `south` or `west`, to its rectangle, drawn into the car's square, a tile a side, centred on its place in its lane, the car and its shadow standing in the middle. A car the manifest leaves out is drawn as a rectangle in its colour's flat colour, long the way it faces, the size of the painted car (`CAR_LENGTH` and `CAR_BREADTH` in `mapFrame.ts`).

- `grass`, required: the world grass, below.

A rectangle is `atlas`, `x`, `y`, `width` and `height`, whole pixels of its atlas, at least 1 wide and high. It is scaled to fill where it is drawn, so an atlas may be rendered at any pixels a tile; the art is rendered at 64 px a tile (`TILE_PX` in `art/blender/tileart.py`), the closest zoom. A key the format doesn't name, a missing `ground` or `grass`, a rectangle naming an atlas the manifest doesn't declare or running past its image, or a number out of its range fails the page's start with a message naming where.

### Cutting an asset into tiles

A zone renders as one image per layer (`art/README.md`). An atlas build must cut its ground and objects into one tile-sized rectangle per tile id, so a zone that loses an edge tile to fire or the bulldozer still draws right. Its shadow stays whole, on the anchor's entry only: the zone's centre, the tile `ZONEBIT` marks, one tile in from the zone's top-left corner whatever its size, or the tile itself for a one-tile asset. A zone that has lost its centre is no longer a zone, and its shadow goes with it.

The shadow's `reach` counts from the anchor. For a zone `tiles` wide with its anchor at column `ax` and row `ay` from its top-left, and the `shadow_margin` its `layers.json` records:

- `left` = `ax` + `shadow_margin.left`
- `top` = `ay` + `shadow_margin.top`
- `right` = `tiles` − 1 − `ax` + `shadow_margin.right`
- `bottom` = `tiles` − 1 − `ay` + `shadow_margin.bottom`

The shadow image is then `left` + 1 + `right` tiles wide and `top` + 1 + `bottom` tiles high, which is `shadow.png`'s size.

### The world grass

Bare land is one grass laid over the whole map by position, with no grid and no repeat: two sets of corner tiles,
lush and straw, mixed by a soft mask that leaves straw on about 70% of the land, then tinted. `art/tools/grass.py`
builds the sets and `src/grass.ts` computes the rest in the client, with the same arithmetic.

```json
"grass": {
  "colours": 3,
  "corners": {"seed": 27153},
  "mask": {"octaves": [{"cell": 9.0, "seed": 8193, "weight": 0.75, "turn": [0.819648, 0.572867]}],
           "gradients": [[1.0, 0.0], [0.92388, 0.382683]],
           "centre": -0.095, "width": 0.42},
  "tint": {"octaves": [{"cell": 7.0, "seed": 4097, "weight": 0.65}],
           "brightness": 0.16, "warmth": 0.35, "warm": [1.1, 1.03, 0.8]},
  "texelsPerTile": 8,
  "sets": {
    "lush": {"mean": [92.0, 112.0, 29.0], "tiles": [{"atlas": "grass-0", "x": 4, "y": 4, "width": 64, "height": 64}]},
    "straw": {"mean": [103.0, 116.0, 39.0], "tiles": [{"atlas": "grass-0", "x": 76, "y": 4, "width": 64, "height": 64}]}
  }
}
```

- **The tile a map tile draws.** Each corner of the map's tile lattice, (x, y) for x from 0 to the map's width and y
  likewise, takes a colour from 0 to `colours` − 1: `latticeHash(x, y, corners.seed) % colours`. Here
  `latticeHash(x, y, seed)` is `lowbias32(x ^ lowbias32(y ^ seed))`, on whole numbers taken modulo 2³², and lowbias32
  is Chris Wellons' hash. The map tile at (x, y), y down, draws tile number nw + ne·c + sw·c² + se·c³, where c is
  `colours` and nw, ne, sw and se are its corners' colours. Each set has `colours`⁴ tiles, in that order, all in one
  atlas and all squares of one size. A tile's edge depends on that edge's two corners alone, so tiles always meet, and the corners' colours come
  from a hash, so nothing repeats on a period.
- **The share of straw.** At a map position (x, y) in tiles, the share is gradient noise summed over `mask.octaves`
  by weight. For each octave:
  1. The lattice is turned by `turn`, a cosine and a sine, and spaced `cell` tiles apart.
  2. Each lattice point's gradient is `gradients[latticeHash(point, seed) & 15]`.
  3. The noise fades from point to point by the quintic t³(t(6t − 15) + 10).

  The sum n becomes the share by smootherstep of clamp((n − `centre`) / `width` + 0.5, 0, 1).
- **The tint.** At a position, the tint is value noise summed over `tint.octaves` by weight. Each lattice point's
  value is its hash / (2³² − 1), blended between points by smoothstep. With the tint n, from 0 to 1, the grass is:
  1. brightened by 1 + `brightness`·(n − 0.5);
  2. then moved toward itself times `warm` by `warmth`·clamp(2(n − 0.45), 0, 1).
- **The field.** The client bakes the share and the tint once, as bytes rounded half up. There are `texelsPerTile`
  texels a tile over the map, each the value at its texel's centre, and the renderer samples them linearly. Only map
  positions go in, never a city's seed, so every city's grass lies the same. `conformance/grass.json` holds the
  client's hash, tiles and noise to the art build's, the baked field included.
- **The pass.** Each ground quad carries the map position of its tile and the rectangle of its tile in each set. Where
  the tile's ground lets the grass through, the shader:
  1. samples each set at one mip level for the frame, where a texel of the grass's tiles is a device pixel at its zoom,
     or the first where they are drawn larger;
  2. blends the two sets' texels by the share, variance-preserving, so the change between them keeps its contrast: the
     mix of the sets' `mean`s, plus each texel's difference from its set's mean weighted by its share, over
     √((1 − s)² + s²);
  3. tints the result;
  4. draws the ground over it by its alpha.

  The grass is a function of map position alone, so a map drawn again in part draws it as the map drawn whole.

### Atlases

- PNG, with straight (not premultiplied) alpha. The client premultiplies on upload.
- The world grass's tiles have an atlas of their own, which the ground pass samples beside the tile's ground atlas.
- At most 4096 pixels a side. WebGL2 guarantees only 2048, but practically every device draws 4096; an atlas past the browser's own limit fails the page's start as a broken manifest does, naming it.
- Rendered atlases are mipmapped and filtered trilinearly, so the art scales smoothly down to 16 px a tile. A rectangle's neighbours bleed into it at the smaller mip levels unless each rectangle starts on a multiple of 4 pixels and is surrounded by a gutter of its own edge pixels repeated 4 pixels outward, which at 64 px a tile covers the two mip levels down to 16 px. The client samples no level past those two, so the art drawn smaller still, such as on a page zoomed out, is minified from the second rather than bled into. The 16 px sheets are drawn with nearest-neighbour filtering, so they stay crisp at every zoom, except on the splash screen's preview: at its 3 CSS pixels a tile, it filters them as it filters the rendered art.

## The fallback

A tile id with no entry draws its 16 px tile from `images/tiles.png` as ground, with no shadow and no objects, and a sprite frame with no entry draws from `images/sprites.png`, a 48 px cell per frame, a row per type. `fallbackManifest()` generates these entries from the sheets' layout, and `test/renderManifest.ts` checks they cover every tile id and every frame of every sprite type in the sheet's layout, `SPRITE_SHEET`, which `test/vocabulary.ts` holds to the frames the rules give each type of theirs (`conformance/ruleConstants.json`), every type but the train. The station tiles, 1020 with its track east and west and 1021 north and south, which the original never had, have a plain 16 px tile on the sheet the atlas build starts from (`art/sheets/tiles-original.png`): a single track with a platform along each side, drawn by hand, which the atlas build replaces with the painted double-track station. The atlas build draws the sheet's cell of
each tile it has art for over a square of the world grass at the grass's mean colour over the map, so bare land's cell,
and the minimap, which colours each tile by its cell's average, follow the grass.
