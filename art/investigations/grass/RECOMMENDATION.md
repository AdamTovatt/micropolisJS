# Seamless grass: recommendation

## The technique

One world grass, drawn by map position under every tile, showing through wherever a tile's ground is grass. It is
approach A with Adam's three layers as the grass. B (colour matching) and C (edge blending) are dropped: neither
removes the seam by construction. D (painting inside a border of land) isn't needed once a zone's grass is masked:
the zone's own painted grass is never drawn.

1. **Corner Wang tiles, two sets.** Straw (from `land/c4-paint.png`) and lush (`wang/lawn-e.png`, in the empty
   residential zone's style). Each set has 3 corner colours, so 81 tiles of 64 px. A tile is the variance-preserving
   blend of its four corners' patches and its own centre patch. Only an edge's two corners reach that edge, so
   edges meet exactly, whatever tiles are side by side. A tile's corner colours come from an integer hash
   (lowbias32) of the lattice points, so nothing repeats on a period.
   - Two colours (16 tiles) showed a grid of corner clumps (`shots/wang-e-k2-vs-k3.png`).
   - Straw keeps its strokes: each patch is levelled in mean and tilt only, and turned only 180°.
   - One profile correction shared by every tile removes an edge dip of about 8 levels.
2. **Region mask and tint.**
   - The mask is gradient noise: quintic fade, two octaves, each turned off the map's axes, with a smootherstep
     handover over a wide band. Straw covers about 70% of the land.
   - Lush is moved halfway to straw's colour.
   - The two sets are blended so the contrast holds through the change between them.
   - A value-noise tint over several tiles varies brightness and warmth.
3. **Details.** At most one per tile, always inside that tile.
   - Its kind is weighted by region, its size is jittered, and its density is clustered by noise into drifts.
   - They still look stamped. Repaint the sheet in straw's brushwork before shipping.

Shots: `shots/mix7-*`, which have all three layers (open 16 px, close 64 px, field, and whole map with its mask).

## In the client

**Ground pass.** The ground pass stays one draw with no blending. Each ground quad gains per-tile attributes,
computed on the CPU in `buildMapFrame` with the same integer hash (`Math.imul`):
- the rectangle of its Wang tile in each set;
- its detail's rectangle, place, turn and scale.

The fragment shader then:
1. samples both Wang tiles;
2. mixes them by the mask;
3. lays the detail over them;
4. tints the result;
5. draws the tile's own ground over that, using the ground's alpha.

That is 4 to 5 texture samples a ground pixel, against 1 now.

**Mask and tint texture.** Bake the mask and the tint once, in TypeScript, into a small two-channel texture of
about 8 texels a tile (960 × 800), sampled linearly. Noise is then never computed per pixel on the GPU, and every
GPU draws the same thing.

**Partial redraw.** Unchanged. The grass is a pure function of map position, and nothing reaches past its tile.

**Other views.**
- The monster TV and the splash preview draw through the same renderer, so they get the grass for free.
- The minimap and the 16 px sheets need tile 0's cell to be a representative grass colour.
- `dirtbg.png` should be built from a wrapped field of the grass.

## In the art pipeline and `docs/render-assets.md`

**Ground alpha.**
- A ground rectangle's alpha changes meaning: 0 is where the world grass shows. The ground atlas becomes RGBA, at
  the same pixel size.
- Every asset's grass mask comes from a mask render in Blender: the grass materials tagged, written as
  `ground-grass.png` by the same holdout trick as the letter masks. It is exact, so it can leave out the stadium
  pitch and designed gardens.
- `paint.py`'s `is_grass` on the render works today with no render at all, but it would sweep the pitch into the
  grass.

**Manifest.**
- A `grass` section: each set's tile rectangles, its colour count, and the hash and noise constants.
- A `details` section: each detail's rectangle and kind.
- The drawing order's step 1 becomes "the world grass, then each tile's ground over it".

**Art tools.**
- `wang.py` and `details.py` in `art/tools`. Each set builds in about 10 s, and the atlas build stays about 30 s.
- The source paintings are committed under `art/painted/raw/grass/`.
- A test that rebuilds the sets and details exactly.
- Conformance vectors for the hash and noise (as `random.json` does), so the Python previews and the client agree.

**Land joins.** The join's land donor stops mattering for grass. Verges and shores show the world grass through
their masks.

## Costs

- **Atlas:** 2 × 81 tiles at 72 px with gutters, about 0.84 Mpx, roughly 5% of one 4096² page. Details are about
  0.04 Mpx.
- **Image model:** 13 charged calls in this investigation (plus 1 refusal, which was free). For production:
  - 1–2 calls to paint the grass sources again larger, for more patch variety;
  - 1–3 calls for a details sheet in straw's brushwork;
  - no zone repaints for the grass. Adam's planned zone repaints no longer need to match any grass, since theirs is
    masked out.
- **Blender:** a ground-only mask pass at 16 samples for every asset with ground: about 50 zones and the single-tile
  sets. My estimate, not measured, is 20–40 minutes four at a time. The beauty renders don't change.
- **Renderer:**
  - the ground shader;
  - the quad attributes in `mapFrame.ts`;
  - the baked mask and tint texture;
  - tests of the hash under Node.

  A few days at agent speed, plus the art build changes and tests.

## Risks and open choices

- **Software WebGL:** the ground pass goes from 1 to about 5 texture samples a pixel. This needs a run of
  `npm run benchmark:render`.
- **Zones:** each zone's grass must be masked, or zones keep their own lawns and their seams. If the zone repaint
  happens first, the mask render should go with it.
- **Woods:** its floor shows the world grass between trees, and the gaps between woods tiles now read as a grid
  (`shots/mix7-close2-64px.png`). This is woods art, not grass.
- **Details:** they look stamped until repainted. One per tile and inside the tile keeps the shader simple, but
  rules out details that cross tile edges.
- **Patch size:** lush patches are about 4–8 tiles across. Raising `MIX_CELL` from 9 to 14 doubles that.
- **Tile counts:** 3 corner colours (81 tiles) rather than the ~16 asked for. With two colours the grid showed.
