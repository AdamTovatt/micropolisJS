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

import { CAR_SHARE_KEY, CAR_SHARE_STEPS } from "../src/carShare";
import { serverForTests } from "./gameServer";
import { collectPageProblems } from "./page";
import { startGame } from "./player";
import { SEED } from "./stages";

// The settings window's Cars slider: the share of the trips the city sends that become cars, which the browser keeps
// and never sends

const server = serverForTests("manual");

async function openSettings(page: Page): Promise<void> {
  await page.click("#settingsRequest");
  await expect(page.locator("#settingsWindow")).toBeVisible();
}

test("the Cars slider names each step, keeps the step chosen across a reload and sends nothing", async ({page}) => {
  const problems = collectPageProblems(page);
  const player = await startGame(server(), page, SEED, "Cars");
  const slider = page.locator("#carShare");
  const name = page.locator("#carShareName");

  await openSettings(page);
  await expect(name, "the slider's step before the player has chosen one").toHaveText("All");
  await slider.focus();
  await page.keyboard.press("Home");
  for (const [i, step] of CAR_SHARE_STEPS.entries()) {
    if (i > 0) {
      await page.keyboard.press("ArrowRight");
    }
    await expect(name, `the slider's notch ${i}`).toHaveText(step.name);
    await expect(slider, `the slider's notch ${i}, read aloud`).toHaveAttribute("aria-valuetext", step.name);
  }

  // 10%, the second notch
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  const appliedBefore = await player.commandsApplied();
  await page.click("#settingsOK");
  await expect(page.locator("#settingsWindow")).toBeHidden();
  await player.advance(1);

  expect(await page.evaluate((key) => window.localStorage.getItem(key), CAR_SHARE_KEY)).toBe("10%");
  expect(await player.commandsApplied(), "the commands the city applied, once the share was chosen")
    .toBe(appliedBefore);

  await player.reloadCity();
  await openSettings(page);
  await expect(name, "the slider's step after a reload").toHaveText("10%");
  await page.click("#settingsCancel");
  expect(problems).toEqual([]);
});
