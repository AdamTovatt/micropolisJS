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

import { SPRITE_SHEET } from "../src/renderManifest";
import { serverForTests } from "./gameServer";
import { collectPageProblems } from "./page";
import { startGame } from "./player";
import { samplePixels } from "./png";
import { tilesIn } from "./savedMap";
import { SEED } from "./stages";
import { everyTile, serveTestArt, solidAtlas } from "./testArt";

// A sprite is drawn from its art, in its square. A test atlas draws every tile id white and every frame of every
// sprite red, so the red on the map is the sprite's square and nothing else.

// The tornado's square, in map pixels at 16 a tile, as the sprite sheet has it
const TORNADO = 6;
const TORNADO_SIDE = SPRITE_SHEET[TORNADO - 1].width;

// How far from its saved position, in map pixels, the map is searched for the sprite's square: the type's drawing
// offset is within it
const SEARCH = 64;

const server = serverForTests("manual");

function isRed([r, g, b]: number[]): boolean {
  return r > 200 && g < 60 && b < 60;
}

test("a sprite is drawn from its art, filling its square", async ({page}) => {
  const problems = collectPageProblems(page);
  const square = {x: 0, y: 0, width: 16, height: 16};
  const sprites: Record<string, Record<string, object>> = {};
  SPRITE_SHEET.forEach(({frames}, index) => {
    sprites[index + 1] = {};
    for (let frame = 1; frame <= frames; frame++) {
      sprites[index + 1][frame] = {atlas: "red", ...square};
    }
  });
  await serveTestArt(page, {version: 1, atlases: {white: "white.png", red: "red.png"},
                            tiles: everyTile({ground: {atlas: "white", ...square}}), sprites, cars: {}},
                     {"white.png": solidAtlas([255, 255, 255, 255]), "red.png": solidAtlas([255, 0, 0, 255])});
  const player = await startGame(server(), page, SEED, "Sprites");

  // The disaster's command places the tornado; the city takes no step, so it stays where it was placed
  await player.triggerDisaster("Tornado");
  await player.dismissNotification();
  const saved = (await player.save()).sprites as {list: {type: number, x: number, y: number}[]};
  const tornadoes = saved.list.filter((sprite) => sprite.type === TORNADO);
  expect(tornadoes.length, "the tornadoes on the map").toBe(1);
  const [{x, y}] = tornadoes;

  // The map searched, in map pixels, brought into view
  const area = {left: x - SEARCH, top: y - SEARCH, right: x + TORNADO_SIDE + SEARCH, bottom: y + TORNADO_SIDE + SEARCH};
  await player.showTiles(tilesIn({left: Math.floor(area.left / 16), top: Math.floor(area.top / 16),
                                  right: Math.floor(area.right / 16), bottom: Math.floor(area.bottom / 16)}));
  const canvas = await player.canvasBox();
  const view = await player.view();
  expect(view.tileWidth).toBe(16);

  // Every pixel of the area, on the page
  const points: {x: number, y: number}[] = [];
  for (let mapY = area.top; mapY < area.bottom; mapY++) {
    for (let mapX = area.left; mapX < area.right; mapX++) {
      points.push({x: canvas.x + mapX - view.originX * 16, y: canvas.y + mapY - view.originY * 16});
    }
  }
  const shown = await samplePixels(page, await player.mapScreenshot(), points);

  const red = points.filter((_, index) => isRed(shown.pixels[index]));
  const xs = red.map((point) => point.x);
  const ys = red.map((point) => point.y);
  const box = {width: Math.max(...xs) - Math.min(...xs) + 1, height: Math.max(...ys) - Math.min(...ys) + 1};
  expect(box, "the red square's size").toEqual({width: TORNADO_SIDE, height: TORNADO_SIDE});
  expect(red.length, "the red pixels, which fill it").toBe(TORNADO_SIDE * TORNADO_SIDE);

  // The tornado moves on, and the map is drawn again where it was and where it is, as the map drawn whole shows it
  await player.advance(8);
  const inPart = await player.mapScreenshot();
  // Sizing the canvas draws all of it again
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
  expect(inPart.equals(await player.mapScreenshot()), "the map drawn in part, as drawn whole").toBe(true);
  expect(problems).toEqual([]);
});
