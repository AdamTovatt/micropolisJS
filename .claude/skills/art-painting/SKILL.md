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

1. **Lay out the canvas** (`paint.py prep <job>`). A job is one asset, such as a zone, or several laid out in a grid on one canvas, such as the single-tile houses, four to a canvas: one painting for a set keeps its members alike, and four houses paint at about a zone's scale. Each asset gets a square cell: its side is the larger of `tiles + left + right` and `tiles + top + bottom` from `shadow_margin`, plus half a tile of border all round, the footprint at the border plus (`left`, `top`). The model paints only squares, gets a shadow right only when it can see where the shadow falls, and paints frames and vignettes along a canvas's edge, which the border keeps off the footprint.
2. **Write three model inputs**, each the canvas scaled up to 1024 × 1024:
   - *full*: the asset as the game draws it, ground, then shadow, then objects, on plain grass outside the footprint.
   - *ground*: the ground alone, mirrored outward to fill its cell. Against plain grass the model paints a kerb along the footprint's edge; mirrored, the ground runs on past the edge with nothing there to outline.
   - *shadow*: the shadow's alpha as grey on white (`255 − alpha`).
3. **Paint each input once** (`paint.py paint <job>`), through `art/tools/generate.py --reference <input>`, with the prompts below. *full* gives the objects, *ground* the ground and *shadow* the shadow's brushwork.
4. **Look at each painting beside its input**, and paint again the one that fails (`paint.py paint <job> --only ground`):
   - The paving and grass end where they ended in the input.
   - Nothing is added: no trees, sky, crates or roads.
   - In the full painting the objects keep their shapes.

   A plain yard is the hardest ground: with nothing in the input to hold on to, the model invents lawns, roads and ponds, or hands the input back barely painted. Retry it with `--paving` naming its surfaces, and with `--style-from-full`, which gives the ground the job's full painting as a second reference so it copies the brushwork of the ground there.
5. **Build the layers** (`paint.py build <job>`), each painting scaled down to the canvas at `tile_px`:
   - *objects*: the full painting cropped to the footprint, with Blender's objects alpha. Blender's outline is the stencil, so the objects line up with their shadows, and whatever the model added outside it is cut away. Thin parts, narrower than `2 × THIN` pixels, keep the render's pixels (below).
   - *ground*: the painted ground cropped to the footprint, then held to Blender's own grass and paving (below).
   - *shadow*: the painting's darkness (`255 − luminance`), histogram-matched to Blender's shadow alpha over the canvas's visible ground, written as black with that alpha at the size and offset of Blender's `shadow.png`. The brushwork stays and the strength is Blender's: left alone, the model paints a tower's faint long shadow nearly black. Under the buildings, where the objects hide it, the shadow is Blender's own: the model paints a cast shadow as dark as the full shadow there, and matched together, a soft shadow beside a building comes out black. Only Blender's thick shadow, at least `SHADOW_FLOOR` and not thin, is painted; the rest, a faint edge or a wire's shadow, is Blender's.
   - *letters*: the render's own pixels wherever its letter mask shows a zone letter (below), the roof letters into the objects and the empty zones' ground letters into the ground.
6. **Preview it among neighbours**: `art/tools/preview.py --root art/painted/out` composites as the game does. Look at the joins between assets and at shadows crossing into the next tile.

## The ground seam

Where one asset's ground meets its neighbour's, any difference is a line across the map. Three things make one: the painted ground drifts by a few pixels, such as a sliver of grass along the edge of a concrete yard that should run to the edge; the model outlines the footprint with a kerb; and each painting takes its own colours, such as concrete drifting toward sand. The mirrored ground input stops the kerb. `build` holds the painted ground to Blender's for the rest:

- It sorts every pixel of both grounds into grass and not grass, and where the painting disagrees with the render it takes the colour of the nearest painted pixel that agrees. The boundary between grass and paving is Blender's to the pixel.
- It moves the painted grass to the render's average grass colour, and the rest to the render's average colour of the rest, keeping the brushwork round each. Every lawn then meets its neighbour's in one green.

`build` prints the share of pixels whose kind it replaced. A large share means the painting moved or invented ground, such as a road across a plain yard: paint it again rather than keep the patched one.

## Zone letters come from the render

A zone's letter (R, C, I, and the stations' FD and PD) is how a player tells the zones apart, and the model does not keep it, whatever the prompt says: it turned an I into an H painted as a helipad, another into an R, and bent a third out of shape through three retries. So the letters are never painted. `render()` in `tileart.py` writes, after the three layers, `<layer>-letters.png` for each layer that holds a letter, whose alpha is where the camera sees the letters, and `build` puts the render's pixels back there. A letter the model mangled into a bigger shape can leave paint round the pasted letter; retry that full painting. Retrying for the letter itself is wasted.

A re-render never reproduces a render's file bytes, because Blender stamps the date and the render time into each PNG: compare renders by their decoded pixels.

## Thin parts come from the render

The model cannot keep a stroke a pixel or two wide. It paints a power line's wire, a pole, a crossing's gate or a water tower's lattice as a dark smear, or as whatever lies behind it, and their thin shadows as smudges where nothing casts one. So `build` paints only the parts of the objects and of the shadow that survive an opening of `THIN` pixels (`thick()`), grown by a pixel to take in their rims, and takes everything thinner from the render. On a zone this keeps fences, legs and pipes crisp; on a power line it keeps the line.

## Prompts

The style sentence, shared by all three:

> as a cosy oil painting of a lovely summer day: visible brushstrokes and soft impasto texture, painterly but clear, warm soft daylight, rich but natural colours, lush summer greens.

The keep sentence, after the style in the *full* and *ground* prompts:

> Keep the exact composition: every shape, every tree and every boundary between paving and grass in the same position, size and outline, the same straight-down camera angle. Keep every big letter on a roof or on the ground, such as a green R, C or I, exactly as it is: the same letter, shape, size and colour, crisp and flat, never turned into a sign, a helipad or another letter. Do not add trees, bushes, sky or anything else. No other text, no borders.

The letters come from the render whatever the painting does; the letter sentence keeps the painting from leaving a bigger shape round them.

- *full*: "Repaint this top-down render of {what it is} {style} {paving} {keep}"
- *ground*: "This is the bare ground of {what it is} seen from directly above: {what is on it}, with no buildings and no shadows. Repaint it {style} {paving} Paint only the ground: no buildings, objects or shadows. {keep}"
- *shadow*: "This shows only the shadows cast on the ground by buildings, as dark grey shapes on a pure white background. Repaint the shadows as soft, dark, painterly oil-paint brushstrokes in neutral grey, matching a cosy oil painting of a summer day. Keep the background pure flat white and keep every shadow shape in the same place and outline, with no buildings, objects, colour or ground. No text, no borders."

`{paving}` says what the ground is made of, and that it stays that: without it, the summer wording turns concrete into lawn, and a plain yard gets roads and lawns it never had. `paint.py` writes a general one; `--paving` names the asset's own surfaces when a painting changes one anyway, such as "The whole square is one plain grey concrete yard from edge to edge, and stays grey concrete paving: no roads, kerbs, grass or markings."

## Traps

- **Paint objects in their setting, never on black.** Objects painted on black come out with a dark fringe and a different tint.
- **The model invents small extras**, such as a pair of pallets. The stencil cuts them from the objects, but not from the ground: look for them in the ground painting.
- **Spend only what a pass needs.** Retry the painting that fails its check, with a prompt that names what went wrong; don't sweep prompts across a whole set.

## Edge tile sets

The shores, woods, roads, rails and power lines must join their neighbours exactly, and a tile painted on its own seams. Blender's tiles join because every surface they share is one texture laid the same way on every tile: bare land on a power line's tile, the water at a shore and the road under each traffic frame are pixel for pixel the render of bare land, open water and the road piece. `paint.py` paints the sets like any other job, four tiles to a canvas (`SETS`), then `paint.py join` gives every tile the painting of a donor tile (`DONORS`) wherever its render matches the donor's to within 3 levels: land, open water and the woods' floor everywhere, the straight roads, rails, wires and bridges along their length, and each road piece to its traffic frames. Each donor is first faded into its half-shifted copy over `WRAP_BAND` pixels at its edges, so it runs on into itself. Painted tiles then join wherever their renders do. Join works from the copies `build` keeps in `raw/built/`, so it runs again after any rebuild, and has to.

A tile id is the same image wherever it lies, so bare land and open water repeat on every tile across the map, and any mark in their painting, such as a dark tuft, stands in a grid. Their donors must be even: paint them with `--paving` asking for fine, even brushwork with no mark that stands out, because the square repeats across a map, and `join` also takes out their broad patches (`flattened()`). The model refuses plain grass most often (see the `zone-art` skill's trap on refused prompts); a refused painting leaves the job as it was, so rephrase and paint again.

Traffic frames and an open drawbridge's water paint no ground, since a donor gives them all of it, and a job paints no objects where nothing stands and no shadow where nothing casts one (`canvas.json`'s `paint`).

Preview a set among its neighbours on a small map that holds every kind of join, such as a river crossed by a road and a rail bridge, with a crossing, woods, parks and power lines over land and water, beside the same map from the renders.

## Animated tiles and vehicles

These need more than one painting per asset to agree, and each approach here is to be tried on one asset, beside its render, before a whole set:

- **Animated tiles** painted frame by frame flicker. Paint frame 0 from its render, then each other frame from its own render with the painted frame 0 as a second reference: a painting repainted from itself stays almost identical.
- **Vehicles**: every rotation must look like the same vehicle, so all of a vehicle's frames are one job on one canvas, on the plain grass or water it travels over. A vehicle stands in the middle of its three-tile frame, and at the frame's size the model paints a railcar with strokes as wide as the car: `prep` cuts every frame down to the box that holds what is painted in any of them before scaling to the model's size (`pack` in `canvas.json`), and `build` lays the painting back. Only the vehicle is painted: its shadow is Blender's, a small silhouette that painting only roughens, and the model paints a helicopter's faint rotor disc as dark as its body. Name the vehicle's colours in its subject; the model drifts grey and white toward cream.
