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

import { expect, type Page, test } from "@playwright/test";

import { rampColour, Tint } from "../src/overlayRenderer";
import type { OverlayAnswer, OverlayLayer } from "../src/protocol";
import { Text } from "../src/text";
import { serverForTests } from "./gameServer";
import { collectPageProblems } from "./page";
import { GameSave, type Player, startGame, type Tile } from "./player";
import { samplePixels } from "./png";
import { answerBlockAt, savedBlockMapAt, tilesIn } from "./savedMap";
import { SEED } from "./stages";
import { everyTile, serveTestArt, solidAtlas } from "./testArt";

// The map overlay tints each tile over the map. A test atlas draws every tile id white, so each tile shows its tint
// laid over white, which the layer's value for the tile and the overlay's own colour ramp decide: a tint's colour
// multiplied by its alpha, and white by what the alpha leaves. The land value is the one the save holds; the housing
// appeal, which no save holds, the one the server answered the page with.

// The steps the city takes for the land value scan to have run, at the city's speed, medium
const STEPS = 1000;

// The land value layer's block size and range, from Queries in the C# rules
const LAND_VALUE = {blockSize: 2, low: 0, high: 250};

// The heatmap's ends, blue and red, at the opacity overlayRenderer.ts gives every heatmap tint
const BLUE: Tint = {r: 0, g: 0, b: 255, a: 0.55};
const RED: Tint = {r: 255, g: 0, b: 0, a: 0.55};

// The land value layer's answer as the save holds its block map, which the overlay query answers with
function landValueAnswer(save: GameSave): OverlayAnswer {
  const {blockSize, low, high} = LAND_VALUE;
  const values = (save.scannedState as {blockMaps: Record<string, number[]>}).blockMaps.landValueMap;
  return {type: "overlay", layer: "landValue", blockSize, width: Math.ceil(save.map.width / blockSize),
          height: Math.ceil(save.map.height / blockSize), low, high, values};
}

// A tint laid over white, or white for none
function overWhite(tint: Tint | null): number[] {
  return tint === null ? [255, 255, 255] :
    [tint.r, tint.g, tint.b].map((channel) => Math.round(channel * tint.a + 255 * (1 - tint.a)));
}

// Picks the layer in the overlay picker, and gives the answer the server sent the page to the query it asked for it
async function selectLayer(player: Player, layer: OverlayLayer): Promise<OverlayAnswer> {
  const asked = new Set<unknown>();
  const answers: OverlayAnswer[] = [];
  player.forwarded.listen = (message, from) => {
    const query = message.query as {type?: string, layer?: string} | undefined;
    if (from === "page" && message.type === "query" && query?.type === "overlay" && query.layer === layer) {
      asked.add(message.id);
    } else if (from === "server" && message.type === "answer" && asked.has(message.id)) {
      answers.push(message.value as OverlayAnswer);
    }
  };

  await player.page.selectOption("#overlayPanelSelect", layer);
  await expect.poll(() => answers.length, `the answer to the ${layer} overlay's query`).toBeGreaterThan(0);
  delete player.forwarded.listen;
  return answers[answers.length - 1];
}

// Checks the middle pixel of each whole tile in view shows the tint of the tile's value on the answer's ramp over
// white, and the tint given, or white for none, where a value is one of those given: that the overlay tints some tile
// in view, and that each value given is in view
async function expectTints(player: Player, answer: OverlayAnswer, valueAt: (tile: Tile) => number,
                           ends: Map<number, Tint | null>): Promise<void> {
  const tinted = await player.mapScreenshot();
  const tiles = await player.tileMiddlesInView();
  const shown = await samplePixels(player.page, tinted, tiles.map(({middle}) => middle));
  const endsShown = new Set<number>();

  const wrong: string[] = [];
  let tintedTiles = 0;
  tiles.forEach(({tile}, index) => {
    const value = valueAt(tile);
    const tint = rampColour(answer, value);
    const colour = shown.pixels[index].slice(0, 3);
    if (tint !== null) {
      tintedTiles++;
    }
    const end = ends.get(value);
    const expectations = [tint, ...end === undefined ? [] : [end]].map(overWhite);
    for (const expected of expectations) {
      if (colour.some((channel, i) => Math.abs(channel - expected[i]) > 1)) {
        wrong.push(`(${tile.x}, ${tile.y}) of ${answer.layer} ${value} is ${colour.join(", ")}, ` +
                   `not ${expected.join(", ")}`);
      }
    }
    if (end !== undefined) {
      endsShown.add(value);
    }
  });
  expect(wrong.slice(0, 10), `${wrong.length} tiles wrong`).toEqual([]);
  expect(tintedTiles, "the tiles in view the overlay tints").toBeGreaterThan(0);
  expect([...endsShown].sort((a, b) => a - b), `the ${answer.layer} values given, in view`)
    .toEqual([...ends.keys()].sort((a, b) => a - b));
}

const server = serverForTests("manual");

// A city on the seed's map, drawn from the white test atlas, with a road along the building site's top row and in
// view, which the land value scan, valuing developed land only, has run over
async function cityWithRoad(page: Page, name: string): Promise<Player> {
  const ground = {atlas: "white", x: 0, y: 0, width: 16, height: 16};
  await serveTestArt(page, {version: 1, atlases: {white: "white.png"}, tiles: everyTile({ground}), sprites: {},
                            cars: {}},
                     {"white.png": solidAtlas([255, 255, 255, 255])});
  const player = await startGame(server(), page, SEED, name);

  const road = {left: 47, top: 30, right: 69, bottom: 30};
  await player.selectTool("road");
  await player.showTiles(tilesIn(road));
  await player.dragTiles({x: road.left, y: road.top}, {x: road.right, y: road.top});
  await player.advance(STEPS);
  await player.dismissNotification();
  return player;
}

test("the land value overlay tints each tile by its value over the map, and goes again with the overlay",
     async ({page}) => {
  const problems = collectPageProblems(page);
  const player = await cityWithRoad(page, "Overlay");
  const save = await player.save();
  const answer = landValueAnswer(save);
  const before = await player.mapScreenshot();

  // The city has no fire station, so fire coverage has nothing to show yet: the legend says so, with no ramp, until
  // the next layer has values
  const note = page.locator(".overlayLegendNote");
  const bar = page.locator(".overlayLegendBar");
  await page.selectOption("#overlayPanelSelect", "fireCoverage");
  await expect(note).toHaveText(Text.overlays.nothingToShow);
  await expect(page.locator(".overlayLegendEnds")).toHaveText("NoneFull");
  await expect(bar).toHaveCSS("background-image", "none");

  await page.selectOption("#overlayPanelSelect", "landValue");
  await expect(page.locator(".overlayLegendTitle")).toHaveText("Land value");
  await expect(note).toBeHidden();
  await expect(bar).toHaveCSS("background-image", /^linear-gradient/);

  // The ramp spans the city's own land values, all of them near the road and so in view: the least but zero is blue,
  // and the greatest red
  const nonZero = answer.values.filter((value) => value !== 0);
  await expectTints(player, answer, (tile) => savedBlockMapAt(save, "landValueMap", LAND_VALUE.blockSize, tile),
                    new Map([[Math.min(...nonZero), BLUE], [Math.max(...nonZero), RED]]));
  await expect(page.locator(".overlayLegendEnds"))
    .toHaveText(`Low (${Math.min(...nonZero)})High (${Math.max(...nonZero)})`);

  await page.selectOption("#overlayPanelSelect", "");
  await expect(page.locator(".overlayLegend")).toBeHidden();
  expect((await player.mapScreenshot()).equals(before), "the map with the overlay gone, as before it showed")
    .toBe(true);
  expect(problems).toEqual([]);
});

// The housing appeal, which no save holds: the server works it out as it answers, so the tints are held to the answer
// it sent the page. Its range runs either side of zero, so its ramp diverges, from minus the largest magnitude, blue,
// to plus it, red, where the values are near the road and in view, and clean undeveloped land, at zero, stays clear.
test("the housing appeal overlay tints each tile by the value the server answered, either side of zero",
     async ({page}) => {
  const problems = collectPageProblems(page);
  const player = await cityWithRoad(page, "Appeal");

  const appeal = await selectLayer(player, "housingAppeal");
  await expect(page.locator(".overlayLegendTitle")).toHaveText(Text.overlays.layers.housingAppeal.name);
  const magnitude = Math.max(...appeal.values.map(Math.abs));
  expect(magnitude, "the largest housing appeal's magnitude").toBeGreaterThan(0);
  const shown = new Map<number, Tint | null>([[0, null]]);
  for (const [value, tint] of [[-magnitude, BLUE], [magnitude, RED]] as const) {
    if (appeal.values.includes(value)) {
      shown.set(value, tint);
    }
  }
  await expectTints(player, appeal, (tile) => answerBlockAt(appeal, tile), shown);
  const {low, high} = Text.overlays.layers.housingAppeal;
  await expect(page.locator(".overlayLegendEnds")).toHaveText(`${low} (${-magnitude})${high} (${magnitude})`);
  expect(problems).toEqual([]);
});
