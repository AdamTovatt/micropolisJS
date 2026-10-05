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

import { rampColour } from "../src/overlayRenderer";
import type { OverlayAnswer } from "../src/protocol";
import { serverForTests } from "./gameServer";
import { collectPageProblems } from "./page";
import { startGame } from "./player";
import { samplePixels } from "./png";
import { savedBlockMapAt, tilesIn } from "./savedMap";
import { SEED } from "./stages";
import { everyTile, serveTestArt, solidAtlas } from "./testArt";

// The map overlay tints each tile over the map. A test atlas draws every tile id white, so each tile shows its tint
// laid over white, which the land value the save holds for the tile and the overlay's own colour ramp decide: a
// tint's colour multiplied by its alpha, and white by what the alpha leaves.

// The steps the city takes for the land value scan to have run, at the city's speed, medium
const STEPS = 1000;

// The land value layer's answer, as far as its colour ramp reads it: its range, from Queries in the C# rules
const LAND_VALUE: OverlayAnswer = {type: "overlay", layer: "landValue", blockSize: 2, width: 0, height: 0, low: 0,
                                   high: 250, values: []};

const server = serverForTests("manual");

test("the overlay tints each tile by its value over the map, and goes again with the overlay", async ({page}) => {
  const problems = collectPageProblems(page);
  const ground = {atlas: "white", x: 0, y: 0, width: 16, height: 16};
  await serveTestArt(page, {version: 1, atlases: {white: "white.png"}, tiles: everyTile({ground}), sprites: {}},
                     {"white.png": solidAtlas([255, 255, 255, 255])});
  const player = await startGame(server(), page, SEED, "Overlay");

  // A road along the building site's top row: the scan values developed land only
  const road = {left: 47, top: 30, right: 69, bottom: 30};
  await player.selectTool("road");
  await player.showTiles(tilesIn(road));
  await player.dragTiles({x: road.left, y: road.top}, {x: road.right, y: road.top});
  await player.advance(STEPS);
  await player.dismissNotification();
  const save = await player.save();
  const before = await player.mapScreenshot();

  await page.selectOption("#overlayPanelSelect", "landValue");
  await expect(page.locator(".overlayLegend")).toBeVisible();
  const tinted = await player.mapScreenshot();

  // The middle pixel of each whole tile in view
  const canvas = await player.canvasBox();
  const {tileWidth} = await player.view();
  const tiles = await player.wholeTilesInView();
  const shown = await samplePixels(page, tinted, tiles.map(({column, row}) => ({
    x: Math.floor(canvas.x + (column + 0.5) * tileWidth), y: Math.floor(canvas.y + (row + 0.5) * tileWidth),
  })));

  const wrong: string[] = [];
  let tintedTiles = 0;
  tiles.forEach(({tile}, index) => {
    const value = savedBlockMapAt(save, "landValueMap", LAND_VALUE.blockSize, tile);
    const tint = rampColour(LAND_VALUE, value);
    const expected = tint === null ? [255, 255, 255] :
      [tint.r, tint.g, tint.b].map((channel) => Math.round(channel * tint.a + 255 * (1 - tint.a)));
    const colour = shown.pixels[index].slice(0, 3);
    if (tint !== null) {
      tintedTiles++;
    }
    if (colour.some((channel, i) => Math.abs(channel - expected[i]) > 1)) {
      wrong.push(`(${tile.x}, ${tile.y}) of land value ${value} is ${colour.join(", ")}, not ${expected.join(", ")}`);
    }
  });
  expect(wrong.slice(0, 10), `${wrong.length} tiles wrong`).toEqual([]);
  expect(tintedTiles, "the tiles in view the overlay tints").toBeGreaterThan(0);

  await page.selectOption("#overlayPanelSelect", "");
  await expect(page.locator(".overlayLegend")).toBeHidden();
  expect((await player.mapScreenshot()).equals(before), "the map with the overlay gone, as before it showed").toBe(true);
  expect(problems).toEqual([]);
});
