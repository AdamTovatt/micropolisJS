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
import { writeFileSync } from "fs";

import { CITY_LINK, serverForTests } from "./gameServer";
import { collectPageProblems, isContextLost } from "./page";
import { Player, TESTER } from "./player";
import { SEED, SITE } from "./stages";

// Load on the splash screen starts a save file on the game server as a new city, so a checkpoint's save, or any city
// saved as a file, can be played again

const server = serverForTests("manual");

// The id in the city's link in the page's address
function linkedCity(url: string): string {
  const link = CITY_LINK.exec(url);
  if (link === null) {
    throw new Error(`${url} has no city's link`);
  }

  return link[1];
}

test("Load starts a save file as a new city, the city it saved", async ({page}) => {
  const player = await Player.onServer(server(), page, TESTER);
  const problems = collectPageProblems(page);

  await player.startNewGame(SEED, "Saved", "Easy");
  const savedCity = linkedCity(page.url());
  // A row of the playthrough's building site, clear land on the seed's map
  const site = SITE[0];
  await player.selectTool("road");
  await player.dragTiles({x: site.left, y: site.top}, {x: site.right, y: site.top});
  await player.advance(500);
  const saved = await player.save();
  const file = test.info().outputPath("city.json");
  writeFileSync(file, JSON.stringify(saved));

  await player.open();
  await player.loadSaveFile(file);
  await player.waitForGame();

  expect(linkedCity(page.url())).not.toBe(savedCity);
  expect(await player.save()).toEqual(saved);
  await expect(page.locator("#name")).toHaveText("Saved");
  expect(await isContextLost(page, "#SplashCanvas"), "the splash preview's context, once the saved game started")
    .toBe(true);
  expect(problems).toEqual([]);
});

test("Load refuses a file that isn't a save, as often as it is chosen", async ({page}) => {
  const player = await Player.onServer(server(), page, TESTER);
  const problems = collectPageProblems(page);
  const file = test.info().outputPath("notes.json");
  writeFileSync(file, "not a save");

  await player.open();
  await player.loadSaveFile(file);
  await expect.poll(() => problems.length).toBe(1);
  await player.loadSaveFile(file);
  await expect.poll(() => problems.length).toBe(2);

  expect(problems.every((problem) => problem.startsWith("Alert: Could not start notes.json:")), problems.join("\n"))
    .toBe(true);
  await expect(page.locator("#splash")).toBeVisible();
});

test("Load refuses a file that reads as a save but won't start, and stays on the splash screen", async ({page}) => {
  const player = await Player.onServer(server(), page, TESTER);
  const problems = collectPageProblems(page);

  await player.startNewGame(SEED, "Saved", "Easy");
  const mapless: Record<string, unknown> = {...await player.save()};
  delete mapless.map;
  const file = test.info().outputPath("mapless.json");
  writeFileSync(file, JSON.stringify(mapless));

  await player.open();
  await player.loadSaveFile(file);
  await expect.poll(() => problems.length).toBe(1);

  expect(problems[0]).toMatch(/^Alert: Could not start mapless.json:/);
  await expect(page.locator("#splash")).toBeVisible();
});

test("Load ignores a save file that finishes reading after the player started a new city", async ({page}) => {
  const player = await Player.onServer(server(), page, TESTER);
  const problems = collectPageProblems(page);

  await player.startNewGame(SEED, "Saved", "Easy");
  const file = test.info().outputPath("city.json");
  writeFileSync(file, JSON.stringify(await player.save()));

  // A file's text is read only once the test lets it, and then the page's own handler runs before the test goes on
  await page.addInitScript(() => {
    const read = Blob.prototype.text;
    let release = () => {};
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    const page = window as unknown as {finishFileRead: () => Promise<unknown>};
    let pending: Promise<string> = Promise.resolve("");

    Blob.prototype.text = function() {
      pending = released.then(() => read.call(this));
      return pending;
    };
    page.finishFileRead = () => {
      release();
      return pending.then(() => new Promise((resolve) => setTimeout(resolve, 0)));
    };
  });

  await player.open();
  await player.loadSaveFile(file);
  await page.click("#splashPlay");
  await page.fill("#nameForm", "Started");
  await page.click("#playit");
  await player.waitForGame();
  await page.evaluate(() => (window as unknown as {finishFileRead: () => Promise<unknown>}).finishFileRead());

  await expect(page.locator("#name")).toHaveText("Started");
  expect((await player.save()).name).toBe("Started");
  expect(problems).toEqual([]);
});

test("Load is offered outside debug mode", async ({page}) => {
  await server().forward(page, TESTER);

  await page.goto("/");

  await expect(page.locator("#splashLoad")).toBeVisible();
  await expect(page.locator("#splashLoad")).toBeEnabled();
});
