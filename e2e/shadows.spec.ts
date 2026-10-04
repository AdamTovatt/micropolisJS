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
import type { Page } from "@playwright/test";

import { DAMAGE_BLOCK } from "../src/mapDamage";
import { collectPageProblems } from "./page";
import { startGame, Tile } from "./player";
import { png, samplePixels } from "./png";
import { inBounds, tileAt, tilesIn } from "./savedMap";
import { SEED, SITE } from "./stages";
import { everyTile, serveTestArt } from "./testArt";

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
  const tiles = everyTile({ground});
  tiles[0] = {ground, shadow: {atlas: "test", x: 16, y: 0, width: 16, height: 16,
                               reach: {left: 1, top: 1, right: 1, bottom: 1}}};
  return {version: 1, atlases: {test: ATLAS_PATH}, tiles, sprites: {}};
}

test("overlapping shadows show the darker value, not their sum", async ({page}) => {
  const problems = collectPageProblems(page);
  await serveTestArt(page, manifest(), {[ATLAS_PATH]: atlas()});

  const player = await startGame(page, SEED, "Shadows");
  const save = await player.save();
  const view = await player.view();
  const canvas = await player.canvasBox();

  // Each tile in view, with the dirt tiles whose shadows reach it, itself included
  const sampled: {tile: Tile, shadows: number, x: number, y: number}[] = [];
  for (const {tile, column, row} of await player.wholeTilesInView()) {
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

// The same atlas, but every tile id except dirt's casts the shadow, and dirt none
function shadowsButDirt(): object {
  const ground = {atlas: "test", x: 0, y: 0, width: 16, height: 16};
  const tiles = everyTile({ground, shadow: {atlas: "test", x: 16, y: 0, width: 16, height: 16,
                                            reach: {left: 1, top: 1, right: 1, bottom: 1}}});
  tiles[0] = {ground};
  return {version: 1, atlases: {test: ATLAS_PATH}, tiles, sprites: {}};
}

const REDRAWN = "the map drawn again in part, around tiles that changed, shows what the map drawn whole does";

async function redrawnInPart(page: Page): Promise<void> {
  const problems = collectPageProblems(page);
  await serveTestArt(page, shadowsButDirt(), {[ATLAS_PATH]: atlas()});
  const player = await startGame(page, SEED, "Redrawn");
  const site = SITE[0];
  await player.showTiles(tilesIn(site));
  const before = await player.mapScreenshot();

  // A road tile on the building site's dirt, on a corner of the blocks the map is drawn again in: its shadow falls
  // on the dirt around it, in the blocks beside its own
  const {originX, originY} = await player.view();
  const onEdge = (offset: number) => offset % DAMAGE_BLOCK === 0 || offset % DAMAGE_BLOCK === DAMAGE_BLOCK - 1;
  const x = tilesIn({...site, left: site.left + 1, right: site.right - 1, bottom: site.top})
    .find((tile) => onEdge(tile.x - originX))!.x;
  const y = tilesIn({...site, left: site.left, right: site.left, top: site.top + 1, bottom: site.bottom - 1})
    .find((tile) => onEdge(tile.y - originY))!.y;
  await player.selectTool("road");
  await player.clickTile({x, y});
  const inPart = await player.mapScreenshot();
  // Sizing the canvas draws all of it again
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
  const whole = await player.mapScreenshot();

  expect(inPart.equals(before), "the map with the road tile, unlike without it").toBe(false);
  expect(inPart.equals(whole), "the map drawn in part, as drawn whole").toBe(true);
  expect(problems).toEqual([]);
}

test(REDRAWN, async ({page}) => redrawnInPart(page));

// Where a tile's edges fall between device pixels, as at a browser zoom of 110%
test.describe("on a screen of 1.1 device pixels to the CSS pixel", () => {
  test.use({deviceScaleFactor: 1.1});

  test(REDRAWN, async ({page}) => redrawnInPart(page));
});
