# Painted layers

Each Blender render in `art/blender/out/` repainted as an oil painting by an image model, in the render's three layers: `out/<asset>/` holds `ground.png`, `shadow.png` and `objects.png` at the render's sizes, and a copy of its `layers.json`, so the atlas build can take the painted set or the rendered one. `art/tools/paint.py` makes them, as the art-painting skill (`.claude/skills/art-painting/SKILL.md`) describes.

These are committed, unlike the renders: a painting cannot be rebuilt from a script. The model inputs and the 1024 px paintings they were cut from stay in `raw/<job>/`, which git ignores.

## Prompts and model

Every asset's `painting.json` records the job it was painted in and, for each painting its job made (`full`, `ground`, `shadow`), the exact prompt and the model. A layer with no painting is the render's: a traffic frame's ground, the objects of a tile where nothing stands, or a vehicle's shadow. Wherever a single tile shares a surface with another, such as the bare land beside a road, it takes that surface from one tile's painting, its donor's, as `paint.py join` gives it, so neighbouring tiles join; each object's and shadow's thin parts, such as a power line's wires, are the render's. The prompts are the art-painting skill's, which `paint.py` fills in with what the asset is and what its ground is made of. All of them use Google's Gemini image model, `gemini-3-pro-image`, through `art/tools/generate.py`, given the job's model input as a reference image.

A zone with an animation also holds each frame's layers in `frame-<n>/`, as its render does: the painted still, with what moves taken from one painting of all the frames, whose `painting.json` names the still and records that painting's prompt. Zone letters and marks, such as the nuclear plant's atom, are the render's in every frame.

An asset whose ground was painted again with its own description of its surfaces, after the general one failed, has that description in its `ground` prompt.
