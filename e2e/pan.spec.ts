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
import { Player, mapCursor as cursor, startGame } from "./player";
import { tileAt, tilesIn } from "./savedMap";
import { SEED } from "./stages";

// Panning the map by holding Space and dragging: the point of the map under the pointer stays under it, so the view's
// origin may lie between tiles, and while Space holds the map no tool applies

const server = serverForTests("manual");

// The site the specs pan over, clear land on the seed's map near the middle
const ROW = {left: 50, top: 30, right: 54, bottom: 30};

// The point of the map under a point of the page, in tiles, from the view the hook reports
async function mapPointUnder(player: Player, point: {x: number, y: number}): Promise<{x: number, y: number}> {
  const view = await player.view();
  const canvas = await player.canvasBox();
  return {x: view.originX + (point.x - canvas.x) / view.tileWidth,
          y: view.originY + (point.y - canvas.y) / view.tileWidth};
}

// The middle of a tile on the page
async function tileMiddle(player: Player, tile: {x: number, y: number}): Promise<{x: number, y: number}> {
  const corner = await player.tileCorner(tile);
  const {tileWidth} = await player.view();
  return {x: corner.x + tileWidth / 2, y: corner.y + tileWidth / 2};
}

test("Space and a drag pan the map under the pointer, between tiles, with the hand cursors, and apply no tool",
     async ({page}) => {
  const problems = collectPageProblems(page);
  const player = await startGame(server(), page, SEED, "Pan");
  await player.selectTool("road");
  await player.showTiles(tilesIn(ROW));
  const from = await tileMiddle(player, {x: ROW.left, y: ROW.top});
  await page.mouse.move(from.x, from.y);
  await player.expectHoverOn({x: ROW.left, y: ROW.top}, "the hover box before Space");
  const commands = await player.commandsApplied();
  // The tiles around the pan, as they were
  const around = tilesIn({left: ROW.left - 4, top: ROW.top - 2, right: ROW.left + 4, bottom: ROW.top + 2});
  const saved = await player.save();
  const before = await player.view();
  const grabbed = await mapPointUnder(player, from);
  expect(await cursor(page), "the cursor of the road tool").toBe("pointer");

  await page.keyboard.down("Space");
  await expect.poll(() => cursor(page), "the cursor while Space is held").toBe("grab");
  await player.expectHoverOn(null, "the hover box while Space is held");

  await page.mouse.down();
  expect(await cursor(page), "the cursor while the map is held").toBe("grabbing");
  // Left by 37 pixels and up by 21: two tiles and five sixteenths, and a tile and five sixteenths
  const to = {x: from.x - 37, y: from.y - 21};
  await page.mouse.move(to.x, to.y, {steps: 5});
  const panned = await player.view();
  expect(panned.originX, "the origin across, between tiles").toBeCloseTo(before.originX + 37 / 16, 9);
  expect(panned.originY, "the origin down, between tiles").toBeCloseTo(before.originY + 21 / 16, 9);
  const under = await mapPointUnder(player, to);
  expect(under.x, "the point of the map under the pointer across").toBeCloseTo(grabbed.x, 9);
  expect(under.y, "the point of the map under the pointer down").toBeCloseTo(grabbed.y, 9);
  expect(await player.tileUnder(to), "the tile under the pointer").toEqual({x: ROW.left, y: ROW.top});

  // While the map is held, the wheel doesn't zoom and the arrow keys don't scroll
  // The key held a tenth of a second, which would glide the view a few tiles: a tap would move it a fiftieth of one
  await page.mouse.wheel(0, -300);
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(100);
  await page.keyboard.up("ArrowRight");
  await player.settle();
  expect(await player.view(), "the view after the wheel and an arrow key, the map held").toEqual(panned);

  await page.mouse.up();
  expect(await cursor(page), "the cursor once the button is up, Space still held").toBe("grab");
  await page.keyboard.up("Space");
  await expect.poll(() => cursor(page), "the cursor once Space is up").toBe("pointer");
  await player.expectHoverOn({x: ROW.left, y: ROW.top}, "the hover box once Space is up");

  await player.applyInput();
  expect(await player.commandsApplied(), "the commands applied").toBe(commands);
  const after = await player.save();
  expect(around.map((tile) => tileAt(after, tile)), "the tiles around the pan")
    .toEqual(around.map((tile) => tileAt(saved, tile)));
  expect(problems).toEqual([]);
});

test("Space after a click on a panel's button pans, and presses the button no more", async ({page}) => {
  const problems = collectPageProblems(page);
  const player = await startGame(server(), page, SEED, "Button");
  const toggle = page.locator("[data-panel=\"map\"] .foldButton");
  await toggle.click();
  await expect(page.locator("#minimapFrame"), "the minimap after its button's click").toBeHidden();
  await expect(toggle, "the minimap's button, with the focus").toBeFocused();
  await toggle.evaluate((button) => {
    button.dataset.clicks = "0";
    button.addEventListener("click", () => {
      button.dataset.clicks = String(Number(button.dataset.clicks) + 1);
    });
  });
  const before = await player.view();
  const canvas = await player.canvasBox();
  const middle = {x: canvas.x + canvas.width / 2, y: canvas.y + canvas.height / 2};

  await page.mouse.move(middle.x, middle.y);
  await page.keyboard.down("Space");
  await page.mouse.down();
  await page.mouse.move(middle.x + 48, middle.y + 32, {steps: 3});
  await page.mouse.up();
  await page.keyboard.up("Space");
  await player.settle();

  expect(await player.view(), "the view after the pan").toEqual({...before, originX: before.originX - 3,
                                                                  originY: before.originY - 2});
  await expect(toggle, "the clicks on the button after Space")
    .toHaveAttribute("data-clicks", "0");
  await expect(page.locator("#minimapFrame"), "the minimap after Space").toBeHidden();
  expect(problems).toEqual([]);
});

test("Space let go mid-drag ends the pan where it is, and the press's release applies no tool", async ({page}) => {
  const problems = collectPageProblems(page);
  const player = await startGame(server(), page, SEED, "Let go");
  await player.selectTool("park");
  await player.showTiles(tilesIn(ROW));
  const from = await tileMiddle(player, {x: ROW.left, y: ROW.top});
  await page.mouse.move(from.x, from.y);
  const commands = await player.commandsApplied();

  await page.keyboard.down("Space");
  await page.mouse.down();
  await page.mouse.move(from.x + 20, from.y, {steps: 2});
  await page.keyboard.up("Space");
  const stopped = await player.view();
  await expect.poll(() => cursor(page), "the park tool's cursor once Space is up").toBe("pointer");
  await page.mouse.move(from.x + 60, from.y + 30, {steps: 3});
  expect(await player.view(), "the view after the pointer moves on").toEqual(stopped);
  await page.mouse.up();

  await player.applyInput();
  expect(await player.commandsApplied(), "the commands applied").toBe(commands);
  expect(problems).toEqual([]);
});

test("Space pressed during a tool's drag waits until the button comes up", async ({page}) => {
  const problems = collectPageProblems(page);
  const player = await startGame(server(), page, SEED, "Mid-drag");
  await player.selectTool("road");
  await player.showTiles(tilesIn(ROW));
  const view = await player.view();
  const left = await tileMiddle(player, {x: ROW.left, y: ROW.top});
  const right = await tileMiddle(player, {x: ROW.right, y: ROW.top});

  await page.mouse.move(left.x, left.y);
  await page.mouse.down();
  await page.keyboard.down("Space");
  await page.mouse.move(right.x, right.y, {steps: ROW.right - ROW.left});
  expect(await cursor(page), "the road tool's cursor during its drag").toBe("pointer");
  await page.mouse.up();
  await expect.poll(() => cursor(page), "the cursor once the button is up, Space held").toBe("grab");
  await page.keyboard.up("Space");

  await player.applyInput();
  expect(await player.view(), "the view after the drag").toEqual(view);
  const save = await player.save();
  const roads = tilesIn({left: ROW.left - 3, top: ROW.top, right: ROW.right + 3, bottom: ROW.top})
    .filter((tile) => tileAt(save, tile) !== 0).map((tile) => tile.x);
  expect(roads, "the columns built on along the row").toEqual(tilesIn(ROW).map((tile) => tile.x));
  expect(problems).toEqual([]);
});

test("Space pressed during a tool's click waits until the button comes up, and the click builds", async ({page}) => {
  const problems = collectPageProblems(page);
  const player = await startGame(server(), page, SEED, "Mid-click");
  await player.selectTool("park");
  await player.showTiles(tilesIn(ROW));
  const view = await player.view();
  const park = await tileMiddle(player, {x: ROW.left, y: ROW.top});
  const commands = await player.commandsApplied();

  await page.mouse.move(park.x, park.y);
  await page.mouse.down();
  await page.keyboard.down("Space");
  await player.settle();
  expect(await cursor(page), "the park tool's cursor while its button is down").toBe("pointer");
  await player.expectHoverOn({x: ROW.left, y: ROW.top}, "the hover box while the button is down");
  await page.mouse.up();
  await expect.poll(() => cursor(page), "the cursor once the button is up, Space held").toBe("grab");
  await page.keyboard.up("Space");

  await player.applyInput();
  expect(await player.view(), "the view after the click").toEqual(view);
  expect(await player.commandsApplied(), "the commands applied").toBe(commands + 1);
  expect(tileAt(await player.save(), {x: ROW.left, y: ROW.top}), "the park's tile").not.toBe(0);
  expect(problems).toEqual([]);
});

// Fields of the page's own, outside any window, which would hold the input itself, each with the property Space sets
// there and its value after: the text field and the editable text take a space, the check box is checked, and the
// select opens its list, its value as it was
const FIELDS: [string, string, string, string][] = [
  ["a text field", `<input id="field" type="text">`, "value", " "],
  ["a check box", `<input id="field" type="checkbox">`, "checked", "true"],
  ["a select", `<select id="field"><option>One</option><option>Two</option></select>`, "value", "One"],
  ["editable text", `<div id="field" contenteditable="true" style="width: 50px; height: 20px"></div>`, "textContent",
   " "],
];

for (const [name, html, property, typed] of FIELDS) {
  test(`Space with ${name} focused is the field's, and pans nothing`, async ({page}) => {
    const problems = collectPageProblems(page);
    const player = await startGame(server(), page, SEED, "Typing");
    const view = await player.view();
    const plain = await cursor(page);
    await page.evaluate((markup) => document.body.insertAdjacentHTML("beforeend", markup), html);
    await page.focus("#field");
    const read = () => page.locator("#field")
      .evaluate((field, key) => String((field as unknown as Record<string, unknown>)[key]), property);

    await page.keyboard.down("Space");
    await player.settle();
    expect(await cursor(page), "the cursor while Space is down").toBe(plain);
    await page.keyboard.up("Space");
    expect(await player.view(), "the view after Space").toEqual(view);
    expect((await read()).replace(" ", " "), "the field after Space").toBe(typed);

    // Space down in the field, a drag across the map after it moves nothing
    await page.focus("#field");
    await page.keyboard.down("Space");
    const canvas = await player.canvasBox();
    const middle = {x: canvas.x + canvas.width / 2, y: canvas.y + canvas.height / 2};
    await page.mouse.move(middle.x, middle.y);
    await page.mouse.down();
    await page.mouse.move(middle.x - 50, middle.y - 50, {steps: 3});
    await page.mouse.up();
    await page.keyboard.up("Space");
    expect(await player.view(), "the view after Space in the field and a drag").toEqual(view);
    expect(problems).toEqual([]);
  });
}

test("a press on the map takes the focus from a field, and Space pans after it", async ({page}) => {
  const problems = collectPageProblems(page);
  const player = await startGame(server(), page, SEED, "Focus");
  await player.selectTool("road");
  await player.showTiles(tilesIn(ROW));
  await page.evaluate(() => document.body.insertAdjacentHTML("beforeend",
                                                             `<select id="field"><option>One</option></select>`));
  await page.focus("#field");
  const road = await tileMiddle(player, {x: ROW.left, y: ROW.top});

  // A road's drag, whose press keeps the page from moving the focus itself
  await page.mouse.click(road.x, road.y);
  await player.applyInput();
  expect(await page.evaluate(() => document.activeElement === document.body), "the page's body has the focus")
    .toBe(true);
  const before = await player.view();

  await page.keyboard.down("Space");
  await page.mouse.down();
  await page.mouse.move(road.x + 32, road.y, {steps: 2});
  await page.mouse.up();
  await page.keyboard.up("Space");
  expect(await player.view(), "the view after the pan").toEqual({...before, originX: before.originX - 2});
  expect(problems).toEqual([]);
});
