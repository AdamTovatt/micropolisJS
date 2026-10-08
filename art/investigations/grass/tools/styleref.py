# micropolisJS, continued by Adam Tovatt from Graeme McCutcheon's micropolisJS.
# Copyright (C) 2026 Adam Tovatt
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

"""The empty residential zone's lawn as a style reference: its pale patches and bare earth filled from the nearest
green, its mean moved to the target colour, scaled to 1024. styleref.py <r,g,b> <out.png>"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

target = np.array([float(v) for v in sys.argv[1].split(',')])
p = np.asarray(Image.open('art/painted/out/residential_empty/ground.png').convert('RGB')).astype(np.float32)
hsv = np.asarray(Image.fromarray(p.astype(np.uint8)).convert('HSV')).astype(np.float32) / 255
green = (hsv[..., 0] * 360 >= 50) & (hsv[..., 0] * 360 <= 170) & (hsv[..., 1] > 0.45)
green = ndimage.binary_erosion(green, iterations=2, border_value=1)
_, (iy, ix) = ndimage.distance_transform_edt(~green, return_indices=True)
filled = p[iy, ix]
filled = np.where(green[..., None], p, filled)
# take out the broad blotches the fill leaves, keeping the clumps
broad = ndimage.gaussian_filter(filled, (6, 6, 0), mode='reflect')
filled = filled - broad + broad.mean(axis=(0, 1))
filled = filled - filled.reshape(-1, 3).mean(0) + target
# the band of lawn along the zone's north edge, clear of the bare earth in its middle
band = filled[:24]
Image.fromarray(np.clip(band, 0, 255).round().astype(np.uint8)).resize((1536, 192), Image.LANCZOS).save(sys.argv[2])
