# Render assets

The map is drawn with WebGL2 from a manifest and the atlases it names, in `images/render/`. This document specifies the manifest: what an atlas build must write from the zones' rendered layers (`art/README.md`), which `art/tools/atlas.py` does, and what the client (`renderManifest.ts`, `renderAssets.ts`) reads. A tile id or sprite frame the manifest leaves out is drawn from the 16 px sheets, `images/tiles.png` and `images/sprites.png`, so a manifest of no entries draws the game as those sheets always have.

## How the map is drawn

The map is drawn in this order:

1. every tile's ground;
2. every anchor's shadow, from the tiles in view and, around them, as many tiles as the farthest shadow reaches, merged into a shadow buffer by the darkest value at each pixel (`blendEquation(MAX)`), which then darkens what the ground pass drew, once;
3. every tile's objects;
4. the map overlay's tint;
5. the sprites.

The tools' outlines are drawn on a 2D canvas over the map. A shadow therefore falls across any tile's ground, but never on objects, and overlapping shadows never darken twice. Ground and objects fill their tile exactly and never reach past it, so neither pass depends on the order tiles are drawn in, and the game can draw the map again in part, around the tiles that changed and as far as their shadows reach.

A frame draws the tile id the animation manager picks for each tile (`animationManager.ts`): each frame of an animated tile, and the lightning bolt an unpowered zone blinks to, is drawn from its own entry. A shadow is drawn from the anchor's own tile id, so it doesn't blink.

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
  }
}
```

- `version` is 1.
- `atlases` names each atlas image, by a path relative to the manifest. A name may not start `fallback:`: the client keeps those names for its own atlases, the 16 px sheets (`fallback:tiles`, `fallback:sprites`) and the white pixel the overlay's tints are drawn from (`fallback:white`).
- `tiles` maps a tile id, from 0 to 1023 (`tileValues.ts`), to its layers:
  - `ground`, required: everything that lies on the ground, opaque, drawn into the tile.
  - `objects`, optional: everything standing, over transparency, drawn into the tile over the shadows.
  - `shadow`, optional, and only on an asset's anchor: black whose alpha is the shadow's darkness, drawn over the anchor and `reach` whole tiles past it on each side.
- `sprites` maps a sprite type, from 1 to 7, and a frame, from 1 to that type's last, to its rectangle, drawn into the sprite's square. The types are, in order: train (5 frames, 32 px square), helicopter (8, 32 px), airplane (11, 48 px), ship (8, 48 px), monster (16, 48 px), tornado (3, 48 px) and explosion (6, 48 px), the square's side measured at 16 px a tile (`SPRITE_SHEET` in `renderManifest.ts`).

A rectangle is `atlas`, `x`, `y`, `width` and `height`, whole pixels of its atlas, at least 1 wide and high. It is scaled to fill where it is drawn, so an atlas may be rendered at any pixels a tile; the art is rendered at 64 px a tile (`TILE_PX` in `art/blender/tileart.py`), the closest zoom. A key the format doesn't name, a missing `ground`, a rectangle naming an atlas the manifest doesn't declare or running past its image, or a number out of its range fails the page's start with a message naming where.

### Cutting an asset into tiles

A zone renders as one image per layer (`art/README.md`). An atlas build must cut its ground and objects into one tile-sized rectangle per tile id, so a zone that loses an edge tile to fire or the bulldozer still draws right. Its shadow stays whole, on the anchor's entry only: the zone's centre, the tile `ZONEBIT` marks, one tile in from the zone's top-left corner whatever its size, or the tile itself for a one-tile asset. A zone that has lost its centre is no longer a zone, and its shadow goes with it.

The shadow's `reach` counts from the anchor. For a zone `tiles` wide with its anchor at column `ax` and row `ay` from its top-left, and the `shadow_margin` its `layers.json` records:

- `left` = `ax` + `shadow_margin.left`
- `top` = `ay` + `shadow_margin.top`
- `right` = `tiles` − 1 − `ax` + `shadow_margin.right`
- `bottom` = `tiles` − 1 − `ay` + `shadow_margin.bottom`

The shadow image is then `left` + 1 + `right` tiles wide and `top` + 1 + `bottom` tiles high, which is `shadow.png`'s size.

### Atlases

- PNG, with straight (not premultiplied) alpha. The client premultiplies on upload.
- At most 4096 pixels a side. WebGL2 guarantees only 2048, but practically every device draws 4096; an atlas past the browser's own limit fails the page's start as a broken manifest does, naming it.
- Rendered atlases are mipmapped and filtered trilinearly, so the art scales smoothly down to 16 px a tile. A rectangle's neighbours bleed into it at the smaller mip levels unless each rectangle starts on a multiple of 4 pixels and is surrounded by a gutter of its own edge pixels repeated 4 pixels outward, which at 64 px a tile covers the two mip levels down to 16 px. The client samples no level past those two, so the art drawn smaller still, such as on a page zoomed out, is minified from the second rather than bled into. The 16 px sheets are drawn with nearest-neighbour filtering, so they stay crisp at every zoom.

## The fallback

A tile id with no entry draws its 16 px tile from `images/tiles.png` as ground, with no shadow and no objects, and a sprite frame with no entry draws from `images/sprites.png`, a 48 px cell per frame, a row per type. `fallbackManifest()` generates these entries from the sheets' layout, and `test/renderManifest.ts` checks they cover every tile id and every frame of every sprite type the simulation's sprite modules state.
