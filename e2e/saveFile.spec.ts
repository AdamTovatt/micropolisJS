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
import { writeFileSync } from "fs";

import { blockOtherHosts, collectPageProblems } from "./page";
import { Player } from "./player";
import { SEED, SITE } from "./stages";

// A checkpoint's save opens in debug mode, so the city a stage left can be reproduced directly

async function chooseSaveFile(page: Page, file: string): Promise<void> {
  const chooser = page.waitForEvent("filechooser");
  await page.click("#splashLoadFile");
  await (await chooser).setFiles(file);
}

test("debug mode loads a save file as the city it saved", async ({page}) => {
  await blockOtherHosts(page);
  const problems = collectPageProblems(page);
  const player = new Player(page);

  await player.startNewGame(SEED, "Saved", "Easy");
  // A row of the playthrough's building site, clear land on the seed's map
  const site = SITE[0];
  await player.selectTool("road");
  await player.dragTiles({x: site.left, y: site.top}, {x: site.right, y: site.top});
  await player.advance(500);
  const saved = await player.save();
  const file = test.info().outputPath("city.json");
  writeFileSync(file, JSON.stringify(saved));

  await player.open();
  await chooseSaveFile(page, file);
  await player.waitForGame();

  expect(await player.save()).toEqual(saved);
  await expect(page.locator("#name")).toHaveText("Saved");
  expect(problems).toEqual([]);
});

test("debug mode refuses a file that isn't a save, as often as it is chosen", async ({page}) => {
  await blockOtherHosts(page);
  const problems = collectPageProblems(page);
  const player = new Player(page);
  const file = test.info().outputPath("notes.json");
  writeFileSync(file, "not a save");

  await player.open();
  await chooseSaveFile(page, file);
  await expect.poll(() => problems.length).toBe(1);
  await chooseSaveFile(page, file);
  await expect.poll(() => problems.length).toBe(2);

  expect(problems.every((problem) => problem.startsWith("Alert: Could not read notes.json:")), problems.join("\n"))
    .toBe(true);
  await expect(page.locator("#splash")).toBeVisible();
});

test("the save file button is only in debug mode", async ({page}) => {
  await blockOtherHosts(page);
  const button = page.locator("#splashLoadFile");

  await page.goto("/?debug=1");
  await page.locator("#splashPlay").waitFor();
  await expect(button).toBeVisible();

  await page.goto("/");
  await page.locator("#splashPlay").waitFor();
  await expect(button).toHaveCount(1);
  await expect(button).toBeHidden();
});
