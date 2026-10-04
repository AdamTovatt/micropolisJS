/* micropolisJS. Adapted by Graeme McCutcheon from Micropolis.
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

import { expect, test } from "@playwright/test";

import { blockNetwork, collectPageProblems } from "./page";
import { Player, Tile } from "./player";
import { TILE_COUNT } from "../src/tileValues";
import { png, samplePixels } from "./png";
import { inBounds, tileAt } from "./savedMap";
import { SEED } from "./stages";

// Shadows merge by their darkest value. A test atlas gives every tile id white ground, and dirt, tile 0, a shadow of
// half darkness reaching a tile past it on every side. Where shadows overlap, the map shows the darkness of one, not
// the darkness of their sum, which would be black, nor of one over another, which would be a quarter grey.

// The atlas: a white square, then a black square of the darkness's alpha, each 16 pixels
const DARKNESS = 128;
const ATLAS_PATH = "test-atlas.png";

function atlas(): Buffer {
  const pixels: number[] = [];
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 32; x++) {
      pixels.push(...(x < 16 ? [255, 255, 255, 255] : [0, 0, 0, DARKNESS]));
    }
  }
  return png(32, 16, pixels);
}

function manifest(): object {
  const ground = {atlas: "test", x: 0, y: 0, width: 16, height: 16};
  const tiles: Record<string, object> = {};
  for (let id = 0; id < TILE_COUNT; id++) {
    tiles[id] = {ground};
  }
  tiles[0] = {ground, shadow: {atlas: "test", x: 16, y: 0, width: 16, height: 16,
                               reach: {left: 1, top: 1, right: 1, bottom: 1}}};
  return {version: 1, atlases: {test: ATLAS_PATH}, tiles, sprites: {}};
}

test("overlapping shadows show the darker value, not their sum", async ({page}) => {
  await blockNetwork(page);
  const problems = collectPageProblems(page);
  await page.route("**/images/render/manifest.json", (route) => route.fulfill({json: manifest()}));
  await page.route(`**/images/render/${ATLAS_PATH}`,
                   (route) => route.fulfill({body: atlas(), contentType: "image/png"}));

  // The driver is held from the start, so the map is the seed's, with no sprites
  const player = new Player(page);
  await player.startNewGame(SEED, "Shadows", "Easy");
  await page.evaluate(() => window.micropolisTestHook!.dismissNotification());
  await player.settle();
  const save = await player.save();
  const view = await page.evaluate(() => window.micropolisTestHook!.view());
  const canvas = (await page.locator("#MicropolisCanvas").boundingBox())!;

  // Each tile in view, with the dirt tiles whose shadows reach it, itself included
  const sampled: {tile: Tile, shadows: number, x: number, y: number}[] = [];
  for (let row = 0; row < Math.floor(canvas.height / view.tileWidth); row++) {
    for (let column = 0; column < Math.floor(canvas.width / view.tileWidth); column++) {
      const tile = {x: view.originX + column, y: view.originY + row};
      let shadows = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const near = {x: tile.x + dx, y: tile.y + dy};
          if (inBounds(save, near) && tileAt(save, near) === 0) {
            shadows++;
          }
        }
      }
      sampled.push({tile, shadows, x: Math.floor(canvas.x + (column + 0.5) * view.tileWidth),
                    y: Math.floor(canvas.y + (row + 0.5) * view.tileWidth)});
    }
  }

  // The middle pixel of each tile
  const shown = await samplePixels(page, await player.mapScreenshot(), sampled.map(({x, y}) => ({x, y})));

  const shaded = Math.round(255 * (1 - DARKNESS / 255));
  const wrong: string[] = [];
  const seen = new Set<number>();
  sampled.forEach(({tile, shadows}, index) => {
    const colour = shown.pixels[index].slice(0, 3);
    seen.add(Math.min(shadows, 2));
    const expected = shadows === 0 ? 255 : shaded;
    if (colour.some((channel) => Math.abs(channel - expected) > 1)) {
      wrong.push(`(${tile.x}, ${tile.y}) under ${shadows} shadows is ${colour.join(", ")}, not ${expected}`);
    }
  });

  expect(wrong.slice(0, 10), `${wrong.length} tiles wrong`).toEqual([]);
  // The view holds tiles under no shadow, under one, and under several
  expect(Array.from(seen).sort()).toEqual([0, 1, 2]);
  expect(problems).toEqual([]);
});
