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

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { TILE_COUNT } from "../src/tileValues";
import { plainGrass } from "../test/helpers/grassArt";
import { serverForTests } from "./gameServer";
import { collectPageProblems, contextLoss } from "./page";
import { startGame } from "./player";
import { png, samplePixels } from "./png";
import { tileAt, tilesIn } from "./savedMap";
import { SEED, SITE } from "./stages";
import { everyTile, serveTestArt, solidAtlas } from "./testArt";
import type { TestManifest } from "./testArt";

// The world grass under each tile's ground, as the ground pass draws it (docs/render-assets.md). A test atlas gives
// bare land, dirt, a ground that lets all of the grass through; each odd tile id a ground that lets it through in part,
// its left half opaque red and its right half clear; and each even one an opaque blue ground that lets none through.
// The grass is the plainest, of one green: so bare land shows that green to the last device pixel, across every edge
// between its tiles, with no line between them, the part ground red over green, and the rest blue.

const ATLAS_PATH = "grass-test.png";
const GRASS_PATH = "grass-green.png";
const BLUE = [0, 0, 255];
const RED = [255, 0, 0];
const GREEN: [number, number, number] = [0, 160, 0];
const CANVAS = "#MicropolisCanvas";

const server = serverForTests("manual");

// Three 16 pixel squares: blue; red on its left half, clear on its right; clear
function atlas(): Buffer {
  const pixels: number[] = [];
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 48; x++) {
      pixels.push(...(x < 16 ? [...BLUE, 255] : x < 24 ? [...RED, 255] : [0, 0, 0, 0]));
    }
  }
  return png(48, 16, pixels);
}

function manifest(): TestManifest {
  const square = (x: number) => ({atlas: "test", x, y: 0, width: 16, height: 16});
  const tiles = everyTile({ground: square(0)});
  for (let id = 1; id < TILE_COUNT; id += 2) {
    tiles[id] = {ground: square(16), grass: "part"};
  }
  tiles[0] = {ground: square(32), grass: "all"};
  return {version: 1, atlases: {test: ATLAS_PATH, grass: GRASS_PATH}, tiles, sprites: {}, cars: {},
          grass: plainGrass({atlas: "grass", x: 0, y: 0, width: 16, height: 16}, GREEN)};
}

// Whether a pixel is the colour, to within the rounding of the shader's arithmetic
function near(pixel: number[], colour: number[]): boolean {
  return colour.every((channel, i) => Math.abs(pixel[i] - channel) <= 2);
}

async function drawsTheGrass(page: Page): Promise<void> {
  const problems = collectPageProblems(page);
  await serveTestArt(page, manifest(), {[ATLAS_PATH]: atlas(), [GRASS_PATH]: solidAtlas([...GREEN, 255])});
  const player = await startGame(server(), page, SEED, "Grass");
  const site = SITE[0];
  await player.showTiles(tilesIn(site));
  const save = await player.save();
  const shot = await player.mapScreenshot();
  const ratio = await page.evaluate(() => window.devicePixelRatio);

  // Every device pixel of the building site, clear land, but those its edges cross
  const north = await player.tileCorner({x: site.left, y: site.top});
  const south = await player.tileCorner({x: site.right + 1, y: site.bottom + 1});
  const land: {x: number, y: number}[] = [];
  for (let y = Math.ceil(north.y * ratio) + 1; y < Math.floor(south.y * ratio) - 1; y++) {
    for (let x = Math.ceil(north.x * ratio) + 1; x < Math.floor(south.x * ratio) - 1; x++) {
      land.push({x, y});
    }
  }
  const landShown = await samplePixels(page, shot, land);
  const notGrass = landShown.pixels.flatMap((pixel, i) => near(pixel, GREEN) ? [] :
    [`(${land[i].x}, ${land[i].y}) is ${pixel.slice(0, 3).join(", ")}`]);

  // Every other tile in view, a quarter of the way across and three quarters, half way down
  const canvas = await player.canvasBox();
  const {tileWidth} = await player.view();
  const sampled: {what: string, colours: number[][], points: {x: number, y: number}[]}[] = [];
  for (const {tile, x, y} of await player.wholeTilesInView()) {
    const id = tileAt(save, tile);
    const at = (across: number) => ({x: Math.floor((canvas.x + x + tileWidth * across) * ratio),
                                     y: Math.floor((canvas.y + y + tileWidth / 2) * ratio)});
    const colours = id === 0 ? [GREEN, GREEN] : id % 2 === 1 ? [RED, GREEN] : [BLUE, BLUE];
    sampled.push({what: `(${tile.x}, ${tile.y}), tile ${id}`, colours, points: [at(0.25), at(0.75)]});
  }
  const shown = await samplePixels(page, shot, sampled.flatMap(({points}) => points));
  const wrong = sampled.flatMap(({what, colours}, i) => colours.every((colour, j) => near(shown.pixels[2 * i + j],
                                                                                           colour)) ? [] : [what]);
  const kinds = new Set(sampled.map(({colours}) => colours[0]));

  expect(land.length, "the building site's pixels").toBeGreaterThan(0);
  expect(notGrass.slice(0, 10), `${notGrass.length} pixels of bare land not the grass`).toEqual([]);
  expect(wrong.slice(0, 10), `${wrong.length} tiles wrong`).toEqual([]);
  // The view holds bare land, grounds that let the grass through in part, and grounds that let none through
  expect(kinds.size).toBe(3);
  expect(problems).toEqual([]);
}

test("bare land shows the grass whole, a ground letting it through in part only there, and others none",
     async ({page}) => drawsTheGrass(page));

// Where a tile's edges fall between device pixels, as at a browser zoom of 110%
test.describe("on a screen of 1.1 device pixels to the CSS pixel", () => {
  test.use({deviceScaleFactor: 1.1});

  test("bare land shows the grass whole, a ground letting it through in part only there, and others none",
       async ({page}) => drawsTheGrass(page));
});

test("the grass is drawn again once the browser restores a WebGL context it lost", async ({page}) => {
  const problems = collectPageProblems(page);
  await serveTestArt(page, manifest(), {[ATLAS_PATH]: atlas(), [GRASS_PATH]: solidAtlas([...GREEN, 255])});
  const player = await startGame(server(), page, SEED, "Grass restored");
  await player.showTiles(tilesIn(SITE[0]));
  const before = await player.mapScreenshot();

  const context = await contextLoss(page, CANVAS);
  await context.lose();
  await expect.poll(context.isLost).toBe(true);
  await player.settle();
  await context.restore();
  await expect.poll(context.isLost).toBe(false);

  expect((await player.mapScreenshot()).equals(before), "the map drawn after the restore, as before the loss")
    .toBe(true);
  expect(problems).toEqual([]);
});
