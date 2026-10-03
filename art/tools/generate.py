# micropolisJS. Adapted by Graeme McCutcheon from Micropolis.
#
# This code is released under the GNU GPL v3, with some additional terms.
# Please see the files LICENSE and COPYING for details. Alternatively,
# consult http://micropolisjs.graememcc.co.uk/LICENSE and
# http://micropolisjs.graememcc.co.uk/COPYING
#
# The name/term "MICROPOLIS" is a registered trademark of Micropolis (https://www.micropolis.com) GmbH
# (Micropolis Corporation, the "licensor") and is licensed here to the authors/publishers of the "Micropolis"
# city simulation game and its source code (the project or "licensee(s)") as a courtesy of the owner.
#

"""Generate an image from a prompt with Google's Gemini image model, and save it as a PNG.

    python art/tools/generate.py art/textures/brick-wall.png "Seamless tileable texture of ..."
    python art/tools/generate.py sheet.png "..." --reference layout.png --aspect 3:2

--reference passes images the model works from: a layout to follow, or an image to change.
--tiles also writes <out>-tiled.png, four copies 2x2, to look for seams before using a texture.

Reads the API key from GEMINI_API_KEY. Needs Pillow. Record what you keep, with its prompt
and the model, in the README beside it.
"""

import argparse
import base64
import io
import json
import mimetypes
import os
import sys
import urllib.error
import urllib.request

from PIL import Image

MODEL = 'gemini-3-pro-image'
ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent'


def generate(prompt, references=(), aspect='1:1', model=MODEL):
    key = os.environ.get('GEMINI_API_KEY')
    if not key:
        sys.exit('GEMINI_API_KEY is not set')
    parts = [{'text': prompt}]
    for path in references:
        mime = mimetypes.guess_type(path)[0] or 'image/png'
        with open(path, 'rb') as f:
            parts.append({'inlineData': {'mimeType': mime, 'data': base64.b64encode(f.read()).decode()}})
    body = {'contents': [{'parts': parts}],
            'generationConfig': {'responseModalities': ['IMAGE'], 'imageConfig': {'aspectRatio': aspect}}}
    request = urllib.request.Request(ENDPOINT.format(model), data=json.dumps(body).encode(),
                                     headers={'x-goog-api-key': key, 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(request, timeout=300) as response:
            answer = json.load(response)
    except urllib.error.HTTPError as e:
        error = json.load(e).get('error', {})
        sys.exit(f"{e.code} {error.get('status', '')}: {error.get('message', '').splitlines()[0]}")
    for candidate in answer.get('candidates', []):
        for part in candidate.get('content', {}).get('parts', []):
            if 'inlineData' in part:
                return Image.open(io.BytesIO(base64.b64decode(part['inlineData']['data']))).convert('RGB')
    sys.exit('no image in the answer: ' + json.dumps(answer)[:500])


def tiled(image):
    w, h = image.size
    grid = Image.new('RGB', (2 * w, 2 * h))
    for i in range(2):
        for j in range(2):
            grid.paste(image, (i * w, j * h))
    return grid


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    p.add_argument('out', help='the PNG to write')
    p.add_argument('prompt')
    p.add_argument('--reference', action='append', default=[], help='an image the model works from; repeatable')
    p.add_argument('--aspect', default='1:1', help='aspect ratio, such as 1:1, 3:2 or 16:9')
    p.add_argument('--model', default=MODEL)
    p.add_argument('--tiles', action='store_true', help='also write <out>-tiled.png, four copies 2x2')
    a = p.parse_args()
    image = generate(a.prompt, a.reference, a.aspect, a.model)
    image.save(a.out)
    print(f'{a.out}: {image.size[0]}x{image.size[1]}')
    if a.tiles:
        stem, _ = os.path.splitext(a.out)
        tiled(image).save(stem + '-tiled.png')
