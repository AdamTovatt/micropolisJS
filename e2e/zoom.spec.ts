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

import { serverForTests } from "./gameServer";
import { collectPageProblems } from "./page";
import { startGame } from "./player";
import { tileAt, tilesIn } from "./savedMap";
import { SEED } from "./stages";

// Zooming where the playthrough's stage doesn't: with the pointer off the map, while a window holds the input, and
// in the middle of a drag

const server = serverForTests("manual");

test("a zoom key with the pointer off the map zooms around the middle of the view", async ({page}) => {
  const problems = collectPageProblems(page);
  const player = await startGame(server(), page, SEED, "Middle");
  const canvas = await player.canvasBox();
  // Over a tool's button, off the map's canvas
  const button = (await page.locator("#roadButton").boundingBox())!;
  await page.mouse.move(button.x + 2, button.y + 2);
  const before = await player.view();

  await player.zoomWithKeys(1);

  // The point of the map under the middle of the canvas at 16 pixels a tile is under it at 32
  const middle = {x: Math.floor(canvas.width / 2), y: Math.floor(canvas.height / 2)};
  const after = await player.view();
  expect(after.originX + middle.x / 32).toBeCloseTo(before.originX + middle.x / 16, 9);
  expect(after.originY + middle.y / 32).toBeCloseTo(before.originY + middle.y / 16, 9);
  expect(problems).toEqual([]);
});

test("a window holding the keyboard and mouse holds back the zoom keys", async ({page}) => {
  const problems = collectPageProblems(page);
  const player = await startGame(server(), page, SEED, "Held");
  await page.click("#budgetRequest");
  await page.locator("#budget").waitFor();

  await page.keyboard.press("+");
  // The page has handled the key once the next frames have run
  await player.settle();

  expect((await player.view()).tileWidth).toBe(16);
  await page.click("#budgetCancel");
  expect(problems).toEqual([]);
});

test("a zoom in the middle of a drag is held back, and the drag lays only the tiles it reached", async ({page}) => {
  const problems = collectPageProblems(page);
  const player = await startGame(server(), page, SEED, "Dragged");
  const row = {left: 50, top: 30, right: 54, bottom: 30};
  await player.selectTool("road");
  await player.showTiles(tilesIn(row));
  const {originX, originY} = await player.view();
  const canvas = await player.canvasBox();
  const at = (x: number) => ({x: canvas.x + (x - originX) * 16 + 8, y: canvas.y + (row.top - originY) * 16 + 8});

  await page.mouse.move(at(row.left).x, at(row.left).y);
  await page.mouse.down();
  await page.mouse.move(at(row.right).x, at(row.right).y, {steps: row.right - row.left});
  await page.mouse.wheel(0, -300);
  await page.keyboard.press("+");
  await page.mouse.up();
  await player.applyInput();

  expect((await player.view()).tileWidth, "the zoom after the drag").toBe(16);
  const save = await player.save();
  const roads = tilesIn({left: row.left - 3, top: row.top, right: row.right + 3, bottom: row.top})
    .filter((tile) => tileAt(save, tile) !== 0).map((tile) => tile.x);
  expect(roads, "the columns built on along the row").toEqual([50, 51, 52, 53, 54]);
  expect(problems).toEqual([]);
});
