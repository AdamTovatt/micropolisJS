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

import { DAMAGE_BLOCK } from "../src/mapDamage";
import { isWoods } from "../src/surfaces";
import { BULLBIT } from "../src/tileFlags";
import { TILE_COUNT, WATER_HIGH, WATER_LOW, WOODS_HIGH, WOODS_LOW } from "../src/tileValues";
import { plainCanopy, plainGrass, plainWater } from "../test/helpers/grassArt";
import { serverForTests } from "./gameServer";
import { collectPageProblems, contextLoss } from "./page";
import { startGame } from "./player";
import { png, samplePixels } from "./png";
import { inBounds, rawTileAt, tileAt, tilesIn } from "./savedMap";
import { SEED, SITE } from "./stages";
import { everyTile, serveTestArt } from "./testArt";
import type { TestManifest } from "./testArt";

// The world grass under each tile's ground, as the ground pass draws it (docs/render-assets.md). A test atlas gives
// bare land, dirt, and the woods a ground that lets all of the grass through; each other odd tile id a ground that
// lets it through in part, its left half opaque red and its right half clear; and each even one an opaque blue ground
// that lets none through. The grass is the plainest, of one green: so bare land shows that green to the last device
// pixel, across every edge between its tiles, with no line between them, the part ground red over green, and the rest
// blue. The canopy is that green too, but where its own drawing is tested, in brown, and so is the water, but where its
// own is, which draws the test atlas's water as the game's art does, from where the map's water lies, in blue, with
// yellow sand along its shore.

const ATLAS_PATH = "grass-test.png";
const GRASS_PATH = "grass-green.png";
const BLUE = [0, 0, 255];
const RED = [255, 0, 0];
const GREEN: [number, number, number] = [0, 160, 0];
const BROWN: [number, number, number] = [120, 70, 20];
const WATER: [number, number, number] = [30, 60, 200];
const SAND: [number, number, number] = [230, 200, 60];
const CANVAS = "#MicropolisCanvas";

const server = serverForTests("manual");

// Three 16 pixel squares: blue; red on its left half, clear on its right; clear
function atlas(): Buffer {
  const pixels: number[] = [];
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 48; x++) {
      pixels.push(...(x < 16 ? [...BLUE, 255] : x < 24 ? [...RED, 255] : [0, 0, 0, 0]));
    }
  }
  return png(48, 16, pixels);
}

// The grass's atlas: the green, then the brown a canopy may be drawn in, each 32 pixels wide, the 16 pixel squares the
// manifest draws from 8 pixels in from where the colours meet, so either sampled linearly at its square's edge takes
// none of the other; then the blue the water may be drawn in, alike
function grassAtlas(): Buffer {
  const pixels: number[] = [];
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 96; x++) {
      pixels.push(...(x < 32 ? GREEN : x < 64 ? BROWN : WATER), 255);
    }
  }
  return png(96, 16, pixels);
}

// What the manifest draws: its canopy the green of the grass, so it shows no more than the grass, unless it is shown
// brown, its edge wobbled by noise of the weight given and its shadow as dark as given, neither by default; and its
// water, by default the green too, and the test atlas's own tiles of the water drawn as any other, unless it is shown,
// the water blue and its sand yellow, drawn from where the map's water lies
interface Drawn {
  canopy?: "green" | "brown";
  wobble?: number;
  shadow?: number;
  water?: boolean;
}

function manifest({canopy = "green", wobble = 0, shadow = 0, water = false}: Drawn = {}): TestManifest {
  const square = (x: number) => ({atlas: "test", x, y: 0, width: 16, height: 16});
  const tiles = everyTile({ground: square(0)});
  for (let id = 1; id < TILE_COUNT; id += 2) {
    tiles[id] = {ground: square(16), grass: "part"};
  }
  tiles[0] = {ground: square(32), grass: "all"};
  // The woods let all the grass through, for the canopy over it, as the game's art does
  for (let id = WOODS_LOW; id <= WOODS_HIGH; id++) {
    tiles[id] = {ground: square(32), grass: "all"};
  }
  // And the water, which the game's art draws as water
  if (water) {
    for (let id = WATER_LOW; id <= WATER_HIGH; id++) {
      tiles[id] = {ground: square(32), grass: "all", water: true};
    }
  }
  const rect = (x: number) => ({atlas: "grass", x, y: 0, width: 16, height: 16});
  return {version: 1, atlases: {test: ATLAS_PATH, grass: GRASS_PATH}, tiles, sprites: {}, cars: {},
          grass: plainGrass(rect(8), GREEN),
          canopy: plainCanopy(rect(canopy === "green" ? 8 : 40), wobble, shadow),
          water: water ? plainWater(rect(72), SAND) : plainWater(rect(8), GREEN)};
}

// How dark the canopy's shadow is where it is drawn, and the grass in it
const SHADOW = 0.5;
const SHADED = GREEN.map((channel) => channel * (1 - SHADOW));

// Whether a tile id's ground lets the grass through, in the manifest given, and so is drawn over the grass and under
// the canopy where woods stand round it
function letsGrassThrough(served: TestManifest, id: number): boolean {
  return "grass" in served.tiles[id];
}

// Whether a pixel is the colour, to within the rounding of the shader's arithmetic
function near(pixel: number[], colour: number[]): boolean {
  return colour.every((channel, i) => Math.abs(pixel[i] - channel) <= 2);
}

async function drawsTheGrass(page: Page): Promise<void> {
  const problems = collectPageProblems(page);
  await serveTestArt(page, manifest(), {[ATLAS_PATH]: atlas(), [GRASS_PATH]: grassAtlas()});
  const player = await startGame(server(), page, SEED, "Grass");
  const site = SITE[0];
  await player.showTiles(tilesIn(site));
  const save = await player.save();
  const shot = await player.mapScreenshot();
  const ratio = await page.evaluate(() => window.devicePixelRatio);

  // Every device pixel of the building site, clear land, but those its edges cross
  const north = await player.tileCorner({x: site.left, y: site.top});
  const south = await player.tileCorner({x: site.right + 1, y: site.bottom + 1});
  const land: {x: number, y: number}[] = [];
  for (let y = Math.ceil(north.y * ratio) + 1; y < Math.floor(south.y * ratio) - 1; y++) {
    for (let x = Math.ceil(north.x * ratio) + 1; x < Math.floor(south.x * ratio) - 1; x++) {
      land.push({x, y});
    }
  }
  const landShown = await samplePixels(page, shot, land);
  const notGrass = landShown.pixels.flatMap((pixel, i) => near(pixel, GREEN) ? [] :
    [`(${land[i].x}, ${land[i].y}) is ${pixel.slice(0, 3).join(", ")}`]);

  // Every other tile in view, a quarter of the way across and three quarters, half way down
  const canvas = await player.canvasBox();
  const {tileWidth} = await player.view();
  const sampled: {what: string, colours: number[][], points: {x: number, y: number}[]}[] = [];
  for (const {tile, x, y} of await player.wholeTilesInView()) {
    const id = tileAt(save, tile);
    const at = (across: number) => ({x: Math.floor((canvas.x + x + tileWidth * across) * ratio),
                                     y: Math.floor((canvas.y + y + tileWidth / 2) * ratio)});
    const colours = id === 0 || isWoods(id) ? [GREEN, GREEN] : id % 2 === 1 ? [RED, GREEN] : [BLUE, BLUE];
    sampled.push({what: `(${tile.x}, ${tile.y}), tile ${id}`, colours, points: [at(0.25), at(0.75)]});
  }
  const shown = await samplePixels(page, shot, sampled.flatMap(({points}) => points));
  const wrong = sampled.flatMap(({what, colours}, i) => colours.every((colour, j) => near(shown.pixels[2 * i + j],
                                                                                           colour)) ? [] : [what]);
  const kinds = new Set(sampled.map(({colours}) => colours[0]));

  expect(land.length, "the building site's pixels").toBeGreaterThan(0);
  expect(notGrass.slice(0, 10), `${notGrass.length} pixels of bare land not the grass`).toEqual([]);
  expect(wrong.slice(0, 10), `${wrong.length} tiles wrong`).toEqual([]);
  // The view holds bare land, grounds that let the grass through in part, and grounds that let none through
  expect(kinds.size).toBe(3);
  expect(problems).toEqual([]);
}

test("bare land shows the grass whole, a ground letting it through in part only there, and others none",
     async ({page}) => drawsTheGrass(page));

test("the grass is drawn again once the browser restores a WebGL context it lost", async ({page}) => {
  const problems = collectPageProblems(page);
  await serveTestArt(page, manifest(), {[ATLAS_PATH]: atlas(), [GRASS_PATH]: grassAtlas()});
  const player = await startGame(server(), page, SEED, "Grass restored");
  await player.showTiles(tilesIn(SITE[0]));
  const before = await player.mapScreenshot();

  const context = await contextLoss(page, CANVAS);
  await context.lose();
  await expect.poll(context.isLost).toBe(true);
  await player.settle();
  await context.restore();
  await expect.poll(context.isLost).toBe(false);

  expect((await player.mapScreenshot()).equals(before), "the map drawn after the restore, as before the loss")
    .toBe(true);
  expect(problems).toEqual([]);
});

const CANOPY_REDRAWN = "the canopy drawn again in part, round woods the bulldozer cleared, shows what the map drawn " +
  "whole does";
const SHADOW_REDRAWN = "the canopy's shadow drawn again in part, two tiles from woods the bulldozer cleared, shows " +
  "what the map drawn whole does";

const SHORE_REDRAWN = "the shore drawn again in part, round water the bulldozer filled, shows what the map drawn whole " +
  "does";

// A tile's canopy is drawn from the woods round it, and its canopy's shadow from the woods up to two tiles up and left
// of it, so a tile of woods cleared changes the canopy of the tiles beside it, and the shadow two tiles past it; and its
// water from the water round it, so a tile of shore filled changes the shore of the tiles beside it: the map is drawn
// again round a changed tile as far as a tile's look reaches, whichever blocks they fall in. The tile cleared, woods or
// water the bulldozer takes, is the given number of tiles, beyond, west of the first of a block of those the map is
// drawn again in, the tiles between it and that tile the same, which the canopy over that tile runs on from, and that
// tile not but one that lets the grass through, whose look must change.
async function redrawnInPart(page: Page, surface: "woods" | "water", beyond: 1 | 2): Promise<void> {
  const problems = collectPageProblems(page);
  const served = surface === "water" ? manifest({water: true}) :
    manifest({canopy: "brown", shadow: beyond === 2 ? SHADOW : 0});
  await serveTestArt(page, served, {[ATLAS_PATH]: atlas(), [GRASS_PATH]: grassAtlas()});
  const player = await startGame(server(), page, SEED, `Redrawn ${surface} ${beyond}`);
  await player.showTiles(tilesIn(SITE[0]));
  const save = await player.save();
  const before = await player.mapScreenshot();

  // Of the tiles that fit, in view with the tiles round them, the nearest the middle of the view, clear of the panels
  // round its edges
  const {originX} = await player.view();
  const inView = await player.wholeTilesInView();
  const shown = (x: number, y: number) => inView.some(({tile}) => tile.x === x && tile.y === y);
  const canopied = (x: number, y: number) => letsGrassThrough(served, tileAt(save, {x, y}));
  const firstInBlock = (offset: number) => offset % DAMAGE_BLOCK === 0;
  const middle = {x: (SITE[0].left + SITE[0].right) / 2, y: (SITE[0].top + SITE[0].bottom) / 2};
  const fromMiddle = ({x, y}: {x: number, y: number}) => Math.hypot(x - middle.x, y - middle.y);
  const between = (x: number) => Array.from({length: beyond - 1}, (_, i) => x + 1 + i);
  const ofSurface = (x: number, y: number) => surface === "woods" ? isWoods(tileAt(save, {x, y})) :
    tileAt(save, {x, y}) >= WATER_LOW && tileAt(save, {x, y}) <= WATER_HIGH;
  const bulldozable = (x: number, y: number) => (rawTileAt(save, {x, y}) & BULLBIT) !== 0;
  const cleared = inView.map(({tile}) => tile).filter(({x, y}) =>
    ofSurface(x, y) && bulldozable(x, y) && firstInBlock(x + beyond - originX) &&
    between(x).every((b) => ofSurface(b, y)) && canopied(x + beyond, y) && !ofSurface(x + beyond, y) &&
    [-1, 0, 1].every((dy) => Array.from({length: beyond + 3}, (_, i) => x - 1 + i).every((dx) => shown(dx, y + dy))))
    .sort((a, b) => fromMiddle(a) - fromMiddle(b))[0];
  expect(cleared, `a tile of ${surface} ${beyond} west of a block's west edge, in view`).toBeDefined();
  const changed = {x: cleared!.x + beyond, y: cleared!.y};

  await player.selectTool("bulldozer");
  await player.clickTile(cleared!);
  const inPart = await player.mapScreenshot();
  // Sizing the canvas draws all of it again
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
  const whole = await player.mapScreenshot();

  // Every device pixel of the tile past the block's edge whose look the tile cleared changes
  const ratio = await page.evaluate(() => window.devicePixelRatio);
  const corner = await player.tileCorner(changed);
  const {tileWidth} = await player.view();
  const pixels: {x: number, y: number}[] = [];
  for (let y = Math.ceil(corner.y * ratio); y < Math.floor((corner.y + tileWidth) * ratio); y++) {
    for (let x = Math.ceil(corner.x * ratio); x < Math.floor((corner.x + tileWidth) * ratio); x++) {
      pixels.push({x, y});
    }
  }
  const [was, is] = await Promise.all([before, whole].map((shot) => samplePixels(page, shot, pixels)));

  expect(tileAt(await player.save(), cleared!), `the ${surface} cleared`).toBe(0);
  expect(was.pixels, `tile (${changed.x}, ${changed.y}), past the block's edge, with the ${surface} cleared, unlike ` +
         "with it").not.toEqual(is.pixels);
  expect(inPart.equals(whole), "the map drawn in part, as drawn whole").toBe(true);
  expect(problems).toEqual([]);
}

test(CANOPY_REDRAWN, async ({page}) => redrawnInPart(page, "woods", 1));
test(SHADOW_REDRAWN, async ({page}) => redrawnInPart(page, "woods", 2));
test(SHORE_REDRAWN, async ({page}) => redrawnInPart(page, "water", 1));

// What a pixel of a tile that lets all the grass through is to show of the canopy over it, given the share of woods
// of the tiles round the point of the tile it lies nearest: at the tile's middle, the tile's own; at a corner, the four
// tiles' that meet there. The surface the canopy is drawn from passes through those values, so at the middle it is
// the tile's own, and within a twentieth of a tile of a corner within 0.11 of the corner's for a share of a quarter or
// three quarters, past the feather either side of the cut, and within 0.05 for none or all. The wobble moves the
// surface by nothing where it is 0 or 1, so with it only the middles, and the corners of none or all, are sure.
function canopyShown(share: number, wobbled: boolean): number[] | null {
  if (share <= (wobbled ? 0 : 0.25)) {
    return GREEN;
  }
  if (share >= (wobbled ? 1 : 0.75)) {
    return BROWN;
  }
  return null;
}

// The canopy drawn over bare land and the woods, brown over the green grass, where the woods round each tile put it:
// each such tile in view, but those on the map's edge, at the device pixel nearest its middle and each of its corners
// whose centre lies within it, shows the brown or the green the woods round that point call for. With the wobble, it
// still does at the points the wobble leaves be, and the map differs from the map drawn without it. With the shadow,
// half a tile right and down, the green at a point is shaded where the canopy covers the point half a tile up and
// left of it: the corner of the tile a middle lies in, and the middle of the tile up and left of a corner. The canopy
// itself is never shaded.
async function canopyPlaced(page: Page, wobble: number, shadow: number): Promise<Buffer> {
  const problems = collectPageProblems(page);
  const served = manifest({canopy: "brown", wobble, shadow});
  await serveTestArt(page, served, {[ATLAS_PATH]: atlas(), [GRASS_PATH]: grassAtlas()});
  const player = await startGame(server(), page, SEED, `Canopy ${wobble} ${shadow}`);
  await player.showTiles(tilesIn(SITE[0]));
  const save = await player.save();
  const shot = await player.mapScreenshot();
  const ratio = await page.evaluate(() => window.devicePixelRatio);
  const canvas = await player.canvasBox();
  const {tileWidth} = await player.view();

  const woods = (x: number, y: number) => isWoods(tileAt(save, {x, y})) ? 1 : 0;
  // The share of woods of the four tiles that meet at the top-left corner of tile (x, y)
  const shareAt = (x: number, y: number) => (woods(x - 1, y - 1) + woods(x, y - 1) + woods(x - 1, y) + woods(x, y)) / 4;
  // The green, shaded where the canopy casting the shadow there covers the grass, or null where it isn't sure to
  const grass = (casting: number[] | null) => casting === null ? null : casting === BROWN && shadow !== 0 ? SHADED :
    GREEN;
  const sampled: {what: string, colour: number[], point: {x: number, y: number}}[] = [];
  const shares = new Set<string>();
  for (const {tile, x, y} of await player.wholeTilesInView()) {
    const id = tileAt(save, tile);
    const round = [-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => ({x: tile.x + dx, y: tile.y + dy})));
    if ((served.tiles[id] as {grass?: string}).grass !== "all" || !round.every((t) => inBounds(save, t))) {
      continue;
    }

    // The tile's square in device pixels, and the first and last pixels whose centres lie within it
    const left = (canvas.x + x) * ratio;
    const top = (canvas.y + y) * ratio;
    const side = tileWidth * ratio;
    const first = (edge: number) => Math.floor(edge + 0.5);
    const last = (edge: number) => Math.ceil(edge + side - 0.5) - 1;
    const middle = {x: Math.floor(left + side / 2), y: Math.floor(top + side / 2)};
    const own = woods(tile.x, tile.y);
    const middleColour = own === 1 ? BROWN : grass(canopyShown(shareAt(tile.x, tile.y), wobble !== 0));
    if (middleColour !== null) {
      sampled.push({what: `the middle of (${tile.x}, ${tile.y}), woods ${own}`, colour: middleColour, point: middle});
    }
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const share = shareAt(tile.x + dx, tile.y + dy);
      const shown = canopyShown(share, wobble !== 0);
      const colour = shown === GREEN ? grass(woods(tile.x + dx - 1, tile.y + dy - 1) === 1 ? BROWN : GREEN) : shown;
      if (colour !== null) {
        shares.add(`${own} ${share}`);
        sampled.push({what: `corner (${dx}, ${dy}) of (${tile.x}, ${tile.y}), woods ${own}, a share ${share}`,
                      colour, point: {x: dx === 0 ? first(left) : last(left), y: dy === 0 ? first(top) : last(top)}});
      }
    }
  }
  const shown = await samplePixels(page, shot, sampled.map(({point}) => point));
  const wrong = sampled.flatMap(({what, colour}, i) => near(shown.pixels[i], colour) ? [] :
    [`${what} is ${shown.pixels[i].slice(0, 3).join(", ")}`]);

  expect(wrong.slice(0, 10), `${wrong.length} of ${sampled.length} points wrong`).toEqual([]);
  // The view holds woods and bare land among woods, so their middles show the brown and the green
  const middles = new Set(sampled.filter(({what}) => what.startsWith("the middle")).map(({colour}) => colour));
  expect([middles.has(BROWN), middles.has(GREEN)]).toEqual([true, true]);
  if (wobble === 0) {
    // and the corners that tell a round canopy from a square one: green at a corner of woods a quarter woods, and
    // brown at a corner of bare land three quarters woods
    expect([shares.has("1 0.25"), shares.has("0 0.75")]).toEqual([true, true]);
  }
  if (shadow !== 0) {
    // and grass the canopy shades
    expect(sampled.some(({colour}) => colour === SHADED)).toBe(true);
  }
  expect(problems).toEqual([]);
  return shot;
}

test("the canopy covers the grass where the woods round each point put it, and its wobble moves only its edge",
     async ({page}) => {
  const still = await canopyPlaced(page, 0, 0);
  const wobbled = await canopyPlaced(await page.context().newPage(), 1.5, 0);
  expect(wobbled.equals(still), "the map with the canopy's edge wobbled, unlike without").toBe(false);
});

test("the canopy casts its shadow right and down onto the grass, and none onto itself", async ({page}) => {
  await canopyPlaced(page, 0, SHADOW);
});

// The canopy's shadow falls on what shows of a tile, not on the canopy its ground hides: a ground that lets the grass
// through in part, with woods up and left, up, and left of it, draws the canopy over the grass under it at its top-left
// corner, three quarters woods, but its own opaque red over that, which the shadow, cast from the middle of the woods
// up and left, darkens as it darkens the grass.
test("the canopy's shadow darkens a ground drawn over the canopy, as it does the grass", async ({page}) => {
  const problems = collectPageProblems(page);
  const served = manifest({canopy: "brown", shadow: SHADOW});
  await serveTestArt(page, served, {[ATLAS_PATH]: atlas(), [GRASS_PATH]: grassAtlas()});
  const player = await startGame(server(), page, SEED, "Shadow over a ground");
  let save = await player.save();
  const woods = (x: number, y: number) => isWoods(tileAt(save, {x, y}));
  const width = save.map.width;
  const candidates = Array.from({length: width * save.map.height}, (_, i) => ({x: i % width,
                                                                               y: Math.floor(i / width)}))
    .filter((t) => t.x > 0 && t.y > 0 && (served.tiles[tileAt(save, t)] as {grass?: string}).grass === "part" &&
                   woods(t.x - 1, t.y - 1) && woods(t.x, t.y - 1) && woods(t.x - 1, t.y));
  expect(candidates.length, "grounds that let the grass through in part, with woods up and left of them")
    .toBeGreaterThan(0);

  const tile = candidates[0];
  await player.showTiles([tile]);
  save = await player.save();
  const shot = await player.mapScreenshot();
  const ratio = await page.evaluate(() => window.devicePixelRatio);
  const canvas = await player.canvasBox();
  const placed = (await player.wholeTilesInView()).find((t) => t.tile.x === tile.x && t.tile.y === tile.y);
  expect(placed, `(${tile.x}, ${tile.y}) whole in view`).toBeDefined();
  // The first device pixel whose centre lies within the tile, at its top-left corner
  const corner = {x: Math.floor((canvas.x + placed!.x) * ratio + 0.5),
                  y: Math.floor((canvas.y + placed!.y) * ratio + 0.5)};
  const shown = await samplePixels(page, shot, [corner]);

  const shaded = RED.map((channel) => channel * (1 - SHADOW));
  expect(near(shown.pixels[0], shaded), `the top-left corner of (${tile.x}, ${tile.y}) is ` +
    `${shown.pixels[0].slice(0, 3).join(", ")}, not the red shaded`).toBe(true);
  expect(problems).toEqual([]);
});

// The water drawn over the land and its own tiles, blue over the green grass, where the water round each tile puts
// it, as the canopy is from the woods: each tile that lets all the grass through in view, but those on the map's edge,
// at the device pixel nearest its middle and each of its corners whose centre lies within it, shows the blue or the
// green the water round that point calls for, the sand's band lying under the cut short of those points; and the
// first pixels of land east of the water, where the shore runs along the tiles' edge, show the sand.
async function waterPlaced(page: Page): Promise<void> {
  const problems = collectPageProblems(page);
  const served = manifest({water: true});
  await serveTestArt(page, served, {[ATLAS_PATH]: atlas(), [GRASS_PATH]: grassAtlas()});
  const player = await startGame(server(), page, SEED, "Water");
  await player.showTiles(tilesIn(SITE[0]));
  const save = await player.save();
  const shot = await player.mapScreenshot();
  const ratio = await page.evaluate(() => window.devicePixelRatio);
  const canvas = await player.canvasBox();
  const {tileWidth} = await player.view();

  const water = (x: number, y: number) => tileAt(save, {x, y}) >= WATER_LOW && tileAt(save, {x, y}) <= WATER_HIGH ? 1 : 0;
  const shareAt = (x: number, y: number) => (water(x - 1, y - 1) + water(x, y - 1) + water(x - 1, y) + water(x, y)) / 4;
  const sampled: {what: string, colour: number[], point: {x: number, y: number}}[] = [];
  const shores: {x: number, y: number}[] = [];
  for (const {tile, x, y} of await player.wholeTilesInView()) {
    const id = tileAt(save, tile);
    const round = [-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => ({x: tile.x + dx, y: tile.y + dy})));
    if ((served.tiles[id] as {grass?: string}).grass !== "all" || !round.every((t) => inBounds(save, t))) {
      continue;
    }

    const left = (canvas.x + x) * ratio;
    const top = (canvas.y + y) * ratio;
    const side = tileWidth * ratio;
    const first = (edge: number) => Math.floor(edge + 0.5);
    const last = (edge: number) => Math.ceil(edge + side - 0.5) - 1;
    const own = water(tile.x, tile.y);
    sampled.push({what: `the middle of (${tile.x}, ${tile.y}), water ${own}`, colour: own === 1 ? WATER : GREEN,
                  point: {x: Math.floor(left + side / 2), y: Math.floor(top + side / 2)}});
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const share = shareAt(tile.x + dx, tile.y + dy);
      const colour = share <= 0.25 ? GREEN : share >= 0.75 ? WATER : null;
      if (colour !== null) {
        sampled.push({what: `corner (${dx}, ${dy}) of (${tile.x}, ${tile.y}), a share ${share}`, colour,
                      point: {x: dx === 0 ? first(left) : last(left), y: dy === 0 ? first(top) : last(top)}});
      }
    }
    // Land with water west of it, and the same up and down both sides, so the shore runs straight along their edge
    if (own === 0 && [-1, 0, 1].every((dy) => water(tile.x - 1, tile.y + dy) === 1 && water(tile.x, tile.y + dy) === 0)) {
      shores.push({x: first(left), y: Math.floor(top + side / 2)});
    }
  }
  const shown = await samplePixels(page, shot, [...sampled.map(({point}) => point), ...shores]);
  const wrong = sampled.flatMap(({what, colour}, i) => near(shown.pixels[i], colour) ? [] :
    [`${what} is ${shown.pixels[i].slice(0, 3).join(", ")}`]);
  const sand = shown.pixels.slice(sampled.length).filter((pixel) => near(pixel, SAND)).length;

  expect(wrong.slice(0, 10), `${wrong.length} of ${sampled.length} points wrong`).toEqual([]);
  // The view holds water and land, so their middles show both
  const middles = new Set(sampled.filter(({what}) => what.startsWith("the middle")).map(({colour}) => colour));
  expect([middles.has(WATER), middles.has(GREEN)]).toEqual([true, true]);
  expect(shores.length, "straight shores in view").toBeGreaterThan(0);
  expect(sand, "straight shores showing the sand").toBe(shores.length);
  expect(problems).toEqual([]);
}

test("the water covers the land where the water round each point puts it, with sand along its shore",
     async ({page}) => waterPlaced(page));

// Where a tile's edges fall between device pixels, as at a browser zoom of 110%
test.describe("on a screen of 1.1 device pixels to the CSS pixel", () => {
  test.use({deviceScaleFactor: 1.1});

  test("bare land shows the grass whole, a ground letting it through in part only there, and others none",
       async ({page}) => drawsTheGrass(page));

  test(CANOPY_REDRAWN, async ({page}) => redrawnInPart(page, "woods", 1));
  test(SHADOW_REDRAWN, async ({page}) => redrawnInPart(page, "woods", 2));
  test(SHORE_REDRAWN, async ({page}) => redrawnInPart(page, "water", 1));

  test("the canopy covers the grass where the woods round each point put it, and casts its shadow onto the grass",
       async ({page}) => {
    await canopyPlaced(page, 0, SHADOW);
  });
});
