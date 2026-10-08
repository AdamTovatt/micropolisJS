/* micropolisJS, continued by Adam Tovatt from Graeme McCutcheon's micropolisJS.
 * Copyright (C) 2026 Adam Tovatt
 *
 * This code is released under the GNU GPL v3, with some additional terms.
 * Please see the files LICENSE and COPYING for details. Alternatively,
 * consult http://micropolisjs.graememcc.co.uk/LICENSE and
 * http://micropolisjs.graememcc.co.uk/COPYING
 *
 * The name/term "MICROPOLIS" is a registered trademark of Micropolis (https://www.micropolis.com) GmbH
 * (Micropolis Corporation, the "licensor") and is licensed here to the authors/publishers of the "Micropolis"
 * city simulation game and its source code (the project or "licensee(s)") as a courtesy of the owner.
 *
 */

import { GRASS_MAP, bakeGrassField, grassFieldPixels } from "./grass";
import type { EdgeNoise, GrassConstants } from "./grass";
import {
  FALLBACK_SPRITES, FALLBACK_TILES, RenderArt, RenderManifest, SURFACE_FIELD, checkAtlasSizes, checkRectsInAtlases,
  parseRenderManifest,
} from "./renderManifest";
import type { AtlasImage } from "./webglRenderer";

// Loads the art the map is drawn with: the rendered art's manifest and atlases, beside the 16 px sheets the page has
// loaded already (docs/render-assets.md)

// The rendered art's manifest, relative to the page. Its atlases' paths are relative to it.
export const MANIFEST_PATH = "images/render/manifest.json";

// The art, and each atlas's image
export interface MapArt {
  art: RenderArt;
  atlases: ReadonlyMap<string, AtlasImage>;
}

// An image's pixels, row by row, four bytes each: red, green, blue and alpha
export interface Pixels {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

// The pixels of the 16 px tile set, images/tiles.png, which the art holds as its fallback tiles' atlas
export function tileSetPixels(mapArt: MapArt): Pixels {
  const tiles = mapArt.atlases.get(FALLBACK_TILES);
  if (tiles === undefined) {
    throw new Error("The map's art holds no tile set");
  }

  const image = tiles.image;
  if (image instanceof ImageData) {
    return image;
  }

  // Read through a canvas
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d")!;
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, image.width, image.height);
}

// The world grass's field over the map, with the canopy's and the shore's wobble, as an image the renderer uploads
function grassFieldImage(constants: GrassConstants, canopy: EdgeNoise, shore: EdgeNoise): ImageData {
  const k = constants.texelsPerTile;
  const field = bakeGrassField(constants, canopy, shore, GRASS_MAP.width, GRASS_MAP.height);
  return new ImageData(grassFieldPixels(field), GRASS_MAP.width * k, GRASS_MAP.height * k);
}

async function loadImage(url: URL): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = url.href;
  try {
    await image.decode();
  } catch (e) {
    throw new Error(`The atlas ${url.pathname} failed to load`, {cause: e});
  }
  return image;
}

async function loadManifest(url: URL): Promise<RenderManifest> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`The render manifest ${url.pathname} failed to load: ${response.status}`);
  }

  return parseRenderManifest(await response.json());
}

// The map's art, from the rendered art's manifest and the 16 px sheets, images/tiles.png and images/sprites.png, which
// have loaded. Fails naming what failed to load, what in the manifest is wrong, or an atlas past textureLimit pixels
// a side, the largest texture the browser draws.
export async function loadMapArt(tiles: HTMLImageElement, sprites: HTMLImageElement,
                                 textureLimit: number): Promise<MapArt> {
  const manifestUrl = new URL(MANIFEST_PATH, document.baseURI);
  const manifest = await loadManifest(manifestUrl);

  const atlases = new Map<string, AtlasImage>([
    [FALLBACK_TILES, {image: tiles, filter: "crisp"}],
    [FALLBACK_SPRITES, {image: sprites, filter: "crisp"}],
  ]);
  const loads: Promise<void>[] = [];
  manifest.atlases.forEach((path, name) => {
    loads.push(loadImage(new URL(path, manifestUrl)).then((image) => {
      atlases.set(name, {image, filter: "mipmapped"});
    }));
  });
  await Promise.all(loads);

  // The surfaces' field of the grass's straw share and tint and the canopy's and the shore's wobble, baked once from the
  // manifest's constants
  const field = grassFieldImage(manifest.grass.constants, manifest.canopy.edge, manifest.water.edge);
  atlases.set(SURFACE_FIELD, {image: field, filter: "field"});

  const sizes = new Map<string, {width: number, height: number}>();
  atlases.forEach(({image}, name) => sizes.set(name, {width: image.width, height: image.height}));
  checkAtlasSizes(sizes, textureLimit);
  checkRectsInAtlases(manifest, sizes);

  return {art: new RenderArt(manifest), atlases};
}
