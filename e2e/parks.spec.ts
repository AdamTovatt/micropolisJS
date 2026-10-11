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

import { DAMAGE_BLOCK } from "../src/mapDamage";
import { openParkAround, parkTrees } from "../src/parkTrees";
import { NINTHS_PER_SIDE } from "../src/protocol";
import { RenderArt, parseRenderManifest } from "../src/renderManifest";
import { WOODS2, WOODS5 } from "../src/tileValues";
import { plainCanopy, plainGrass, plainParks, plainWalkers, plainWalkway, plainWater } from "../test/helpers/grassArt";
import { walkwayOf } from "../test/helpers/walkways";
import { serverForTests } from "./gameServer";
import { collectPageProblems } from "./page";
import { Player, startGame } from "./player";
import type { Tile } from "./player";
import { png, samplePixels } from "./png";
import { tileAt, tilesIn, walkwayAt } from "./savedMap";
import { SEED, SITE } from "./stages";
import { everyTile, serveTestArt } from "./testArt";
import type { TestManifest } from "./testArt";

// The parks, as the map draws them from where they lie (docs/render-assets.md): a test atlas gives bare land and the
// park woods a ground that lets all of the grass through, and every other tile an opaque blue ground; the grass is all
// straw, one colour, and its lush set another, which the parks' lush grass shows; and each park tree is a red square
// casting a half-black shadow.

const ATLAS_PATH = "park-test.png";
const GRASS_PATH = "park-grass.png";
const BLUE = [0, 0, 255];
const STRAW: [number, number, number] = [200, 180, 60];
const LUSH: [number, number, number] = [0, 160, 0];
const GRAVEL: [number, number, number] = [130, 110, 90];
const RED = [255, 0, 0];

const server = serverForTests("manual");

// 32 pixel squares, each holding its 16 pixel square 8 pixels in from its edges, so sampled linearly at the square's
// edge it takes nothing else: blue, clear, white, the walkers' dab, red, a tree's crown, and half black, its shadow
function atlas(): Buffer {
  const colours = [[...BLUE, 255], [0, 0, 0, 0], [255, 255, 255, 255], [...RED, 255], [0, 0, 0, 128]];
  const pixels: number[] = [];
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32 * colours.length; x++) {
      pixels.push(...colours[Math.floor(x / 32)]);
    }
  }
  return png(32 * colours.length, 32, pixels);
}

// The grass's atlas: the straw, then the lush, each 32 pixels wide, its 16 pixel square 8 pixels in from its edges
function grassAtlas(): Buffer {
  const pixels: number[] = [];
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 64; x++) {
      pixels.push(...(x < 32 ? STRAW : LUSH), 255);
    }
  }
  return png(64, 32, pixels);
}

// A 16 pixel square of the test atlas, the nth
const square = (atlasName: string, n: number) => ({atlas: atlasName, x: 32 * n + 8, y: 8, width: 16, height: 16});

// The test art: trees on as many ninths as leafy gives, from a ninth a side to the largest given, each casting its
// shadow over the square shadowSpan times its own
function manifest(leafy: number, largest = 1, shadowSpan = 1): TestManifest {
  const tiles = everyTile({ground: square("test", 0)});
  for (const id of [0, ...Array.from({length: WOODS5 - WOODS2 + 1}, (_, i) => WOODS2 + i)]) {
    tiles[id] = {ground: square("test", 1), grass: "all"};
  }
  const straw = square("grass", 0);
  const lush = square("grass", 1);
  // All straw everywhere: the noise weighs nothing, and the share stands past all of it
  const grass = plainGrass(straw, STRAW);
  grass.mask.centre = -1;
  grass.sets.lush = {mean: LUSH, tiles: [lush]};
  const parks = plainParks(square("test", 3), leafy, square("test", 4));
  return {version: 1, atlases: {test: ATLAS_PATH, grass: GRASS_PATH}, tiles, sprites: {}, cars: {},
          walkers: plainWalkers(square("test", 2)), grass, canopy: plainCanopy(straw), water: plainWater(straw, STRAW),
          walkway: plainWalkway(straw, GRAVEL, GRAVEL, GRAVEL),
          parks: {...parks, trees: {...parks.trees, largest, shadowSpan}}};
}

// Whether a pixel is the colour, to within the rounding of the shader's arithmetic
function near(pixel: number[], colour: number[]): boolean {
  return colour.every((channel, i) => Math.abs(pixel[i] - channel) <= 2);
}

// Whether a pixel shows a tree's crown
const reddish = (pixel: number[]) => pixel[0] > 200 && pixel[1] < 60 && pixel[2] < 60;

// A game on the test art, its map at 64 pixels a tile, the closest zoom, showing the tiles given, on the first building
// site, clear land
async function startOnTestArt(page: Page, served: TestManifest, name: string, shown: Tile[]): Promise<Player> {
  await serveTestArt(page, served, {[ATLAS_PATH]: atlas(), [GRASS_PATH]: grassAtlas()});
  const player = await startGame(server(), page, SEED, name);
  await player.showTiles(tilesIn(SITE[0]));
  // With the keys, not the wheel, whose notch Chromium shrinks by the device pixels to the CSS pixel
  await player.zoomWithKeys(2);
  await player.showTiles(shown);
  return player;
}

// Lays parks on the tiles given
async function layParks(player: Player, tiles: Tile[]): Promise<void> {
  await player.selectTool("park");
  for (const tile of tiles) {
    await player.clickTile(tile);
  }
}

// The ninth of the map's grid of ninths in the middle of a tile's own ninth n, numbered row by row
function ninthOf(tile: Tile, n: number): Tile {
  return {x: NINTHS_PER_SIDE * tile.x + n % NINTHS_PER_SIDE,
          y: NINTHS_PER_SIDE * tile.y + Math.floor(n / NINTHS_PER_SIDE)};
}

// Every device pixel of the part of a tile from (left, top) to (right, bottom), in tiles from its top-left, but those
// its edges fall within
async function pixelsOf(page: Page, player: Player, tile: Tile, left = 0, top = 0, right = 1,
                        bottom = 1): Promise<{x: number, y: number}[]> {
  const ratio = await page.evaluate(() => window.devicePixelRatio);
  const corner = await player.tileCorner(tile);
  const {tileWidth} = await player.view();
  const pixels: {x: number, y: number}[] = [];
  for (let y = Math.ceil((corner.y + top * tileWidth) * ratio); y < Math.floor((corner.y + bottom * tileWidth) * ratio);
       y++) {
    for (let x = Math.ceil((corner.x + left * tileWidth) * ratio);
         x < Math.floor((corner.x + right * tileWidth) * ratio); x++) {
      pixels.push({x, y});
    }
  }
  return pixels;
}

test("a park shows the lush grass, fading out over its edge into the straw beside it", async ({page}) => {
  const problems = collectPageProblems(page);
  // Three parks by three, with no trees, and straw two tiles from them
  const park = {left: SITE[0].left + 3, top: SITE[0].top + 3, right: SITE[0].left + 5, bottom: SITE[0].top + 5};
  const player = await startOnTestArt(page, manifest(0), "Lush parks",
                                      tilesIn({...park, left: park.left - 2, right: park.right + 2}));
  await layParks(player, tilesIn(park));
  await player.selectTool("query");
  const save = await player.save();
  expect(tilesIn(park).every((tile) => tileAt(save, tile) >= WOODS2 && tileAt(save, tile) <= WOODS5), "the parks")
    .toBe(true);

  const ratio = await page.evaluate(() => window.devicePixelRatio);
  const {tileWidth} = await player.view();
  const middle = {x: park.left + 1, y: park.top + 1};
  const at = async (tile: Tile, x: number, y: number) => {
    const corner = await player.tileCorner(tile);
    return {x: Math.floor((corner.x + x * tileWidth) * ratio), y: Math.floor((corner.y + y * tileWidth) * ratio)};
  };
  const points = [await at(middle, 0.5, 0.5), await at({x: park.left, y: middle.y}, 0.05, 0.5),
                  await at({x: park.left - 2, y: middle.y}, 0.5, 0.5), await at({x: park.left, y: middle.y}, 0, 0.5)];
  const [inside, byEdge, beyond, onEdge] = (await samplePixels(page, await player.mapScreenshot(), points)).pixels;

  expect(near(inside, LUSH), `the park's middle, ${inside.slice(0, 3)}`).toBe(true);
  expect(near(byEdge, LUSH), `inside the park by its edge, ${byEdge.slice(0, 3)}`).toBe(true);
  expect(near(beyond, STRAW), `the straw two tiles from the park, ${beyond.slice(0, 3)}`).toBe(true);
  // On the park's edge, half way between them
  expect(near(onEdge, LUSH) || near(onEdge, STRAW), `the park's edge, ${onEdge.slice(0, 3)}`).toBe(false);
  expect(problems).toEqual([]);
});

test("a park's trees stand all round a path through it, and no crown covers the path", async ({page}) => {
  const problems = collectPageProblems(page);
  // Three parks by three with a tree on every ninth, as large as two ninths, and a path down the middle column of
  // ninths of the middle column of parks
  const park = {left: SITE[0].left + 3, top: SITE[0].top + 3, right: SITE[0].left + 5, bottom: SITE[0].top + 5};
  const player = await startOnTestArt(page, manifest(1, 2), "Park trees", tilesIn(park));
  await layParks(player, tilesIn(park));
  const column = park.left + 1;
  await player.selectTool("walkway");
  await player.dragNinths(ninthOf({x: column, y: park.top}, 1), ninthOf({x: column, y: park.bottom}, 7));
  await player.selectTool("query");
  expect(walkwayAt(await player.save(), {x: column, y: park.top + 1}), "the path").toBe(walkwayOf([1, 4, 7]));

  const shot = await player.mapScreenshot();
  // The path's ninths, and the ninths beside it, in the middle park
  const onPath = await pixelsOf(page, player, {x: column, y: park.top + 1}, 1 / 3, 0, 2 / 3, 1);
  const beside = await pixelsOf(page, player, {x: column, y: park.top + 1}, 0, 0, 1 / 3, 1);
  const [path, trees] = await Promise.all([onPath, beside].map((pixels) => samplePixels(page, shot, pixels)));

  expect(path.pixels.filter(reddish).length, "the path's pixels a crown covers").toBe(0);
  expect(trees.pixels.filter(reddish).length / trees.pixels.length, "the crowns' share beside the path")
    .toBeGreaterThan(0.5);
  expect(problems).toEqual([]);
});

const REDRAWN = "the trees drawn again in part, round a path laid at a block's edge that the trees past it hold back " +
  "from, show what the map drawn whole does";

// The parks laid round the tile a path is laid on: from the tile west of it to two tiles east, a row up and down
const parksRound = (pathed: Tile) => ({left: pathed.x - 1, top: pathed.y - 1, right: pathed.x + 2, bottom: pathed.y + 1});

// Whether a path down the east column of ninths of the tile given changes the trees of the tile east of it, among the
// parks laid round it, as the client places them from the art served
function heldBack(served: TestManifest, pathed: Tile): boolean {
  const art = new RenderArt(parseRenderManifest(served));
  const parks = parksRound(pathed);
  // The grid of tiles from a tile up and left of the parks to one down and right of them
  const width = parks.right - parks.left + 3;
  const height = parks.bottom - parks.top + 3;
  const values = Array.from({length: width * height}, (_, i) => {
    const x = parks.left - 1 + i % width;
    const y = parks.top - 1 + Math.floor(i / width);
    return x >= parks.left && x <= parks.right && y >= parks.top && y <= parks.bottom ? WOODS2 : 0;
  });
  const trees = (walkways: number[]) => {
    const column = pathed.x + 1 - (parks.left - 1);
    const row = pathed.y - (parks.top - 1);
    return parkTrees(pathed.x + 1, pathed.y, openParkAround({width, height, values, walkways}, column, row), art.trees,
                     art.treeChance);
  };
  const none = values.map(() => 0);
  const pathedWalkways = none.slice();
  pathedWalkways[(pathed.y - (parks.top - 1)) * width + pathed.x - (parks.left - 1)] = walkwayOf([2, 5, 8]);
  return JSON.stringify(trees(none)) !== JSON.stringify(trees(pathedWalkways));
}

async function redrawnInPart(page: Page): Promise<void> {
  const problems = collectPageProblems(page);
  // Parks round the last tile of a block of those the map is drawn again in and the tile past it, with a tree on two
  // ninths in five, as large and their shadows as wide as the manifest allows, so their crowns reach over the block's
  // edge and the grass shows between them, and the shadows on it; then a path down the last tile's east column of
  // ninths, which the trees of the next block's first tile hold back from. How far a path's change reaches past it,
  // which a change by a block's edge but not on it tells, test/mapFrame.ts tests: here other trees' shadows, merged by
  // the darkest, hide the farthest of it.
  const served = manifest(0.4, 2, 3);
  const player = await startOnTestArt(page, served, "Park trees redrawn",
                                      tilesIn({left: SITE[0].left + 2, top: SITE[0].top + 2, right: SITE[0].left + 13,
                                               bottom: SITE[0].top + 6}));
  const first = await player.firstTileInView();
  const inView = (await player.wholeTilesInView()).map(({tile}) => tile);
  const column = inView.find(({x}) => x > SITE[0].left + 1 && x < SITE[0].right - 1 &&
                                      (x + 1 - first.x) % DAMAGE_BLOCK === 0)?.x;
  expect(column, "the last column of a block in view, on the building site").toBeDefined();
  // The row in which the path changes the trees of the tile past it, as the client places them
  const row = [2, 3, 4, 5, 6].map((dy) => SITE[0].top + dy).find((y) => heldBack(served, {x: column!, y}));
  expect(row, "a row in which the path holds back the trees past the block's edge").toBeDefined();
  const pathed = {x: column!, y: row!};
  const next = {x: column! + 1, y: row!};
  await layParks(player, tilesIn(parksRound(pathed)));
  await player.selectTool("query");
  const before = await player.mapScreenshot();
  await player.selectTool("walkway");
  await player.dragNinths(ninthOf(pathed, 2), ninthOf(pathed, 8));
  await player.selectTool("query");
  const inPart = await player.mapScreenshot();
  // Sizing the canvas draws all of it again
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
  const whole = await player.mapScreenshot();

  // Every device pixel of the tile past the block's edge
  const pixels = await pixelsOf(page, player, next);
  const [was, is] = await Promise.all([before, whole].map((shot) => samplePixels(page, shot, pixels)));

  expect(walkwayAt(await player.save(), pathed), "the path at the block's edge").toBe(walkwayOf([2, 5, 8]));
  expect(was.pixels, `tile (${next.x}, ${next.y}), past the block's edge, its trees held back, unlike before`)
    .not.toEqual(is.pixels);
  expect(inPart.equals(whole), "the map drawn in part, as drawn whole").toBe(true);
  expect(problems).toEqual([]);
}

test(REDRAWN, async ({page}) => redrawnInPart(page));

// Where a tile's and a ninth's edges fall between device pixels, as at a browser zoom of 110%
test.describe("on a screen of 1.1 device pixels to the CSS pixel", () => {
  test.use({deviceScaleFactor: 1.1});

  test(REDRAWN, async ({page}) => redrawnInPart(page));
});
