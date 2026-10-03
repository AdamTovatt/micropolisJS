---
name: zone-art
description: Use when making or changing the game's zone art in art/ — modelling a new zone in Blender from a reference sheet, refining or re-rendering one, adding a texture, sprite sheet or cutout, or previewing zones side by side.
---

# Zone art

The pipeline's layout, conventions and tools are in `art/README.md`, the texture rules in `art/textures/README.md`, and the reference sheets with what has been modelled from them in `art/references/README.md`. Read all three first. This skill holds what they don't: setup, the working loop, the traps, and how Adam likes the work done.

## Setup

- **Blender.** On an ARM Linux machine, install Ubuntu's package (`sudo apt install blender`): Blender ships no ARM Linux build, and the `bpy` wheel and the snap have none either. That build lacks OpenImageDenoise, so `render()` turns denoising off; never turn it on.
- **Python tools.** `art/tools/*.py` need Pillow, NumPy and SciPy, which neither the system Python nor Blender's own has. Make a virtualenv in the scratchpad (`python3 -m venv`, `pip install pillow numpy scipy`) and run the tools with it.
- **Image generation.** `art/tools/generate.py` makes textures, sprite sheets and reference sheets from a prompt with Gemini's image model, and reads the API key from `GEMINI_API_KEY`. On Adam's machine the key is in `~/.config/gemini.env`: `set -a; . ~/.config/gemini.env; set +a` before running it, and never print the key or put it in the repository.
- **Time.** A zone takes from half a minute to a minute and a half on 16 cores; the shadow pass of a tall building is the slow part.

## The loop

1. Print a sheet's overview (`art/tools/reference.py <sheet> all`), pick a zone, crop it (`reference.py <sheet> <row> <col>`), and look at it closely, enlarged.
2. Copy the closest existing scene in `art/blender/zones/` and change it. Measure where things sit on the crop and convert to world units (one unit per tile, origin at the south-west corner).
3. Render: `blender --background --python art/blender/zones/<zone>.py`.
4. Composite with `art/tools/preview.py`. A zone with empty neighbours (`<zone>, ,`) shows its shadows crossing its borders.
5. Put the composite beside the reference crop at the same size, and look at both. Then zoom into details with nearest-neighbour scaling: seams, floating objects and clipped edges hide at full size.
6. Send Adam each round's comparison as soon as it exists, saved under its own file name: never overwrite an earlier round.
7. Repeat until the zone matches in layout, proportions, colours and roof detail. Then record it in `art/references/README.md`.

## Traps

- **A dark seam or black square** is two surfaces at exactly one height: crossing paths, or overlapping letter strokes. Give ground layers different heights, or make one shape.
- **Glass looks brown or black.** Seen from above, the sheared walls reflect the ground, not the sky. Use `glass-curtain-wall.png` through `textured()` with `shade` well below 1 and a low roughness, not a metallic shader.
- **Tinted textures come out dark.** `textured()` multiplies the image by `tint` and `shade`, so a grey texture needs a `shade` above 1 (1.5 to 2 for roofs) to reach its intended brightness.
- **A render fails "past the edge of the zone".** The edge check is working: move the named objects in, and use `keep_inside()` for trees. Never loosen `FIT_TOLERANCE` to make a scene pass.
- **Floating objects.** A bare cutout card casts a shadow detached from the ground. Place cutouts only through `car()`, `tree()` and `shrub()`, and cars only through `parking_row()`.
- **A low object in the wrong layer.** Anything no taller than `GROUND_TOP` renders as ground and is darkened by shadows; anything taller renders as an object and never is. Choose an object's height with that in mind.
- **A new texture.** Lay out a 2×2 grid of copies (`generate.py --tiles` writes one) and look for seams before using it, zoomed in on the corner where the four copies meet: a join can fall on a natural line, such as a row of slates, and hide. Look for features that repeat too, such as a stain or a footprint, which a roof or a lawn repeats dozens of times. Crop it to whole repeats (windows, storeys, slabs) if it holds a part-unit, and say so in `art/textures/README.md`.
- **A refused prompt.** The model sometimes answers `IMAGE_RECITATION`, judging the image too close to one it has seen, and charges nothing. Describe the subject more specifically or differently rather than resending the same words. A plain, common subject (grey gravel) is refused most.
- **Generated images come back as JPEG.** `generate.py` saves PNG; keep it that way, since textures are scaled and filtered many times on the way to the render.
- **`bpy.ops` in background mode** acts on the selection: deselect all, then select the object and make it active first.

## Working with Adam

- Generate the textures and sprite sheets a scene needs with `generate.py`, one prompt per image, written to the rules in `art/textures/README.md`, and send him each one. Sprite sheets are objects on plain black that touch neither each other nor the border, so `cutout.py` can separate them. Record every image you keep, with its prompt and the model, in the README beside it.
- Running a finished render through an image model to make it look more realistic is untried, and Adam has not decided on it. What it risks: merging the zone's three layers into one picture, moving edges the edge check cannot see, and giving each zone its own light and colour. Realism put into what the render uses, its textures and cutouts, risks none of that. Try the pass on one zone, beside the plain render, before relying on it.
- Zones render at 64 px per tile. That is his decision: detail reads at that size, and the map stays a size a canvas can hold.
- He judges by eye. Send images often and say plainly what still falls short of the reference.
- A zone holds no street, no shadow falls on a roof, and the zone letters use the Tomorrow font. These rules came from him and are in `art/README.md`.

## Where this leads

The layers are made for the client to composite: every zone's ground, then the shadows merged by their darkest value, then every zone's objects. Before planning work that assumes the game draws them, check what `src/gameCanvas.js` and `src/tileSet.js` actually load and draw.

The original's zone tiles map onto these scenes as follows. A 3×3 zone is nine consecutive tile ids, in rows from its top-left (`src/buildingTool.js`). The populated residential zones start at 261, the populated commercial zones at 432, nine ids apart (names in `src/tileValues.ts`), and the single-tile houses are 249 to 260.
