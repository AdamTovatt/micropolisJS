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

import { blockNetwork, collectPageProblems } from "./page";
import { Player } from "./player";
import { png } from "./png";
import { SEED } from "./stages";

// The splash screen: where the page starts, and what it asks before a new game

test("a screen too small to play waits for a resize, then offers the URL's seed", async ({page}) => {
  await blockNetwork(page);
  const problems = collectPageProblems(page);
  // The stylesheet shows #tooSmall on a window under 583 pixels high
  await page.setViewportSize({width: 1440, height: 500});

  await page.goto(`/?seed=${SEED}`);
  await expect(page.locator("#tooSmall")).toBeVisible();
  // The page has loaded and is waiting: the splash screen would show by now
  await expect(page.locator("#loadingBanner")).toBeHidden();
  await page.waitForTimeout(1000);
  await expect(page.locator("#splash")).toBeHidden();

  await page.setViewportSize({width: 1440, height: 900});
  await expect(page.locator("#splash")).toBeVisible();
  await expect(page.locator("#splashSeed")).toHaveText(String(SEED));

  // A resize once the splash screen shows builds no second one
  await page.setViewportSize({width: 1400, height: 880});
  await page.waitForTimeout(500);
  await expect(page.locator("#SplashCanvas")).toHaveCount(1);
  expect(problems).toEqual([]);
});

test("the page waits for a slow tile image before it starts", async ({page}) => {
  await blockNetwork(page);
  const problems = collectPageProblems(page);
  await page.route("**/images/tiles.png", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await route.continue();
  });

  await page.goto("/");

  await expect(page.locator("#splash")).toBeVisible({timeout: 30 * 1000});
  expect(problems).toEqual([]);
});

test("a tile image that fails to load is reported, and the page goes no further", async ({page}) => {
  await blockNetwork(page);
  const problems = collectPageProblems(page);
  await page.route("**/images/tiles.png", (route) => route.abort());

  await page.goto("/");

  await expect.poll(() => problems).toEqual(["Alert: Failed to load tileset!"]);
  await expect(page.locator("#splash")).toBeHidden();
});

test("a browser without WebGL2 is told the game needs it, and the page goes no further", async ({page}) => {
  await blockNetwork(page);
  const problems = collectPageProblems(page);
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      return type === "webgl2" ? null : (getContext as (...args: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof getContext;
  });

  await page.goto(`/?seed=${SEED}`);

  await expect(page.locator("#noWebGL")).toBeVisible();
  await expect(page.locator("#noWebGL")).toContainText("WebGL2");
  await expect(page.locator("#loadingBanner")).toBeHidden();
  // As in the test of a screen too small to play, a while for the splash screen to show, had the page gone on: it
  // shows the message instead of loading anything, so nothing marks the moment it would have shown
  await page.waitForTimeout(1000);
  await expect(page.locator("#splash")).toBeHidden();
  expect(problems).toEqual([]);
});

// The render manifest given, and a 2 by 2 PNG for every atlas image it names
async function serveArt(page: Page, manifest: object, atlasFails = false): Promise<void> {
  await page.route("**/images/render/manifest.json", (route) => route.fulfill({json: manifest}));
  await page.route("**/images/render/*.png", (route) => atlasFails ? route.abort() :
    route.fulfill({body: png(2, 2, new Array<number>(16).fill(255)), contentType: "image/png"}));
}

const ART_FAILED = "Alert: Failed to load the map's art:";

test.describe("art that fails to load is reported, naming what failed, and the page goes no further", () => {

  test("a render manifest that is broken", async ({page}) => {
    await blockNetwork(page);
    const problems = collectPageProblems(page);
    await serveArt(page, {version: 1, atlases: {}, tiles: {"7": {}}, sprites: {}});

    await page.goto("/");

    await expect.poll(() => problems).toEqual([`${ART_FAILED} Render manifest: tiles.7 lacks ground`]);
    await expect(page.locator("#splash")).toBeHidden();
  });

  test("an atlas image that fails to load", async ({page}) => {
    await blockNetwork(page);
    const problems = collectPageProblems(page);
    await serveArt(page, {version: 1, atlases: {zones: "zones.png"}, tiles: {}, sprites: {}}, true);

    await page.goto("/");

    await expect.poll(() => problems).toEqual([`${ART_FAILED} The atlas /images/render/zones.png failed to load`]);
    await expect(page.locator("#splash")).toBeHidden();
  });

  test("a rectangle running past its atlas image", async ({page}) => {
    await blockNetwork(page);
    const problems = collectPageProblems(page);
    await serveArt(page, {version: 1, atlases: {zones: "zones.png"},
                          tiles: {"7": {ground: {atlas: "zones", x: 0, y: 0, width: 4, height: 2}}}, sprites: {}});

    await page.goto("/");

    await expect.poll(() => problems)
      .toEqual([`${ART_FAILED} Render manifest: rectangles run past their atlas: tile 7 ground (zones)`]);
    await expect(page.locator("#splash")).toBeHidden();
  });
});

test("a seed that isn't a uint32 is refused out loud, and the map is picked at random", async ({page}) => {
  await blockNetwork(page);
  const problems = collectPageProblems(page);

  await page.goto("/?seed=-1");
  await expect(page.locator("#splash")).toBeVisible();

  expect(problems).toEqual(['Alert: ?seed must be a whole number from 0 to 4294967295, got "-1"']);
  await expect(page.locator("#splashSeed")).toHaveText(/^\d+$/);
});

test("debug mode starts a city given no name as MyTown", async ({page}) => {
  await blockNetwork(page);
  const problems = collectPageProblems(page);
  const player = new Player(page);

  await player.open(`seed=${SEED}`);
  await page.click("#splashPlay");
  await page.click("#playit");
  await player.waitForGame();

  await expect(page.locator("#name")).toHaveText("MyTown");
  expect(problems).toEqual([]);
});

test("outside debug mode, the start form needs a name", async ({page}) => {
  await blockNetwork(page);

  await page.goto(`/?seed=${SEED}`);
  await page.click("#splashPlay");
  await page.click("#playit");

  await expect(page.locator("#start")).toBeVisible();
  expect(await page.locator("#nameForm").evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(true);
});
