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

import { Page } from "@playwright/test";

import { TILE_COUNT } from "../src/tileValues";
import { plainCanopy, plainGrass, plainWalkers, plainWalkway, plainWater } from "../test/helpers/grassArt";
import { png } from "./png";

// Rendered art made for a test, served in place of images/render/, so what the map draws is known pixel for pixel

// The atlas of the world grass a test's manifest is served with when it gives none of its own
const PLAIN_GRASS_ATLAS = "plainGrass";
const PLAIN_GRASS_PATH = "plain-grass.png";

// A render manifest's JSON (docs/render-assets.md), its world grass, canopy, water and walkways left out together where
// the test has no use for them
export type TestManifest = {
  version: number;
  atlases: Record<string, string>;
  tiles: Record<string, object>;
  sprites: Record<string, object>;
  cars: Record<string, object>;
  walkers?: object;
} & ({grass: object, canopy: object, water: object, walkway: object} |
     {grass?: never, canopy?: never, water?: never, walkway?: never});

// Serves the render manifest, and each atlas image under its path, relative to the manifest, beside an atlas of one
// green of its own. A manifest without the world grass, canopy, water and walkways every manifest has is served with
// the plainest, of that green, which no tile shows unless the manifest has a tile let the grass through, and walkways
// of black; and one without walkers with walkers of one dab, that green all over.
export async function serveTestArt(page: Page, manifest: TestManifest, atlases: Record<string, Buffer>): Promise<void> {
  const plain = {atlas: PLAIN_GRASS_ATLAS, x: 0, y: 0, width: 16, height: 16};
  const surfaces = manifest.grass !== undefined ? {} : {
    grass: plainGrass(plain, [0, 128, 0]), canopy: plainCanopy(plain), water: plainWater(plain, [0, 128, 0]),
    walkway: plainWalkway(plain),
  };
  const served = {
    manifest: {...manifest, ...surfaces, walkers: manifest.walkers ?? plainWalkers(plain),
               atlases: {...manifest.atlases, [PLAIN_GRASS_ATLAS]: PLAIN_GRASS_PATH}},
    atlases: {...atlases, [PLAIN_GRASS_PATH]: solidAtlas([0, 128, 0, 255])},
  };
  await page.route("**/images/render/manifest.json", (route) => route.fulfill({json: served.manifest}));
  for (const [path, image] of Object.entries(served.atlases)) {
    await page.route(`**/images/render/${path}`, (route) => route.fulfill({body: image, contentType: "image/png"}));
  }
}

// Serves a render manifest of no entries, so every tile and sprite draws from the 16 px sheets, images/tiles.png and
// images/sprites.png, whatever art the repository's images/render/ holds
export async function serveNoArt(page: Page): Promise<void> {
  await serveTestArt(page, {version: 1, atlases: {}, tiles: {}, sprites: {}, cars: {}}, {});
}

// A 16 pixel square atlas of one colour, RGBA
export function solidAtlas(colour: [number, number, number, number]): Buffer {
  const pixels: number[] = [];
  for (let i = 0; i < 16 * 16; i++) {
    pixels.push(...colour);
  }
  return png(16, 16, pixels);
}

// A manifest's tiles, each tile id with the same layers
export function everyTile(layers: object): Record<string, object> {
  const tiles: Record<string, object> = {};
  for (let id = 0; id < TILE_COUNT; id++) {
    tiles[id] = layers;
  }
  return tiles;
}
