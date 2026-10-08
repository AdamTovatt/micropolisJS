# Grass seam investigation

The source paintings, tools and recommendation from investigating why the painted zones' grass seams against bare
land and each other, and a seamless grass to replace it: corner Wang tiles of two grasses blended by a world-space
noise mask, with a tint and scattered details. `RECOMMENDATION.md` is the outcome. Nothing here is part of the game
or its art build.

## Paintings

All are `gemini-3-pro-image` through `art/tools/generate.py`, kept because they cost money to make again. A path
the recommendation names as `land/cN-paint.png`, `wang/lawn-e.png` or `details/sheet-b.png` is `paintings/` here.

- `c1-paint.png`, `c3-paint.png`, `c4-paint.png`: bare-land candidates, each from a reference of
  `art/textures/land-grass.png` tiled 6 × 6 and moved to its target colour (`tools/landcand.py ref`), with the prompt
  "This is a top-down view of open grassy land seen from directly above, a square about six of a strategy game's map
  tiles across. Repaint it as a cosy oil painting of a lovely summer day: visible brushstrokes and soft impasto
  texture, painterly but clear, warm soft daylight, rich but natural colours, lush summer greens. {kind} Even all
  over, so the square can repeat across a whole map: no patches, paths, flowers, trees, water or objects, no lighter
  or darker areas, no vignette. Keep the same straight-down view and the same overall colour as the image. No text,
  no borders.", where {kind} is:
  - c1 olive (85,98,32): "Short mown lawn in a soft olive green, with fine even brushwork."
  - c3 midpoint (95,112,35): "Short summer meadow grass, mid green with a little warm yellow, in fine even strokes."
  - c4 straw (103,116,39): "Rough uncut meadow: green grass mixed evenly with dry straw-coloured blades." The straw
    set of the recommendation is cut from this one.
- `c2-paint.png`, lush (80,107,18), whose first prompt in the form above was refused: "Seen straight down from a
  hot-air balloon: a broad square of lawn in a village park, about six game map tiles across, repainted as a cosy oil
  painting of a lovely summer day: visible brushstrokes and soft impasto texture, painterly but clear, warm soft
  daylight, rich but natural colours. The turf is lush and well watered, a deep fresh saturated green, cut short,
  with small dabs of lighter and darker green spread evenly. Uniform everywhere so it can repeat across a whole map:
  no patches, paths, flowers, trees, objects or vignette. Keep the overall colour of the image. No text, no borders."
- `lawn-a.png`: a lawn in the style of the empty residential zone's, from its painted ground scaled to 1024 as the
  reference: "Paint a new image: a square of lush, well-watered lawn seen from directly above, about eight map tiles
  of a strategy game across. Paint it in exactly the oil-paint style of the green grass in the first image, the grass
  around the bare earth: the same leafy clumps and dabs of mixed greens, the same size of brushstrokes relative to
  that zone, which is three map tiles across. The colour is a deep, fresh, saturated summer green, with lighter
  yellow-green and darker green dabs spread evenly all over. Even everywhere, so pieces of it can be laid side by side
  across a map: no bare earth, no pale or dry patches, no paths, flowers, letters, trees, objects or vignette, no
  lighting gradient. Straight-down view, flat soft light. No text, no borders." It copied the zone's pale patches.
- `lawn-e.png`: `lawn-a.png` edited, with it as the reference: "Edit this oil painting of a lawn seen from above:
  paint over every pale, dry, whitish patch with the same lush green grass as around it, in the same brushwork, so
  the whole square is one even lawn with no patches. Shift the whole lawn to a deeper, fresher, more saturated summer
  green. Keep everything else: the same brushstrokes, clumps and scale. No text, no borders." The lush set of the
  recommendation is cut from this one, read as four map tiles across.
- `sheet-b.png`: the details: "A sprite sheet for a top-down strategy game whose camera looks straight down at the
  ground, like a satellite photo, painted as a cosy oil painting of a lovely summer day: visible brushstrokes and
  soft impasto texture, painterly but clear, warm soft daylight. Twelve small ground details, every one seen from
  directly overhead, never from the side: in a grid of four columns and three rows, each well apart from the others
  and from the border, on a perfectly flat, plain, even background of solid olive green (#6B7424) with no texture at
  all. Row one: three tufts of taller dark lush grass, each a round starburst of blades radiating out from its centre
  as seen from above, and one round patch of clover leaves. Row two: four small patches of bare brown earth, each a
  different irregular shape, with a few blades of grass at their edges. Row three: a loose round scatter of small
  white daisy flower heads among grass, a loose round scatter of small yellow buttercup heads among grass, a few
  small flat grey stones half sunk in grass, and a round starburst tuft of dry straw-coloured grass seen from above.
  No shadows on the background, no text, no borders, no labels." The model painted four rows, sixteen details.

## Tools

Run from the repository root with the art tools' virtual environment (`art/README.md`).

- `wang.py build <paintings> <tiles> <r,g,b> <out> [colours] [band] [directional] [flatten] [sharpen]`: a corner
  Wang set. The recommendation's: `wang.py build paintings/lawn-e.png 4 92,112,29 <lush> 3 14 0 1 1` and
  `wang.py build paintings/c4-paint.png 6 103,116,39 <straw> 3 14 1 0 1`. It also holds the hash, the region mask and
  the tint.
- `details.py cut paintings/sheet-b.png <out>`: the details, and the scatter that places them.
- `variants.py`, `landcand.py`, `atlas_rgba.py`: prototype layers and atlases: the bare-land candidates, B's colour
  match, and grounds whose alpha is 1 − grass, built by `atlas_rgba.py`, which is `art/tools/atlas.py` with an RGBA
  ground. `landcand.py mask-joined` masks the joined single tiles' grass, which the shots draw the world grass
  through.
- `mapcomp.py`: composites a save's map from a manifest and atlases in the renderer's passes, with an optional grass
  layer under the ground; `shootmix.py` shoots `conformance/saves/hospitalTown.run.json` with the mixed grass.
  `shootzones.py` shoots it with the zones' own lawns masked too (an atlas from `variants.py mask` and
  `atlas_rgba.py`), details on bare land only, and optionally a lawn set for the zone tiles.
- `styleref.py`, `grassstats.py`: the cleaned style reference tried and dropped, and each asset's mean grass.

## Shots

`shots/` holds the final mix with all three layers at the opening zoom (`mix7-open-16px.png`, the town;
`mix7-field-16px.png`, open land) and the whole map at 4 px a tile beside its region mask (`mix7-map-4px.png`). `compare-open-16px.png` and
`compare-close-64px.png` stack the town with zones unmasked, masked to the mix and masked to a lawn set.
