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

import { expect, test } from "@playwright/test";

import { blockNetwork, collectPageProblems } from "./page";
import { Player } from "./player";
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
