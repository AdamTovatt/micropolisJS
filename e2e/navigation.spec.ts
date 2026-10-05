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

import { serverForTests } from "./gameServer";
import { collectPageProblems } from "./page";
import { Player, heldWithin, startGame } from "./player";
import { samplePixels } from "./png";
import { SEED } from "./stages";

// Getting around the map: the view stopping at its limits, the minimap, Escape, and following news to its place

const server = serverForTests("manual");

declare global {
  interface Window {
    // The origins across the glide test samples, while it samples them
    glideSamples?: number[];
  }
}

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
async function holdToTheLimit(player: Player, key: string): Promise<void> {
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

// The origin that puts the middle of the map tile given exactly at the middle of the canvas, as the view's limits put
// an edge tile's, not by whole tiles as centring on a tile does
async function originWithMiddleOn(player: Player, tile: {x: number, y: number}): Promise<{x: number, y: number}> {
  const canvas = await player.canvasBox();
  const {tileWidth} = await player.view();
  return {x: tile.x + 0.5 - canvas.width / tileWidth / 2, y: tile.y + 0.5 - canvas.height / tileWidth / 2};
}

// How many near-white pixels show along the top edge of a rectangle of the page, where it lies within the screen. The
// minimap's view rectangle has a white border, and above the minimap lie its panel, in mintcream, (245, 255, 250), whose
// red is 5 under the cut-off of 250, and the map's void, black: a change to the panel's colour may need a new cut-off.
async function whiteAlongTopEdge(page: Page, rect: {x: number, y: number, width: number}): Promise<number> {
  const points: {x: number, y: number}[] = [];
  const right = Math.min(rect.x + rect.width, page.viewportSize()!.width);
  for (let x = Math.max(0, Math.ceil(rect.x)); x < right; x++) {
    // The border's row, and one either side of it, where the rectangle lies between pixels
    for (let y = Math.floor(rect.y) - 1; y <= Math.floor(rect.y) + 2; y++) {
      points.push({x, y});
    }
  }

  const shown = await samplePixels(page, await page.screenshot(), points);
  return shown.pixels.filter((pixel) => pixel.slice(0, 3).every((channel) => channel >= 250)).length;
}

test("the view stops with the middle of a corner tile at the middle of the screen", async ({page}) => {
  const problems = collectPageProblems(page);
  const player = await startGame(server(), page, SEED, "Edges");
  const canvas = await player.canvasBox();
  const map = await mapSize(player);
  const middle = {x: canvas.x + canvas.width / 2, y: canvas.y + canvas.height / 2};

  await holdToTheLimit(player, "ArrowLeft");
  await holdToTheLimit(player, "ArrowUp");
  expect(await origin(player), "the origin at the top-left limits")
    .toEqual(await originWithMiddleOn(player, {x: 0, y: 0}));
  expect(await player.tileUnder(middle), "the tile at the middle of the screen").toEqual({x: 0, y: 0});

  await holdToTheLimit(player, "ArrowRight");
  await holdToTheLimit(player, "ArrowDown");
  const corner = {x: map.width - 1, y: map.height - 1};
  expect(await origin(player), "the origin at the bottom-right limits")
    .toEqual(await originWithMiddleOn(player, corner));
  expect(await player.tileUnder(middle), "the tile at the middle of the screen").toEqual(corner);
  expect(problems).toEqual([]);
});

test("a scroll key held glides the view between tiles, never stepping by whole tiles", async ({page}) => {
  const problems = collectPageProblems(page);
  const player = await startGame(server(), page, SEED, "Glide");
  const start = await origin(player);
  expect(Number.isInteger(start.x), "the origin the game opens on, on a whole tile").toBe(true);

  // The origin across at each frame the page draws while the key is held, and once it is up
  await page.evaluate(() => {
    const sampled: number[] = [];
    window.glideSamples = sampled;
    const sample = () => {
      if (window.glideSamples === sampled) {
        sampled.push(window.micropolisTestHook!.view().originX);
        requestAnimationFrame(sample);
      }
    };
    requestAnimationFrame(sample);
  });
  await page.keyboard.down("ArrowRight");
  await expect.poll(async () => (await origin(player)).x, "the origin as the key is held")
    .toBeGreaterThan(start.x + 3);
  await page.keyboard.up("ArrowRight");
  await player.settle();
  const samples = await page.evaluate(() => {
    const sampled = window.glideSamples!;
    window.glideSamples = undefined;
    return [...sampled, window.micropolisTestHook!.view().originX];
  });

  // Each distinct origin the view came to after it began moving: by whole tiles every one would be a whole tile, and
  // by the time held almost none is, as a frame or the time the key came up lands on one seldom
  const moved = [...new Set(samples.filter((x) => x !== start.x))];
  const between = moved.filter((x) => !Number.isInteger(x));
  expect(moved.length, "the origins the view came to").toBeGreaterThan(3);
  expect(between.length, `the origins between tiles of ${JSON.stringify(moved)}`)
    .toBeGreaterThan(moved.length / 2);
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
  // The origin that puts the tile in the middle of the view by whole tiles, as the minimap centres it, held within the
  // limits
  const centredByWholeTiles = (x: number, y: number) => ({x: heldWithin(x - Math.ceil(across / 2), minX, maxX),
                                                y: heldWithin(y - Math.ceil(down / 2), minY, maxY)});

  // A tile's middle on the minimap
  const onMinimap = (x: number, y: number) => ({x: box.x + (x + 0.5) * box.width / map.width,
                                               y: box.y + (y + 0.5) * box.height / map.height});
  const target = onMinimap(70, 60);
  await page.mouse.click(target.x, target.y);
  expect(await origin(player), "the origin after a click on the minimap at (70, 60)").toEqual(centredByWholeTiles(70, 60));

  // A drag carries the view along, past the minimap's corner to the map's, whose middle comes to the screen's
  await page.mouse.move(target.x, target.y);
  await page.mouse.down();
  await page.mouse.move(box.x - 30, box.y - 30, {steps: 8});
  await page.mouse.up();
  expect(await origin(player), "the origin after a drag past the minimap's top-left corner")
    .toEqual(await originWithMiddleOn(player, {x: 0, y: 0}));

  // The view's rectangle marks the whole view, its middle on the corner tile's, reaching past the minimap's corner
  const mark = (await page.locator("#minimapView").boundingBox())!;
  const tileOnMinimap = box.width / map.width;
  expect(mark.x + mark.width / 2, "the rectangle's middle across").toBeCloseTo(box.x + tileOnMinimap / 2, 1);
  expect(mark.y + mark.height / 2, "the rectangle's middle down").toBeCloseTo(box.y + tileOnMinimap / 2, 1);
  expect(Math.round(mark.width), "the rectangle's width")
    .toBe(Math.round(canvas.width / view.tileWidth / map.width * box.width));

  // The minimap's frame clips the rectangle: none of its top edge, wholly above the minimap, shows
  expect(mark.y, "the rectangle's top, above the minimap's").toBeLessThan(box.y - 5);
  expect(await whiteAlongTopEdge(page, mark), "white pixels along the rectangle's top edge, above the minimap")
    .toBe(0);

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
