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
import { NINTHS_PER_SIDE } from "../src/protocol";
import { tripRoute } from "../src/routeTiles";
import { ROADS, ROADS2 } from "../src/tileValues";
import { WALKER_COLOURS, WALK_SPEED, walkerLook } from "../src/walkers";
import { plainCanopy, plainGrass, plainWalkers, plainWalkway, plainWater } from "../test/helpers/grassArt";
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

// The paths over each tile's ground, as the map draws them from the ninths that hold walkway (docs/render-assets.md).
// A test atlas gives bare land a ground that lets all of the grass through, and every other tile an opaque blue
// ground; the grass is one green. The paths are the plainest: gravel, paving and a crossing's stripes each one flat
// colour, which a path shows whole in the middle of its ninths, so a path across a road shows the gravel on the bare
// land either side, the paving on the road's verges, and on its carriageway the stripes, with the road between them.

const ATLAS_PATH = "walkway-test.png";
const GRASS_PATH = "walkway-grass.png";
const BLUE = [0, 0, 255];
const GREEN: [number, number, number] = [0, 160, 0];
const GRAVEL: [number, number, number] = [200, 170, 110];
const PAVING: [number, number, number] = [150, 150, 150];
const STRIPES: [number, number, number] = [250, 250, 250];

const server = serverForTests("manual");

// Three 16 pixel squares: blue, clear, then white, the walkers' dab
function atlas(): Buffer {
  const pixels: number[] = [];
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 48; x++) {
      pixels.push(...(x < 16 ? [...BLUE, 255] : x < 32 ? [0, 0, 0, 0] : [255, 255, 255, 255]));
    }
  }
  return png(48, 16, pixels);
}

// The grass's atlas, the green, its 16 pixel square 8 pixels in from the edges, so sampled linearly at the square's
// edge it takes nothing else
function grassAtlas(): Buffer {
  return png(32, 16, Array.from({length: 32 * 16}, () => [...GREEN, 255]).flat());
}

// The test art, its paths' edges eaten into by the wobble as much as the edge given
function manifest(edge: number): TestManifest {
  const tiles = everyTile({ground: {atlas: "test", x: 0, y: 0, width: 16, height: 16}});
  tiles[0] = {ground: {atlas: "test", x: 16, y: 0, width: 16, height: 16}, grass: "all"};
  const rect = {atlas: "grass", x: 8, y: 0, width: 16, height: 16};
  return {version: 1, atlases: {test: ATLAS_PATH, grass: GRASS_PATH}, tiles, sprites: {}, cars: {},
          walkers: plainWalkers({atlas: "test", x: 32, y: 0, width: 16, height: 16}),
          grass: plainGrass(rect, GREEN), canopy: plainCanopy(rect), water: plainWater(rect, GREEN),
          walkway: {...plainWalkway(GRAVEL, PAVING, STRIPES), edge}};
}

// Whether a pixel is the colour, to within the rounding of the shader's arithmetic
function near(pixel: number[], colour: number[]): boolean {
  return colour.every((channel, i) => Math.abs(pixel[i] - channel) <= 2);
}

// A game on the test art, its paths' edges eaten into as much as the edge given, its map at 64 pixels a tile, the
// closest zoom, showing the tiles given, on the first building site, clear land
async function startOnTestArt(page: Page, name: string, shown: Tile[], edge = 0): Promise<Player> {
  await serveTestArt(page, manifest(edge), {[ATLAS_PATH]: atlas(), [GRASS_PATH]: grassAtlas()});
  const player = await startGame(server(), page, SEED, name);
  await player.showTiles(tilesIn(SITE[0]));
  await player.zoomWithWheel(shown[0], 2);
  await player.showTiles(shown);
  return player;
}

// The ninth of the map's grid of ninths in the middle of a tile's own ninth n, numbered row by row
function ninthOf(tile: Tile, n: number): Tile {
  return {x: NINTHS_PER_SIDE * tile.x + n % NINTHS_PER_SIDE,
          y: NINTHS_PER_SIDE * tile.y + Math.floor(n / NINTHS_PER_SIDE)};
}

test("a path shows gravel on bare land, paving on a road's verges and a crossing's stripes over its carriageway",
     async ({page}) => {
  const problems = collectPageProblems(page);
  // A road along row 34 from (50, 34) to (56, 34), and a path down the middle column of ninths of column 53, from row
  // 32 to row 36, across it; and a road down column 58 from (58, 32) to (58, 36), and a path along the middle row of
  // ninths of row 34, from column 57 to column 59, across that
  const road = {left: 50, top: 34, right: 56, bottom: 34};
  const crossed = {x: 53, y: 34};
  const roadDown = {left: 58, top: 32, right: 58, bottom: 36};
  const crossedAcross = {x: 58, y: 34};
  const player = await startOnTestArt(page, "Walkways", tilesIn({left: road.left, top: 32, right: roadDown.right + 1,
                                                                  bottom: 36}));
  await player.selectTool("road");
  await player.dragTiles({x: road.left, y: road.top}, {x: road.right, y: road.bottom});
  await player.dragTiles({x: roadDown.left, y: roadDown.top}, {x: roadDown.right, y: roadDown.bottom});
  await player.selectTool("walkway");
  await player.dragNinths(ninthOf({x: crossed.x, y: 32}, 1), ninthOf({x: crossed.x, y: 36}, 7));
  await player.dragNinths(ninthOf({x: crossedAcross.x - 1, y: 34}, 3), ninthOf({x: crossedAcross.x + 1, y: 34}, 5));
  await player.selectTool("query");
  const save = await player.save();
  expect(tilesIn(road).map((tile) => tileAt(save, tile)), "the road").toEqual(tilesIn(road).map(() => ROADS));
  expect(tilesIn(roadDown).map((tile) => tileAt(save, tile)), "the road down")
    .toEqual(tilesIn(roadDown).map(() => ROADS2));
  expect(walkwayAt(save, crossed), "the path across the road").toBe(walkwayOf([1, 4, 7]));
  expect(walkwayAt(save, crossedAcross), "the path across the road down").toBe(walkwayOf([3, 4, 5]));

  // Points within a tile, from its top-left, in tiles, and what each must show
  const ratio = await page.evaluate(() => window.devicePixelRatio);
  const {tileWidth} = await player.view();
  const expected: {what: string, tile: Tile, at: {x: number, y: number}, colour: number[]}[] = [
    {what: "the path on bare land", tile: {x: crossed.x, y: 33}, at: {x: 0.5, y: 0.5}, colour: GRAVEL},
    {what: "bare land beside the path", tile: {x: crossed.x, y: 33}, at: {x: 1 / 6, y: 0.5}, colour: GREEN},
    {what: "the path on the road's north verge", tile: crossed, at: {x: 0.5, y: 1 / 6}, colour: PAVING},
    {what: "the path on the road's south verge", tile: crossed, at: {x: 0.5, y: 5 / 6}, colour: PAVING},
    // Two stripes to a ninth, down the way the path runs, each a quarter of the ninth
    {what: "the road between the crossing's stripes", tile: crossed, at: {x: 0.5, y: (1 + 0.125) / 3}, colour: BLUE},
    {what: "a crossing's stripe", tile: crossed, at: {x: 0.5, y: (1 + 0.375) / 3}, colour: STRIPES},
    {what: "the road beside the crossing", tile: crossed, at: {x: 1 / 6, y: 0.5}, colour: BLUE},
    // and across the way the path across the road down runs
    {what: "the road between the stripes of the crossing across", tile: crossedAcross, at: {x: (1 + 0.125) / 3, y: 0.5},
     colour: BLUE},
    {what: "a stripe of the crossing across", tile: crossedAcross, at: {x: (1 + 0.375) / 3, y: 0.5}, colour: STRIPES},
    {what: "the path on the road down's west verge", tile: crossedAcross, at: {x: 1 / 6, y: 0.5}, colour: PAVING},
    {what: "the road with no path", tile: {x: 51, y: 34}, at: {x: 0.5, y: 0.5}, colour: BLUE},
  ];
  const points = await Promise.all(expected.map(async ({tile, at}) => {
    const corner = await player.tileCorner(tile);
    return {x: Math.floor((corner.x + at.x * tileWidth) * ratio), y: Math.floor((corner.y + at.y * tileWidth) * ratio)};
  }));
  const shown = await samplePixels(page, await player.mapScreenshot(), points);
  const wrong = expected.flatMap(({what, colour}, i) => near(shown.pixels[i], colour) ? [] :
    [`${what} is ${shown.pixels[i].slice(0, 3).join(", ")}`]);

  expect(wrong).toEqual([]);
  expect(problems).toEqual([]);
});

test("the paths drawn again in part, round a walkway that joins a path across a block's edge, show what the map " +
     "drawn whole does", async ({page}) => {
  const problems = collectPageProblems(page);
  // A path along the middle row of ninths of the last tile of a block of those the map is drawn again in, then one
  // ninth more, the first of the next block's first tile, which the first path's east end now joins
  const row = SITE[0].top + 4;
  const player = await startOnTestArt(page, "Walkways redrawn",
                                      tilesIn({left: SITE[0].left + 2, top: row, right: SITE[0].left + 14, bottom: row}));
  const {originX} = await player.view();
  const inView = (await player.wholeTilesInView()).map(({tile}) => tile);
  const last = inView.find(({x, y}) => y === row && x > SITE[0].left && x < SITE[0].right &&
                                       (x + 1 - originX) % DAMAGE_BLOCK === 0);
  expect(last, "the last tile of a block in view, on the building site").toBeDefined();
  await player.selectTool("walkway");
  await player.dragNinths(ninthOf(last!, 3), ninthOf(last!, 5));
  const before = await player.mapScreenshot();
  await player.dragNinths(ninthOf({x: last!.x + 1, y: row}, 3), ninthOf({x: last!.x + 1, y: row}, 3));
  await player.selectTool("query");
  const inPart = await player.mapScreenshot();
  // Sizing the canvas draws all of it again
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
  const whole = await player.mapScreenshot();

  // Every device pixel of the first path's tile, whose path's east end the second joins
  const ratio = await page.evaluate(() => window.devicePixelRatio);
  const corner = await player.tileCorner(last!);
  const {tileWidth} = await player.view();
  const pixels: {x: number, y: number}[] = [];
  for (let y = Math.ceil(corner.y * ratio); y < Math.floor((corner.y + tileWidth) * ratio); y++) {
    for (let x = Math.ceil(corner.x * ratio); x < Math.floor((corner.x + tileWidth) * ratio); x++) {
      pixels.push({x, y});
    }
  }
  const [was, is] = await Promise.all([before, whole].map((shot) => samplePixels(page, shot, pixels)));

  expect(walkwayAt(await player.save(), {x: last!.x + 1, y: row}), "the ninth laid past the block's edge")
    .toBe(walkwayOf([3]));
  expect(was.pixels, `tile (${last!.x}, ${row}), before the block's edge, with its path joined, unlike without`)
    .not.toEqual(is.pixels);
  expect(inPart.equals(whole), "the map drawn in part, as drawn whole").toBe(true);
  expect(problems).toEqual([]);
});

test("the wobble eats into a path's edge, but never grows it nor reaches its middle", async ({page}) => {
  const problems = collectPageProblems(page);
  // The same path, along the middle row of ninths of a tile of bare land, in two cities on the same map: one whose
  // paths' edges the wobble leaves be, and one whose it eats into as much as it can
  const tile = {x: SITE[0].left + 3, y: SITE[0].top + 3};
  const shown = tilesIn({left: tile.x - 1, top: tile.y - 1, right: tile.x + 1, bottom: tile.y + 1});
  // How much of the way from the grass's green to the gravel each device pixel down the tile's middle column is, with
  // the path's edges eaten into as much as the edge given, on the page
  const coverDown = async (on: Page, edge: number): Promise<number[]> => {
    const player = await startOnTestArt(on, `Walkway edge ${edge}`, shown, edge);
    await player.selectTool("walkway");
    await player.dragNinths(ninthOf(tile, 3), ninthOf(tile, 5));
    await player.selectTool("query");
    expect(walkwayAt(await player.save(), tile), "the path").toBe(walkwayOf([3, 4, 5]));

    const ratio = await on.evaluate(() => window.devicePixelRatio);
    const corner = await player.tileCorner(tile);
    const {tileWidth} = await player.view();
    const x = Math.floor((corner.x + tileWidth / 2) * ratio);
    const pixels = Array.from({length: Math.floor(tileWidth * ratio)},
                              (_, i) => ({x, y: Math.ceil(corner.y * ratio) + i}));
    const read = await samplePixels(on, await player.mapScreenshot(), pixels);
    return read.pixels.map((pixel) => (pixel[0] - GREEN[0]) / (GRAVEL[0] - GREEN[0]));
  };
  const whole = await coverDown(page, 0);
  const second = await page.context().newPage();
  const secondProblems = collectPageProblems(second);
  const eaten = await coverDown(second, 1);
  const middle = Math.floor(whole.length / 2);

  expect([whole[middle], eaten[middle]].map((cover) => Math.abs(cover - 1) < 0.02), "the path's middle, whole")
    .toEqual([true, true]);
  expect(eaten.flatMap((cover, i) => cover > whole[i] + 0.02 ? [i] : []), "pixels the wobble grew the path over")
    .toEqual([]);
  expect(eaten.some((cover, i) => cover < whole[i] - 0.1), "the wobble eats into the path's edge").toBe(true);
  expect([...problems, ...secondProblems]).toEqual([]);
});

test("a walker shows as its dab tinted its colour at the middle of each ninth of its walk in turn", async ({page}) => {
  const problems = collectPageProblems(page);
  // The clock stands still, so the walker stands where it is until the clock moves on
  const start = Date.UTC(2026, 0, 1);
  await page.clock.setFixedTime(start);
  // A walk east along the middle row of ninths of a tile of bare land, from its west ninth
  const tile = {x: SITE[0].left + 3, y: SITE[0].top + 3};
  const player = await startOnTestArt(page, "Walker", tilesIn({left: tile.x - 1, top: tile.y - 1, right: tile.x + 1,
                                                               bottom: tile.y + 1}));
  const walk: [number, number, string] = [NINTHS_PER_SIDE * tile.x, NINTHS_PER_SIDE * tile.y + 1, "EE"];
  await page.evaluate((walks) => window.micropolisTestHook!.addWalks(walks), [walk]);

  // The device pixels at the middles of the walk's ninths, west to east, and the walker's colour
  const ratio = await page.evaluate(() => window.devicePixelRatio);
  const corner = await player.tileCorner(tile);
  const {tileWidth} = await player.view();
  const middles = [0, 1, 2].map((n) => ({x: Math.floor((corner.x + (n + 0.5) / 3 * tileWidth) * ratio),
                                         y: Math.floor((corner.y + 0.5 * tileWidth) * ratio)}));
  const colour = WALKER_COLOURS[walkerLook(tripRoute(walk)).colour].flat.map((c) => c * 255);
  const shown = async () => (await samplePixels(page, await player.mapScreenshot(), middles)).pixels
    .map((pixel) => near(pixel, colour) ? "walker" : near(pixel, GREEN) ? "grass" : pixel.slice(0, 3).join(", "));
  const atStart = await shown();
  await page.clock.setFixedTime(start + 1000 / WALK_SPEED);
  const aNinthOn = await shown();

  expect([atStart, aNinthOn]).toEqual([["walker", "grass", "grass"], ["grass", "walker", "grass"]]);
  expect(problems).toEqual([]);
});
