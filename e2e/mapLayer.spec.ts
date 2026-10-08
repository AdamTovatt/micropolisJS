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

import { CAR_TILES_PER_SECOND } from "../src/roadTraffic";
import type { Trip } from "../src/protocol";
import { DIRT } from "../src/tileValues";
import { serverForTests } from "./gameServer";
import { collectPageProblems } from "./page";
import { startGame } from "./player";
import type { Tile } from "./player";
import { TORNADO_SPRITE } from "./ruleNumbers";
import { inBounds, tileAt, tilesAround } from "./savedMap";
import { SEED } from "./stages";

// The map is kept in a layer of its own, drawn again only where tiles changed, and each frame draws the cars and the
// sprites over it. A frame drawn that way, after tiles changed under cars and a sprite, and again once cars drove
// across them, must show what the map drawn whole shows, at the same state.

const START = Date.parse("2026-01-01T00:00:00Z");

// How far from the tornado's tile the road is built, in tiles, and how many tiles it runs
const SEARCH = 6;
const ROAD_TILES = 5;

const server = serverForTests("manual");

// The first run of dirt along a row near the tile, which a road may be built on, as long as the road
function dirtRunNear(save: Parameters<typeof tileAt>[0], near: Tile): Tile[] {
  for (const start of tilesAround(near, SEARCH)) {
    const run = Array.from({length: ROAD_TILES}, (_, i) => ({x: start.x + i, y: start.y}));
    if (run.every((tile) => inBounds(save, tile) && tileAt(save, tile) === DIRT)) {
      return run;
    }
  }

  throw new Error(`No ${ROAD_TILES} tiles of dirt in a row within ${SEARCH} of (${near.x}, ${near.y})`);
}

// A trip from the tile driving east the tiles given
function east(from: Tile, tiles: number): Trip {
  return [from.x, from.y, "E".repeat(tiles)];
}

// A trip from the tile driving a tile east and back, again and again, for longer than the cars are read driving, so its
// car is still on the map, near the tile, in every frame read
function toAndFro(from: Tile): Trip {
  return [from.x, from.y, "EW".repeat(ROAD_TILES)];
}

async function addCars(page: Page, trips: Trip[]): Promise<void> {
  await page.evaluate((added) => window.micropolisTestHook!.addCars(added), trips);
}

async function drawnInPartAsWhole(page: Page): Promise<void> {
  const problems = collectPageProblems(page);
  // The clock stands still, so the cars stand where they are until it moves on
  await page.clock.setFixedTime(START);
  const player = await startGame(server(), page, SEED, "Layered");

  // The disaster's command places the tornado; the city takes no step, so it stays where it was placed
  await player.triggerDisaster("Tornado");
  await player.dismissNotification();
  const save = await player.save();
  const tornadoes = (save.sprites as {list: {type: number, x: number, y: number}[]}).list
    .filter((sprite) => sprite.type === TORNADO_SPRITE);
  expect(tornadoes.length, "the tornadoes on the map").toBe(1);
  const tornado = {x: Math.floor(tornadoes[0].x / 16), y: Math.floor(tornadoes[0].y / 16)};
  const road = dirtRunNear(save, tornado);
  await player.showTiles([tornado, ...road, ...tilesAround(tornado, 2)]);

  // A car on the road's first tile, which will drive along it, and others over the road and the tornado, standing
  // until the clock moves on
  const first = road[0];
  await addCars(page, [east(first, ROAD_TILES - 1), toAndFro({x: first.x + 2, y: first.y}), toAndFro(tornado),
                       toAndFro({x: tornado.x - 1, y: tornado.y + 1})]);
  const before = await player.mapScreenshot();
  // Sizing the canvas draws all of it again
  const drawnWhole = async () => {
    await page.evaluate(() => window.dispatchEvent(new Event("resize")));
    return player.mapScreenshot();
  };

  // The road changes the tiles under the standing cars, and the shadows around them: the layer is drawn again there
  await player.selectTool("road");
  await player.dragTiles(first, road[road.length - 1]);
  const built = await player.mapScreenshot();
  const builtWhole = await drawnWhole();

  // The first car drives across the road's tiles, and the others drive to and fro over the road and the tornado
  await page.clock.setFixedTime(START + (ROAD_TILES - 2) / CAR_TILES_PER_SECOND * 1000);
  const inPart = await player.mapScreenshot();
  const whole = await drawnWhole();

  expect(built.equals(builtWhole), "the map drawn again in part under the cars and the sprite, as drawn whole")
    .toBe(true);
  expect(inPart.equals(whole), "the map drawn from its layer, with the cars and the sprite over it, as drawn whole")
    .toBe(true);
  // Neither frame read was the one before it
  expect(built.equals(before), "the map with the road, unlike without it").toBe(false);
  expect(inPart.equals(built), "the map with the cars driven on, unlike before they drove").toBe(false);
  expect(problems).toEqual([]);
}

const DRAWN = "the cars and a sprite drawn over the map's layer after tiles changed under them show what the map " +
              "drawn whole does";

test(DRAWN, async ({page}) => drawnInPartAsWhole(page));

// Where a tile's edges fall between device pixels, as at a browser zoom of 110%
test.describe("on a screen of 1.1 device pixels to the CSS pixel", () => {
  test.use({deviceScaleFactor: 1.1});

  test(DRAWN, async ({page}) => drawnInPartAsWhole(page));
});
