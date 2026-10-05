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
import { Player, heldWithin, startGame } from "./player";
import { SEED } from "./stages";

// Getting around the map: the view stopping at the map's edges, the minimap, Escape, and following news to its place

const server = serverForTests("manual");

// The view's origin, by the hook
async function origin(player: Player): Promise<{x: number, y: number}> {
  const view = await player.view();
  return {x: view.originX, y: view.originY};
}

// The map's size in tiles, from the city's save
async function mapSize(player: Player): Promise<{width: number, height: number}> {
  const {map} = await player.save();
  return {width: map.width, height: map.height};
}

// Holds the key until the view's origin stays where it is for a quarter of a second, about 9 tiles at the scroll speed
async function holdToTheEdge(player: Player, key: string): Promise<void> {
  const page = player.page;
  await page.keyboard.down(key);
  try {
    // The poll reads at once, then at each interval: the first read only sets where the view was
    let last: {x: number, y: number} | null = null;
    await expect.poll(async () => {
      const now = await origin(player);
      const still = last !== null && now.x === last.x && now.y === last.y;
      last = now;
      return still;
    }, {intervals: [250], timeout: 20 * 1000}).toBe(true);
  } finally {
    await page.keyboard.up(key);
  }
}

test("the view stops at the map's edges, with no void beyond them", async ({page}) => {
  const problems = collectPageProblems(page);
  const player = await startGame(server(), page, SEED, "Edges");
  const canvas = await player.canvasBox();
  const map = await mapSize(player);
  const {tileWidth} = await player.view();

  await holdToTheEdge(player, "ArrowLeft");
  await holdToTheEdge(player, "ArrowUp");
  expect(await origin(player), "the origin at the top-left edges").toEqual({x: 0, y: 0});

  await holdToTheEdge(player, "ArrowRight");
  await holdToTheEdge(player, "ArrowDown");
  expect(await origin(player), "the origin at the bottom-right edges")
    .toEqual({x: map.width - canvas.width / tileWidth, y: map.height - canvas.height / tileWidth});
  expect(problems).toEqual([]);
});

test("the minimap moves the view where it is clicked and dragged, and M hides it, as a reload finds it", async ({page}) => {
  const problems = collectPageProblems(page);
  const player = await startGame(server(), page, SEED, "Minimap");
  const minimap = page.locator("#minimapCanvas");
  const box = (await minimap.boundingBox())!;
  const map = await mapSize(player);
  const view = await player.view();
  const {minX, maxX, minY, maxY} = view.limits;
  const canvas = await player.canvasBox();
  const across = Math.floor(canvas.width / view.tileWidth);
  const down = Math.floor(canvas.height / view.tileWidth);
  // The origin that puts the tile in the middle of the view, held within the limits
  const centredOn = (x: number, y: number) => ({x: heldWithin(x - Math.ceil(across / 2), minX, maxX),
                                                y: heldWithin(y - Math.ceil(down / 2), minY, maxY)});

  // A tile's middle on the minimap
  const onMinimap = (x: number, y: number) => ({x: box.x + (x + 0.5) * box.width / map.width,
                                               y: box.y + (y + 0.5) * box.height / map.height});
  const target = onMinimap(70, 60);
  await page.mouse.click(target.x, target.y);
  expect(await origin(player), "the origin after a click on the minimap at (70, 60)").toEqual(centredOn(70, 60));

  // A drag carries the view along, past the minimap's corner to the map's
  await page.mouse.move(target.x, target.y);
  await page.mouse.down();
  await page.mouse.move(box.x - 30, box.y - 30, {steps: 8});
  await page.mouse.up();
  expect(await origin(player), "the origin after a drag past the minimap's top-left corner").toEqual({x: 0, y: 0});

  // The view's rectangle marks the view
  const mark = (await page.locator("#minimapView").boundingBox())!;
  expect(Math.round(mark.x), "the rectangle's left").toBe(Math.round(box.x));
  expect(Math.round(mark.width), "the rectangle's width")
    .toBe(Math.round(canvas.width / view.tileWidth / map.width * box.width));

  await page.keyboard.press("m");
  await expect(page.locator("#minimapFrame")).toBeHidden();
  await player.reloadCity();
  await expect(page.locator("#minimapFrame"), "the minimap after a reload").toBeHidden();

  await page.click("[data-panel=\"map\"] .foldButton");
  await expect(page.locator("#minimapFrame")).toBeVisible();
  expect(problems).toEqual([]);
});

test("a window holding the keyboard leaves M to it", async ({page}) => {
  const problems = collectPageProblems(page);
  const player = await startGame(server(), page, SEED, "Held");
  await page.click("#budgetRequest");
  await page.locator("#budget").waitFor();

  await page.keyboard.press("m");
  await player.settle();

  await expect(page.locator("#minimapFrame")).toBeVisible();
  await page.click("#budgetCancel");
  expect(problems).toEqual([]);
});

test("a tap of Escape closes the window showing, and with none clears the tool", async ({page}) => {
  const problems = collectPageProblems(page);
  const player = await startGame(server(), page, SEED, "Escape");
  await player.selectTool("road");
  await page.click("#budgetRequest");
  await page.locator("#budget").waitFor();

  await page.keyboard.press("Escape");
  await expect(page.locator("#budget"), "the budget window after Escape").toBeHidden();
  await expect(page.locator("#roadButton.selected"), "the tool, which the window's Escape leaves chosen").toHaveCount(1);

  await page.keyboard.press("Escape");
  await expect(page.locator(".toolButton.selected"), "the tool after Escape").toHaveCount(0);
  expect(problems).toEqual([]);
});

test("news with a place says Go there, and Last event goes back there after the bar has moved on", async ({page}) => {
  const problems = collectPageProblems(page);
  const player = await startGame(server(), page, SEED, "Events");
  await expect(page.locator("#lastEvent"), "Last event before any news with a place").toBeHidden();

  await player.triggerDisaster("Fire");
  await expect(page.locator("#notifications .notificationGoThere")).toBeVisible();
  await page.click("#notifications");
  const there = await origin(player);

  // Away to the map's far corner, with the bar gone
  const box = (await page.locator("#minimapCanvas").boundingBox())!;
  await page.mouse.click(box.x + box.width - 1, box.y + box.height - 1);
  await player.dismissNotification();
  expect(await origin(player), "the view moved away").not.toEqual(there);

  await page.click("#lastEvent");
  expect(await origin(player), "the view after Last event").toEqual(there);
  expect(problems).toEqual([]);
});
