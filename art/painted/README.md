# Painted layers

Each Blender render in `art/blender/out/` repainted as an oil painting by an image model, in the render's three layers: `out/<asset>/` holds `ground.png`, `shadow.png` and `objects.png` at the render's sizes, and a copy of its `layers.json`, so the atlas build can take the painted set or the rendered one. `art/tools/paint.py` makes them, as the art-painting skill (`.claude/skills/art-painting/SKILL.md`) describes.

These are committed, unlike the renders: a painting cannot be rebuilt from a script. The model inputs and the 1024 px paintings they were cut from stay in `raw/<job>/`, which git ignores.

## Prompts and model

Every asset's `painting.json` records the job it was painted in and, for each of its three paintings (`full`, `ground`, `shadow`), the exact prompt and the model. The prompts are the art-painting skill's, which `paint.py` fills in with what the asset is and what its ground is made of. All of them use Google's Gemini image model, `gemini-3-pro-image`, through `art/tools/generate.py`, given the job's model input as a reference image.

An asset whose ground was painted again with its own description of its surfaces, after the general one failed, has that description in its `ground` prompt.
