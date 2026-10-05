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

import { Page, expect, test } from "@playwright/test";

import { SPRITE_SHEET } from "../src/renderManifest";
import { PREVIEW_TILE_SIZE, SplashCanvas } from "../src/splashCanvas";
import { WATER_HIGH, WATER_LOW, WOODS_HIGH, WOODS_LOW } from "../src/tileValues";
import { serverForTests } from "./gameServer";
import { collectPageProblems, contextLoss, isContextLost } from "./page";
import { Player, startGame, TESTER } from "./player";
import { TORNADO_SPRITE } from "./ruleNumbers";
import { tileAt } from "./savedMap";
import { SEED } from "./stages";
import { everyTile, serveTestArt, solidAtlas } from "./testArt";

// The monster TV and the splash screen's map preview draw from the map's art, with the map's renderer, at
// devicePixelRatio pixels to the CSS pixel. A test atlas draws water blue, woods green and every other tile id white,
// and every frame of every sprite red, so each pixel of a view says what was drawn there.

const TV_CANVAS = "#tvCanvas";
const PREVIEW_CANVAS = "#SplashCanvas";

const TORNADO_SIDE = SPRITE_SHEET[TORNADO_SPRITE - 1].width;

const server = serverForTests("manual");

type Colour = "white" | "blue" | "green" | "red";
const COLOURS: Record<Colour, [number, number, number, number]> = {
  white: [255, 255, 255, 255],
  blue: [0, 0, 255, 255],
  green: [0, 255, 0, 255],
  red: [255, 0, 0, 255],
};

// The colour the test art draws a tile id
function tileColour(id: number): Colour {
  if (id >= WATER_LOW && id <= WATER_HIGH) {
    return "blue";
  }
  return id >= WOODS_LOW && id <= WOODS_HIGH ? "green" : "white";
}

async function serveColouredArt(page: Page): Promise<void> {
  const square = {x: 0, y: 0, width: 16, height: 16};
  const tiles = everyTile({ground: {atlas: "white", ...square}});
  for (let id = WATER_LOW; id <= WATER_HIGH; id++) {
    tiles[id] = {ground: {atlas: "blue", ...square}};
  }
  for (let id = WOODS_LOW; id <= WOODS_HIGH; id++) {
    tiles[id] = {ground: {atlas: "green", ...square}};
  }

  const sprites: Record<string, Record<string, object>> = {};
  SPRITE_SHEET.forEach(({frames}, index) => {
    sprites[index + 1] = {};
    for (let frame = 1; frame <= frames; frame++) {
      sprites[index + 1][frame] = {atlas: "red", ...square};
    }
  });

  const atlases: Record<string, Buffer> = {};
  for (const name of Object.keys(COLOURS) as Colour[]) {
    atlases[`${name}.png`] = solidAtlas(COLOURS[name]);
  }
  await serveTestArt(page, {version: 1, atlases: {white: "white.png", blue: "blue.png", green: "green.png",
                                                  red: "red.png"}, tiles, sprites, cars: {}}, atlases);
}

// The size of the canvas's backing store
async function backingStore(page: Page, selector: string): Promise<{width: number, height: number}> {
  return page.locator(selector).evaluate((canvas: HTMLCanvasElement) => ({width: canvas.width, height: canvas.height}));
}

// The canvas's picture, its backing store's pixels, as a PNG's data URI. Its drawing buffer is kept from frame to
// frame, so it holds what shows. A screenshot of the element would round its box out to whole pixels, taking in the
// TV's border beside it.
async function canvasPicture(page: Page, selector: string): Promise<string> {
  return page.locator(selector).evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
}

// Every pixel of the canvas's picture, by the colour it is, row by row. The page names each pixel's colour, by its
// initial or "?" for none, which is far quicker than sending every pixel back.
async function canvasColours(page: Page, selector: string): Promise<{width: number, height: number,
                                                                      colours: (Colour | null)[]}> {
  const {width, height, initials} = await page.locator(selector).evaluate((canvas: HTMLCanvasElement, colours) => {
    const context = new OffscreenCanvas(canvas.width, canvas.height).getContext("2d")!;
    context.drawImage(canvas, 0, 0);
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const named = Object.entries(colours);
    let text = "";
    for (let i = 0; i < data.length; i += 4) {
      const match = named.find(([, [r, g, b]]) =>
        Math.abs(data[i] - r) < 8 && Math.abs(data[i + 1] - g) < 8 && Math.abs(data[i + 2] - b) < 8);
      text += match === undefined ? "?" : match[0][0];
    }
    return {width: canvas.width, height: canvas.height, initials: text};
  }, COLOURS);

  const byInitial = new Map((Object.keys(COLOURS) as Colour[]).map((name) => [name[0], name]));
  return {width, height, colours: Array.from(initials, (initial) => byInitial.get(initial) ?? null)};
}

for (const scale of [1, 2]) {
  test.describe(`at ${scale} device pixels to the CSS pixel`, () => {
    test.use({deviceScaleFactor: scale});

    test("the splash screen's preview draws each tile from its art, and lets go of its context once it closes",
         async ({page}) => {
      const problems = collectPageProblems(page);
      const player = await Player.onServer(server(), page, TESTER);
      await serveColouredArt(page);
      await player.open(`seed=${SEED}`);
      await expect(page.locator("#splashSeed")).toHaveText(String(SEED));

      expect(await backingStore(page, PREVIEW_CANVAS)).toEqual({width: SplashCanvas.DEFAULT_WIDTH * scale,
                                                                height: SplashCanvas.DEFAULT_HEIGHT * scale});
      // The middle of each tile, in device pixels. The preview may still be on its way: the seed's map has water and
      // woods.
      const middle = (tile: number) => Math.floor((tile + 0.5) * PREVIEW_TILE_SIZE * scale);
      let shown = await canvasColours(page, PREVIEW_CANVAS);
      await expect.poll(async () => {
        shown = await canvasColours(page, PREVIEW_CANVAS);
        const at = new Set<Colour | null>();
        for (let y = middle(0); y < shown.height; y += PREVIEW_TILE_SIZE * scale) {
          for (let x = middle(0); x < shown.width; x += PREVIEW_TILE_SIZE * scale) {
            at.add(shown.colours[y * shown.width + x]);
          }
        }
        return Array.from(at).sort();
      }, "the colours of the tiles' middles").toEqual(["blue", "green", "white"]);

      // The new city starts on the map the preview showed
      await player.startNewGame(SEED, "Preview", "Easy");
      const save = await player.save();
      const wrong = [];
      for (let y = 0; y < save.map.height; y++) {
        for (let x = 0; x < save.map.width; x++) {
          const expected = tileColour(tileAt(save, {x, y}));
          const colour = shown.colours[middle(y) * shown.width + middle(x)];
          if (colour !== expected) {
            wrong.push(`(${x}, ${y}) ${colour} for ${expected}`);
          }
        }
      }
      expect(wrong.slice(0, 10), `${wrong.length} tiles drawn wrong`).toEqual([]);
      // The page opened again to start the city, and its splash screen closed as the city started
      expect(await isContextLost(page, PREVIEW_CANVAS), "the preview's context, once the splash screen closed")
        .toBe(true);
      expect(problems).toEqual([]);
    });

    test("the monster TV draws the tornado it follows and the tiles under it from their art, draws them again once "+
         "a lost context is restored, and lets go of its context as it closes", async ({page}) => {
      const problems = collectPageProblems(page);
      await serveColouredArt(page);
      const player = await startGame(server(), page, SEED, "Television");

      // The disaster's command places the tornado; the city takes no step, so it stays where it was placed
      await player.triggerDisaster("Tornado");
      await player.dismissNotification();
      await expect(page.locator("#monstertv.showing")).toHaveCount(1);
      const container = await page.locator("#tvContainer").boundingBox();
      expect(await backingStore(page, TV_CANVAS)).toEqual({width: Math.round(container!.width * scale),
                                                           height: Math.round(container!.height * scale)});

      // The tornado's square in red, whole, and the land around it in its colours: nothing of the 16 px sheets
      const side = TORNADO_SIDE * scale;
      const picture = async () => {
        const {colours} = await canvasColours(page, TV_CANVAS);
        return {red: colours.filter((colour) => colour === "red").length,
                unknown: colours.filter((colour) => colour === null).length};
      };
      await expect.poll(picture).toEqual({red: side * side, unknown: 0});
      const before = await canvasPicture(page, TV_CANVAS);

      const context = await contextLoss(page, TV_CANVAS);
      await context.lose();
      await expect.poll(context.isLost).toBe(true);
      await context.restore();
      await expect.poll(context.isLost).toBe(false);
      await expect.poll(async () => await canvasPicture(page, TV_CANVAS) === before,
                        "the TV drawn again, as before its context was lost").toBe(true);

      await page.locator("#monsterTVForm button[type=submit]").click();
      await expect(page.locator("#monstertv.showing")).toHaveCount(0);
      expect(await isContextLost(page, TV_CANVAS), "the TV's context, once it closed").toBe(true);
      expect(problems).toEqual([]);
    });
  });
}
