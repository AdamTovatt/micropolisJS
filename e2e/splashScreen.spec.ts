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

import { expect, Page, test } from "@playwright/test";

import { plainCanopy, plainGrass, plainWalkers, plainWalkway, plainWater } from "../test/helpers/grassArt";
import { CITY_LINK, serverForTests } from "./gameServer";
import { blockNetwork, collectPageProblems } from "./page";
import { Player, TESTER } from "./player";
import { png } from "./png";
import { SEED } from "./stages";
import { TestManifest } from "./testArt";

// The splash screen: where the page starts, and what it asks before a new game. The page signs in to the game server
// before it shows the splash screen: what goes wrong before then is tested with no server answering, and the rest with
// the page signed in to a game server of the spec's.

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

// The render manifest given, with the plainest world grass every manifest has, in an atlas of its own, a 2 by 2 PNG,
// and for every other atlas image it names the image given, or a 2 by 2 PNG, or none where it fails to load
async function serveArt(page: Page, manifest: TestManifest, other: Buffer | "fails" = twoByTwo()): Promise<void> {
  await page.route("**/images/render/manifest.json", (route) => route.fulfill({json: {
    ...manifest, atlases: {...manifest.atlases, grass: "grass.png"},
    grass: plainGrass({atlas: "grass", x: 0, y: 0, width: 2, height: 2}),
    canopy: plainCanopy({atlas: "grass", x: 0, y: 0, width: 2, height: 2}),
    water: plainWater({atlas: "grass", x: 0, y: 0, width: 2, height: 2}),
    walkway: plainWalkway({atlas: "grass", x: 0, y: 0, width: 2, height: 2}),
    walkers: plainWalkers({atlas: "grass", x: 0, y: 0, width: 2, height: 2}),
  }}));
  await page.route("**/images/render/*.png", (route) => {
    if (route.request().url().endsWith("/grass.png")) {
      return route.fulfill({body: twoByTwo(), contentType: "image/png"});
    }
    return other === "fails" ? route.abort() : route.fulfill({body: other, contentType: "image/png"});
  });
}

function twoByTwo(): Buffer {
  return png(2, 2, new Array<number>(16).fill(255));
}

const ART_FAILED = "Alert: Failed to load the map's art:";

test.describe("art that fails to load is reported, naming what failed, and the page goes no further", () => {

  test("a render manifest that is broken", async ({page}) => {
    await blockNetwork(page);
    const problems = collectPageProblems(page);
    await serveArt(page, {version: 1, atlases: {}, tiles: {"7": {}}, sprites: {}, cars: {}});

    await page.goto("/");

    await expect.poll(() => problems).toEqual([`${ART_FAILED} Render manifest: tiles.7 lacks ground`]);
    await expect(page.locator("#splash")).toBeHidden();
  });

  test("an atlas image that fails to load", async ({page}) => {
    await blockNetwork(page);
    const problems = collectPageProblems(page);
    await serveArt(page, {version: 1, atlases: {zones: "zones.png"}, tiles: {}, sprites: {}, cars: {}}, "fails");

    await page.goto("/");

    await expect.poll(() => problems).toEqual([`${ART_FAILED} The atlas /images/render/zones.png failed to load`]);
    await expect(page.locator("#splash")).toBeHidden();
  });

  test("a rectangle running past its atlas image", async ({page}) => {
    await blockNetwork(page);
    const problems = collectPageProblems(page);
    await serveArt(page, {version: 1, atlases: {zones: "zones.png"},
                          tiles: {"7": {ground: {atlas: "zones", x: 0, y: 0, width: 4, height: 2}}}, sprites: {},
                          cars: {}});

    await page.goto("/");

    await expect.poll(() => problems)
      .toEqual([`${ART_FAILED} Render manifest: rectangles run past their atlas: tile 7 ground (zones)`]);
    await expect(page.locator("#splash")).toBeHidden();
  });

  test("an atlas wider than the browser's largest texture", async ({page}) => {
    await blockNetwork(page);
    const problems = collectPageProblems(page);
    // A browser whose largest texture is 1024 pixels a side, which the 16 px sheets fit
    await page.addInitScript(() => {
      const getParameter = WebGL2RenderingContext.prototype.getParameter;
      WebGL2RenderingContext.prototype.getParameter = function(this: WebGL2RenderingContext, name: number) {
        return name === this.MAX_TEXTURE_SIZE ? 1024 : getParameter.call(this, name);
      };
    });
    await serveArt(page, {version: 1, atlases: {zones: "zones.png"}, tiles: {}, sprites: {}, cars: {}},
                   png(1025, 1, new Array<number>(1025 * 4).fill(255)));

    await page.goto("/");

    await expect.poll(() => problems)
      .toEqual([`${ART_FAILED} Atlases are past this browser's 1024 pixels a side: zones is 1025 by 1`]);
    await expect(page.locator("#splash")).toBeHidden();
  });
});

test("with no server answering, the page says so in place of the game, and trying again keeps the city's link",
     async ({page}) => {
  await blockNetwork(page);
  const problems = collectPageProblems(page);
  const link = `city=${"0".repeat(32)}`;

  await page.goto(`/?${link}`);
  await expect(page.locator("#noServer")).toBeVisible();
  await expect(page.locator("#signIn")).toBeHidden();
  await expect(page.locator("#splash")).toBeHidden();
  await expect(page).toHaveURL(CITY_LINK);

  await Promise.all([page.waitForEvent("load"), page.click("#noServerRetry")]);
  await expect(page.locator("#noServer")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(link));
  expect(problems).toEqual([]);
});

test.describe("signed in to a game server", () => {
  const server = serverForTests("manual");

  test("a screen too small to play waits for a resize, then offers the URL's seed", async ({page}) => {
    await server().forward(page, TESTER);
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
    await server().forward(page, TESTER);
    const problems = collectPageProblems(page);
    await page.route("**/images/tiles.png", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await route.continue();
    });

    await page.goto("/");

    await expect(page.locator("#splash")).toBeVisible({timeout: 30 * 1000});
    expect(problems).toEqual([]);
  });

  test("a seed that isn't a uint32 is refused out loud, and the map is picked at random", async ({page}) => {
    await server().forward(page, TESTER);
    const problems = collectPageProblems(page);

    await page.goto("/?seed=-1");
    await expect(page.locator("#splash")).toBeVisible();

    expect(problems).toEqual(['Alert: ?seed must be a whole number from 0 to 4294967295, got "-1"']);
    await expect(page.locator("#splashSeed")).toHaveText(/^\d+$/);
  });

  test("debug mode starts a city given no name as MyTown", async ({page}) => {
    const player = await Player.onServer(server(), page, TESTER);
    const problems = collectPageProblems(page);

    await player.open(`seed=${SEED}`);
    await page.click("#splashPlay");
    await page.click("#playit");
    await player.waitForGame();

    await expect(page.locator("#name")).toHaveText("MyTown");
    expect(problems).toEqual([]);
  });

  test("the start form's Back and Escape go back to the map chosen, having started nothing", async ({page}) => {
    const forwarded = await server().forward(page, TESTER);
    // The seed of each map preview the page asks for, in order: each splash screen shown asks for its map's
    const previews: unknown[] = [];
    forwarded.intercept = (message) => {
      const query = message.query as {type?: string, seed?: unknown} | undefined;
      if (message.type === "query" && query?.type === "mapPreview") {
        previews.push(query.seed);
      }
      return false;
    };
    const problems = collectPageProblems(page);
    await page.goto(`/?seed=${SEED}`);
    await page.click("#splashGenerate");
    const chosen = await page.locator("#splashSeed").textContent();
    if (chosen === null || chosen === String(SEED)) {
      throw new Error(`Generate another chose ${chosen}, not another map`);
    }

    await page.click("#splashPlay");
    await expect(page.locator("#start")).toBeVisible();
    await page.click("#playBack");
    await expect(page.locator("#start")).toBeHidden();
    await expect(page.locator("#splash")).toBeVisible();
    await expect(page.locator("#splashSeed")).toHaveText(chosen);

    await page.click("#splashPlay");
    await expect(page.locator("#nameForm")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator("#start")).toBeHidden();
    await expect(page.locator("#splash")).toBeVisible();
    await expect(page.locator("#splashSeed")).toHaveText(chosen);
    await expect(page).not.toHaveURL(CITY_LINK);

    // Escape is the form's only while it shows: one that went back again would show another splash screen, which asks
    // for its map before the map Generate then asks for, and whose own Generate asks again
    await expect.poll(() => previews).toEqual([SEED, Number(chosen), Number(chosen), Number(chosen)]);
    await page.keyboard.press("Escape");
    await page.click("#splashGenerate");
    const generated = Number(await page.locator("#splashSeed").textContent());
    await expect.poll(() => previews[previews.length - 1]).toBe(generated);
    expect(previews).toEqual([SEED, Number(chosen), Number(chosen), Number(chosen), generated]);

    // The form shown again after going back starts the city
    await page.click("#splashPlay");
    await page.fill("#nameForm", "Returned");
    await page.click("#playit");
    await expect(page.locator("#name")).toHaveText("Returned");
    await expect(page).toHaveURL(CITY_LINK);
    await expect(page.locator("#splash")).toBeHidden();
    expect(problems).toEqual([]);
  });

  test("outside debug mode, the start form needs a name", async ({page}) => {
    await server().forward(page, TESTER);

    await page.goto(`/?seed=${SEED}`);
    await page.click("#splashPlay");
    await page.click("#playit");

    await expect(page.locator("#start")).toBeVisible();
    expect(await page.locator("#nameForm").evaluate((input: HTMLInputElement) => input.validity.valueMissing))
      .toBe(true);
  });
});
