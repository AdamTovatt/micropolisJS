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
import { join } from "path";

import { Text } from "../src/text";
import { serverForTests } from "./gameServer";
import { collectPageProblems } from "./page";
import { Player, TESTER } from "./player";
import { samplePixels } from "./png";
import { savedBlockMapAt, tilesIn } from "./savedMap";

// The Rail load overlay over a line its rides load: the sample save of version 14 is the commuters fixture after its
// run, whose rides between two districts load the line along row 15, from its station at (25, 15) to the one at
// (44, 15), and nothing else.

const server = serverForTests("manual");

const LINE = {left: 25, top: 15, right: 44, bottom: 15};

const START = Date.parse("2026-01-01T00:00:00Z");

test("the Rail load overlay tints the tiles a line's rides load, and its legend spans their loads", async ({page}) => {
  const player = await Player.onServer(server(), page, TESTER);
  const problems = collectPageProblems(page);
  // The clock stands still, so animated tiles show the same frame before the overlay and with it
  await page.clock.setFixedTime(START);
  await player.open();
  await player.loadSaveFile(join(test.info().config.rootDir, "..", "conformance", "saveVersions", "version14.json"));
  await player.waitForGame();
  const save = await player.save();
  const load = (tile: {x: number, y: number}) => savedBlockMapAt(save, "railLoadMap", 1, tile);
  const onLine = tilesIn(LINE).map(load);
  expect(onLine.every((value) => value > 0), `the line's loads ${onLine}`).toBe(true);

  await player.showTiles(tilesIn(LINE));
  await player.dismissNotification();
  const before = await player.mapScreenshot();
  await page.selectOption("#overlayPanelSelect", "railLoad");
  const {name, low, high} = Text.overlays.layers.railLoad;
  await expect(page.locator(".overlayLegendTitle")).toHaveText(name);
  await expect(page.locator(".overlayLegendEnds"))
    .toHaveText(Text.overlays.end(low, Math.min(...onLine)) + Text.overlays.end(high, Math.max(...onLine)));
  const tinted = await player.mapScreenshot();

  // The middle pixel of each whole tile in view, before and with the overlay: a tile is tinted where it has a load,
  // and left clear where it has none
  const tiles = await player.tileMiddlesInView();
  const points = tiles.map(({middle}) => middle);
  const [clear, shown] = [await samplePixels(page, before, points), await samplePixels(page, tinted, points)];
  const wrong = tiles.flatMap(({tile}, index) => {
    const changed = shown.pixels[index].some((channel, i) => channel !== clear.pixels[index][i]);
    const shownAs = changed ? "tinted" : "clear";
    return changed === load(tile) > 0 ? [] : [`(${tile.x}, ${tile.y}) of load ${load(tile)} ${shownAs}`];
  });
  expect(wrong.slice(0, 10), `${wrong.length} tiles wrong`).toEqual([]);
  expect(tiles.filter(({tile}) => load(tile) > 0).length, "the loaded tiles in view").toBe(onLine.length);

  await page.selectOption("#overlayPanelSelect", "");
  await expect(page.locator(".overlayLegend")).toBeHidden();
  expect(problems).toEqual([]);
});
