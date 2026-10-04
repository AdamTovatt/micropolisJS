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

import { expect, Page, test } from "@playwright/test";
import { readFileSync } from "fs";
import { join } from "path";

import { ANIMBIT } from "../src/tileFlags";
import { tileImageOrigin } from "../src/tileSet";
import { collectPageProblems } from "./page";
import { GameSave, Player, startGame, Tile } from "./player";
import { samplePixels } from "./png";
import { rawTileAt, tileAt } from "./savedMap";
import { SEED } from "./stages";

// The map's canvas as the WebGL renderer draws it: the pictures the Screenshot window takes, the backing store on a
// dense screen, and a WebGL context the browser takes away and gives back. The map is the seed's, with no sprites, as
// the driver is held from the start and no stage has run.

const CANVAS = "#MicropolisCanvas";

// images/tiles.png, from the e2e directory the config is in
function tileImage(): Buffer {
  return readFileSync(join(test.info().config.rootDir, "..", "images", "tiles.png"));
}

// Two pixels of each tile, at offsets that tell a tile from its mirror image either way
const OFFSETS = [{x: 3, y: 1}, {x: 12, y: 14}];

// Each whole tile in view that isn't animated, which a picture shows at the frame it was taken, and where its top-left
// corner is drawn in a picture of the canvas at scale picture pixels to the CSS pixel, from (left, top)
async function stillTilesInView(player: Player, save: GameSave, scale: number, left = 0,
                                top = 0): Promise<{tile: Tile, x: number, y: number}[]> {
  const {tileWidth} = await player.view();
  return (await player.wholeTilesInView())
    .filter(({tile}) => (rawTileAt(save, tile) & ANIMBIT) === 0)
    .map(({tile, column, row}) => ({tile, x: scale * (left + column * tileWidth), y: scale * (top + row * tileWidth)}));
}

// Where each tile given draws in a picture, and the pixels of its art there: an OFFSETS pixel of the tile in
// images/tiles.png, drawn at scale picture pixels to its pixel from the tile's top-left corner in the picture. Gives the
// tiles whose picture pixels are not their art's.
async function wrongTiles(page: Page, picture: Buffer | string, save: GameSave,
                          tiles: {tile: Tile, x: number, y: number}[], scale: number): Promise<string[]> {
  const inPicture: {x: number, y: number}[] = [];
  const inArt: {x: number, y: number}[] = [];
  for (const {tile, x, y} of tiles) {
    const origin = tileImageOrigin(tileAt(save, tile));
    for (const offset of OFFSETS) {
      // The middle of the texel's square in the picture
      inPicture.push({x: x + offset.x * scale + Math.floor(scale / 2), y: y + offset.y * scale + Math.floor(scale / 2)});
      inArt.push({x: origin.x + offset.x, y: origin.y + offset.y});
    }
  }

  const shown = await samplePixels(page, picture, inPicture);
  const art = await samplePixels(page, tileImage(), inArt);
  const wrong: string[] = [];
  shown.pixels.forEach((pixel, index) => {
    if (pixel.slice(0, 3).join() !== art.pixels[index].slice(0, 3).join()) {
      const {tile} = tiles[Math.floor(index / OFFSETS.length)];
      wrong.push(`(${tile.x}, ${tile.y}) shows ${pixel.slice(0, 3)}, not ${art.pixels[index].slice(0, 3)}`);
    }
  });

  return wrong;
}

// The picture the Screenshot window links to, of the visible map or the whole of it
async function takePicture(page: Page, area: "visible" | "whole"): Promise<string> {
  await page.click("#screenshotRequest");
  await page.check(area === "visible" ? "#screenshotVisible" : "#screenshotAll");
  await page.click("#screenshotOK");
  const link = (await page.locator("#screenshotLink").getAttribute("href"))!;
  await page.click("#screenshotLinkOK");
  return link;
}

test("the Screenshot window's picture of the whole map draws every tile at 16 pixels, the right way up",
     async ({page}) => {
  const problems = collectPageProblems(page);
  const player = await startGame(page, SEED, "Whole");
  const save = await player.save();

  const picture = await takePicture(page, "whole");

  const tiles: {tile: Tile, x: number, y: number}[] = [];
  for (let y = 0; y < save.map.height; y++) {
    for (let x = 0; x < save.map.width; x++) {
      tiles.push({tile: {x, y}, x: x * 16, y: y * 16});
    }
  }
  const size = await samplePixels(page, picture, []);
  expect([size.width, size.height]).toEqual([save.map.width * 16, save.map.height * 16]);
  const wrong = await wrongTiles(page, picture, save, tiles, 1);
  expect(wrong.slice(0, 10), `${wrong.length} tiles wrong`).toEqual([]);
  expect(problems).toEqual([]);
});

test("the Screenshot window's picture of the visible map shows the view as it is drawn", async ({page}) => {
  const problems = collectPageProblems(page);
  const player = await startGame(page, SEED, "Visible");
  const save = await player.save();
  const canvas = await player.canvasBox();

  const picture = await takePicture(page, "visible");

  const size = await samplePixels(page, picture, []);
  expect([size.width, size.height]).toEqual([canvas.width, canvas.height]);
  const wrong = await wrongTiles(page, picture, save, await stillTilesInView(player, save, 1), 1);
  expect(wrong.slice(0, 10), `${wrong.length} tiles wrong`).toEqual([]);
  expect(problems).toEqual([]);
});

test.describe("on a screen of two device pixels to the CSS pixel", () => {
  test.use({deviceScaleFactor: 2});

  test("the map is drawn at two device pixels to the art's, and an outline at two to the CSS pixel",
       async ({page}) => {
    const problems = collectPageProblems(page);
    const player = await startGame(page, SEED, "Dense");
    const save = await player.save();
    const canvas = await player.canvasBox();

    const backing = await page.locator(CANVAS).evaluate((element: HTMLCanvasElement) => [element.width,
                                                                                          element.height]);
    expect(backing).toEqual([canvas.width * 2, canvas.height * 2]);
    expect((await player.view()).tileWidth, "the tile width, in CSS pixels").toBe(16);

    const tiles = await stillTilesInView(player, save, 2, canvas.x, canvas.y);
    const wrong = await wrongTiles(page, await player.mapScreenshot(), save, tiles, 2);
    expect(wrong.slice(0, 10), `${wrong.length} tiles wrong`).toEqual([]);

    // The query tool's cyan outline, 3 CSS pixels wide around the tile under the pointer, on the building site
    const tile = {x: 58, y: 32};
    await player.selectTool("query");
    await player.showTiles([tile]);
    const {originX, originY} = await player.view();
    const left = canvas.x + (tile.x - originX) * 16;
    const top = canvas.y + (tile.y - originY) * 16;
    await page.mouse.move(left + 8, top + 8);
    await player.settle();
    const outline = await samplePixels(page, await page.screenshot(), [
      {x: 2 * left - 3, y: 2 * (top + 8)},
      {x: 2 * (left + 16) + 2, y: 2 * (top + 8)},
      {x: 2 * left + 8, y: 2 * (top + 8)},
    ]);
    const [leftLine, rightLine, inside] = outline.pixels.map((pixel) => pixel.slice(0, 3));
    expect([leftLine, rightLine], "the outline's left and right lines").toEqual([[0, 255, 255], [0, 255, 255]]);
    expect(inside, "the tile inside the outline").not.toEqual([0, 255, 255]);
    expect(problems).toEqual([]);
  });

  test("the pointer finds tiles in CSS pixels", async ({page}) => {
    const problems = collectPageProblems(page);
    const player = await startGame(page, SEED, "Dense");

    const tile = {x: 47, y: 30};
    await player.selectTool("road");
    await player.showTiles([tile]);
    await player.clickTile(tile);
    expect(tileAt(await player.save(), tile), "the road clicked on a dense screen").not.toBe(0);
    expect(problems).toEqual([]);
  });
});

test("a WebGL context the browser loses is drawn again once it is restored", async ({page}) => {
  const problems = collectPageProblems(page);
  const player = await startGame(page, SEED, "Restored");
  const before = await player.mapScreenshot();

  // The extension is taken while the context is there, and kept for the restore
  await page.locator(CANVAS).evaluate((canvas: HTMLCanvasElement) => {
    (window as unknown as {loser: WEBGL_lose_context}).loser =
      canvas.getContext("webgl2")!.getExtension("WEBGL_lose_context")!;
  });
  const call = (action: "loseContext" | "restoreContext") => page.evaluate(
    (name) => (window as unknown as {loser: WEBGL_lose_context}).loser[name](), action);
  const isLost = () => page.locator(CANVAS).evaluate((canvas: HTMLCanvasElement) =>
    canvas.getContext("webgl2")!.isContextLost());

  await call("loseContext");
  await expect.poll(isLost).toBe(true);
  // Frames go on while the context is lost, drawing nothing rather than failing
  await player.settle();
  await call("restoreContext");
  await expect.poll(isLost).toBe(false);

  expect((await player.mapScreenshot()).equals(before), "the map drawn after the restore, as before the loss")
    .toBe(true);
  expect(problems).toEqual([]);
});
