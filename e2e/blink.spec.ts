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

import { expect, Page, test } from "@playwright/test";

import { BLINK_PERIOD } from "../src/animationManager";
import { POWERBIT, ZONEBIT } from "../src/tileFlags";
import { ZOOM_STEPS } from "../src/viewPosition";
import { serverForTests } from "./gameServer";
import { collectPageProblems } from "./page";
import { Player, startGame, Tile, Tool } from "./player";
import { samplePixels } from "./png";
import { rawTileAt } from "./savedMap";
import { SEED } from "./stages";

// An unpowered zone or service building blinks the lightning bolt in place of its centre tile, drawn from the game's
// own art. Every building blinks the same bolt, however dense its own shadow lies under its roof: the bolt over a
// police station, a fire station or a stadium shows what it shows over a residential zone. The page's clock stands
// still, and AnimationManager's blink turns on at the first frame drawn and turns over only once BLINK_PERIOD has
// passed on that clock, so the blink stays on until the test moves the clock on.

interface Building {
  tool: Tool;
  // The tile the tool is clicked on, which is the building's centre
  tile: Tile;
}

// The buildings, all on the building site, with clear land between them. Nothing powers them: the city has no power
// plant.
const ZONE: Building = {tool: "residential", tile: {x: 48, y: 32}};
const SERVICES: Building[] = [
  {tool: "police", tile: {x: 52, y: 32}},
  {tool: "fire", tile: {x: 56, y: 32}},
  {tool: "stadium", tile: {x: 60, y: 32}},
];

const START = Date.parse("2026-01-01T00:00:00Z");

const server = serverForTests("manual");

// Every pixel of a tile on the screen, row by row, as RGB
async function tilePixels(page: Page, player: Player, tile: Tile): Promise<number[][]> {
  await player.showTiles([tile]);
  const corner = await player.tileCorner(tile);
  const width = await player.tileWidth();
  const points: {x: number, y: number}[] = [];
  for (let y = 0; y < width; y++) {
    for (let x = 0; x < width; x++) {
      points.push({x: corner.x + x, y: corner.y + y});
    }
  }
  const shown = await samplePixels(page, await player.mapScreenshot(), points);
  return shown.pixels.map((pixel) => pixel.slice(0, 3));
}

// How many of two tiles' pixels differ
function differing(a: number[][], b: number[][]): number {
  return a.filter((pixel, index) => pixel.some((channel, c) => channel !== b[index][c])).length;
}

test("an unpowered service building blinks the lightning bolt an unpowered zone does", async ({page}) => {
  const problems = collectPageProblems(page);
  await page.clock.setFixedTime(START);
  const player = await startGame(server(), page, SEED, "Blink");

  for (const {tool, tile} of [ZONE, ...SERVICES]) {
    await player.selectTool(tool);
    await player.clickTile(tile);
  }
  const save = await player.save();
  for (const {tool, tile} of [ZONE, ...SERVICES]) {
    const raw = rawTileAt(save, tile);
    expect({zone: (raw & ZONEBIT) !== 0, powered: (raw & POWERBIT) !== 0}, `the ${tool}'s centre`)
      .toEqual({zone: true, powered: false});
  }

  // The zone's centre is blinking: it shows another picture once the clock passes the blink period, and the first
  // again once it passes another
  const on = await tilePixels(page, player, ZONE.tile);
  await page.clock.setFixedTime(START + BLINK_PERIOD + 1);
  expect(differing(await tilePixels(page, player, ZONE.tile), on), "the zone's centre with the blink off")
    .toBeGreaterThan(0);
  await page.clock.setFixedTime(START + 2 * (BLINK_PERIOD + 1));
  expect(differing(await tilePixels(page, player, ZONE.tile), on), "the zone's centre with the blink on again")
    .toBe(0);

  // ZOOM_STEPS runs from the zoom the game opens at to the closest
  for (let index = 0; index < ZOOM_STEPS.length; index++) {
    const zoom = ZOOM_STEPS[index];
    if (index > 0) {
      await player.zoomWithKeys(1);
    }
    expect(await player.tileWidth()).toBe(zoom);

    const zone = await tilePixels(page, player, ZONE.tile);
    for (const {tool, tile} of SERVICES) {
      const shown = await tilePixels(page, player, tile);
      expect(differing(shown, zone), `the pixels of the ${tool}'s bolt unlike the zone's, of ${shown.length}, ` +
                                     `at ${zoom} px a tile`).toBe(0);
    }
  }
  expect(problems).toEqual([]);
});
