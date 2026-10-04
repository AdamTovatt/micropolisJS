---
name: art-painting
description: Use when turning the Blender renders in art/blender/out into painted layers with an image model — painting a zone, a service building, a tile set or a vehicle, checking a painting, retrying one that failed, or previewing painted assets on a map.
---

# Art painting

A painted asset is a Blender render repainted by an image model as an oil painting, kept in the render's three layers, files and sizes, so the atlas build can take either. The model paints the look; Blender keeps deciding where everything is: outlines, footprints and shadow strength. The pipeline it starts from is in `art/README.md` and the `zone-art` skill: read both first, and set up Blender, the Python tools' virtualenv and the Gemini key as `zone-art` says. `art/tools/paint.py` does every step below but the looking.

## What is settled

These are Adam's decisions. Don't reopen them.

- **The originals stay.** The Blender scenes and their renders are never changed for a painting. Painted layers go beside them, under `art/painted/out/<asset>/`, with the render's file names and sizes and a copy of its `layers.json`.
- **The layers.**
  - Objects are cut from a painting of the whole asset, with Blender's `objects.png` alpha as the stencil.
  - Ground is painted on its own.
  - The shadow is painted, then histogram-matched to Blender's shadow alpha.
  - Each model input is a square canvas with the shadow margin round the asset.
- **The style** is the summer oil painting in the prompts below, with the sentence that keeps paving as paving.
- **The painted layers are committed.** A painting cannot be rebuilt from a script the way a render can. The raw 1024 px paintings and the model inputs are not committed: they live in `art/painted/raw/`, which git ignores. Each asset's prompts and model are recorded beside its layers.

## The steps

1. **Lay out the canvas** (`paint.py prep <job>`). A job is one asset, such as a zone, or several laid out in a grid on one canvas, such as the single-tile houses: one painting for a set keeps its members alike, and costs one painting instead of one each. Each asset gets a square cell: its side is the larger of `tiles + left + right` and `tiles + top + bottom` from `shadow_margin`, the footprint at (`left`, `top`). The model paints only squares, and gets a shadow right only when it can see where the shadow falls.
2. **Write three model inputs**, each the canvas scaled up to 1024 × 1024:
   - *full*: the asset as the game draws it, ground, then shadow, then objects, on plain grass outside the footprint.
   - *ground*: the ground alone, on the same grass.
   - *shadow*: the shadow's alpha as grey on white (`255 − alpha`).
3. **Paint each input once** (`paint.py paint <job>`), through `art/tools/generate.py --reference <input>`, with the prompts below. *full* gives the objects, *ground* the ground and *shadow* the shadow's brushwork.
4. **Look at each painting beside its input**, and paint again the one that fails (`paint.py paint <job> --only ground`):
   - The paving and grass end where they ended in the input.
   - Nothing is added: no trees, sky, crates or roads.
   - In the full painting the objects keep their shapes.
5. **Build the layers** (`paint.py build <job>`), each painting scaled down to the canvas at `tile_px`:
   - *objects*: the full painting cropped to the footprint, with Blender's objects alpha. Blender's outline is the stencil, so the objects line up with their shadows, and whatever the model added outside it is cut away.
   - *ground*: the painted ground cropped to the footprint, then held to Blender's own grass and paving (below).
   - *shadow*: the painting's darkness (`255 − luminance`), histogram-matched over the canvas to Blender's shadow alpha, written as black with that alpha at the size and offset of Blender's `shadow.png`. The brushwork stays and the strength is Blender's: left alone, the model paints a tower's faint long shadow nearly black.
6. **Preview it among neighbours**: `art/tools/preview.py --root art/painted/out` composites as the game does. Look at the joins between assets and at shadows crossing into the next tile.

## The ground seam

The painted ground drifts by a few pixels, and where it meets a neighbour's ground that drift is a line across the map: a sliver of grass along the edge of a concrete yard that should run to the edge. `build` holds the painted ground to Blender's: it sorts every pixel of both grounds into grass and not grass, and where the painting disagrees with the render it takes the colour of the nearest painted pixel that agrees. The brushwork stays, and the boundary between grass and paving is Blender's to the pixel.

## Prompts

The style sentence, shared by all three:

> as a cosy oil painting of a lovely summer day: visible brushstrokes and soft impasto texture, painterly but clear, warm soft daylight, rich but natural colours, lush summer greens.

The keep sentence, after the style in the *full* and *ground* prompts:

> Keep the exact composition: every shape, every tree and every boundary between paving and grass in the same position, size and outline, the same straight-down camera angle. Do not add trees, bushes, sky or anything else. No text, no borders.

- *full*: "Repaint this top-down render of {what it is} {style} {paving} {keep}"
- *ground*: "This is the bare ground of {what it is} seen from directly above: {what is on it}, with no buildings and no shadows. Repaint it {style} {paving} Paint only the ground: no buildings, objects or shadows. {keep}"
- *shadow*: "This shows only the shadows cast on the ground by buildings, as dark grey shapes on a pure white background. Repaint the shadows as soft, dark, painterly oil-paint brushstrokes in neutral grey, matching a cosy oil painting of a summer day. Keep the background pure flat white and keep every shadow shape in the same place and outline, with no buildings, objects, colour or ground. No text, no borders."

`{paving}` says what the ground is made of, and that it stays that: without it, the summer wording turns concrete into lawn. `paint.py` writes a general one; name the asset's own surfaces when a painting greens one anyway, such as "The grey concrete yard stays grey concrete paving; the strip of grass along the right and bottom edges stays green summer grass."

## Traps

- **Paint objects in their setting, never on black.** Objects painted on black come out with a dark fringe and a different tint.
- **The model invents small extras**, such as a pair of pallets. The stencil cuts them from the objects, but not from the ground: look for them in the ground painting.
- **Spend only what a pass needs.** Retry the painting that fails its check, with a prompt that names what went wrong; don't sweep prompts across a whole set.

## Edge sets, animated tiles and vehicles

These need more than one painting per asset to agree, and each approach here is to be tried on one asset, beside its render, before a whole set:

- **Edge tile sets** (shores, woods, roads, rails, power lines) must join their neighbours exactly, so a tile painted on its own will seam. Lay the set out as a strip or small map, paint that, and cut it into tiles.
- **Animated tiles** painted frame by frame flicker. Paint frame 0 from its render, then each other frame from its own render with the painted frame 0 as a second reference: a painting repainted from itself stays almost identical.
- **Vehicles**: every rotation must look like the same vehicle. Paint frame 0, then each other rotation with the painted frame 0 as a second reference.
