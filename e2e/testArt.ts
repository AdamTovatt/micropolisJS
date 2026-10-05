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
import { png } from "./png";

// Rendered art made for a test, served in place of images/render/, so what the map draws is known pixel for pixel

// Serves the render manifest, and each atlas image under its path, relative to the manifest
export async function serveTestArt(page: Page, manifest: object, atlases: Record<string, Buffer>): Promise<void> {
  await page.route("**/images/render/manifest.json", (route) => route.fulfill({json: manifest}));
  for (const [path, image] of Object.entries(atlases)) {
    await page.route(`**/images/render/${path}`, (route) => route.fulfill({body: image, contentType: "image/png"}));
  }
}

// Serves a render manifest of no entries, so every tile and sprite draws from the 16 px sheets, images/tiles.png and
// images/sprites.png, whatever art the repository's images/render/ holds
export async function serveNoArt(page: Page): Promise<void> {
  await serveTestArt(page, {version: 1, atlases: {}, tiles: {}, sprites: {}}, {});
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
