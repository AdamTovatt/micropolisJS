# Textures

Source textures for rendering tile art in Blender. A render maps them onto its surfaces; the game never loads them directly.

## What a texture must be

- **Seamless.** It tiles in both directions without a visible edge. Check by laying out a 2×2 grid of copies.
- **Seen flat-on.** Straight down for ground and roofs, straight on for walls. No perspective.
- **Unlit.** No baked shadows, highlights or directional light: the render supplies the lighting.
- **Whole repeats.** 1024 px or larger, square unless a pattern needs otherwise, and holding a whole number of its repeating units (windows, storeys, slabs) in each direction. A generated image that holds a part-unit is cropped to whole units.
- **Distributable under the game's licence.** Builds served to players ship with their source under GPLv3 (`LICENSE`), so a texture is added only if its generator's or author's terms allow that.

## Files

Each entry gives the real-world size the image depicts, so a scene scales it consistently, and the prompt it was generated from.

### `roof-membrane.png`

A weathered flat roof: dark grey bitumen membrane laid in strips with seams, patches, scattered gravel and fixings. About 5 m across.

> Seamless tileable texture of a weathered flat commercial roof, dark grey bitumen membrane with faint seams, water stains, small gravel patches and scattered debris, viewed straight down, flat even lighting, no shadows.

### `paving-slabs.png`

Beige concrete paving: a 4×4 grid of square slabs with moss in the joints and light staining. About 2 m across (slabs of roughly 50 cm).

> Seamless tileable texture of a beige concrete paving slab plaza, square slabs about 50 cm across with thin dark joints, slight colour variation between slabs, light dirt and stains, viewed straight down, flat even lighting.

### `asphalt.png`

Worn dark asphalt with fine aggregate, hairline cracks and oil stains, without road markings. About 3 m across.

> Seamless tileable texture of worn dark asphalt with fine grain, small cracks and oil stains, viewed straight down, flat even lighting, no markings.

### `glass-curtain-wall.png`

A blue glass office facade: tall rectangular panes in thin dark frames, reflecting sky and clouds, a few with blinds behind. About 9½ panes across and 6 storeys high. The column at the horizontal wrap is narrower than the rest, which shows only up close.

> Seamless tileable texture of a blue glass office curtain wall, viewed straight on, a regular grid of rectangular panes with thin dark aluminium frames, panes varying slightly in tint and reflecting soft sky and clouds, no perspective.

### `lawn-grass.png`

Short lawn grass with clover, slight variation in tone and a few dry patches. About 2 m across.

> Seamless tileable texture of short green lawn grass with slight variation and a few dry patches, viewed straight down, flat even lighting.

### `foliage-leaves.png`

Dense foliage seen from above: small lobed leaves in mixed greens, with dark gaps between the clumps. For tree crowns and hedges. About 1.5 m across.

### `concrete-facade.png`

A light grey precast concrete office facade: a grid of deep-set dark windows with blinds, 9 windows across and 6 storeys high, with faint rain streaks. About 30 m across. Cropped from the generated 1254 × 1254 image to its middle 1254 × 1155, so that it holds exactly 6 storeys and wraps vertically.

> Seamless tileable texture of a light grey concrete building facade with a regular grid of small dark rectangular windows, viewed straight on, no perspective, flat even lighting.
