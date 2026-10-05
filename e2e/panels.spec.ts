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

import { expect, Locator, Page, test } from "@playwright/test";

import { serverForTests, signIn } from "./gameServer";
import { collectPageProblems } from "./page";
import { startGame, Tile } from "./player";
import { SEED, SITE } from "./stages";

// The panels over the map folding to their title strips, which the browser remembers

const server = serverForTests("manual");

// The panels a player alone in a city sees: the activity list shows only once another player does something
const SHOWING = ["city", "menu", "demand", "map", "tools", "status", "overlay", "online"];

function panel(page: Page, name: string): Locator {
  return page.locator(`[data-panel="${name}"]`);
}

// Expects the panel folded to its strip, its title and button still showing, or unfolded, with its button saying
// which it would do
async function expectFolded(page: Page, name: string, folded: boolean, when: string): Promise<void> {
  const body = expect(panel(page, name).locator(".foldBody"), `the ${name} panel's body ${when}`);
  await (folded ? body.toBeHidden() : body.toBeVisible());
  await expect(panel(page, name).locator(".foldTitle"), `the ${name} panel's title ${when}`).toBeVisible();

  const button = panel(page, name).locator(".foldButton");
  await expect(button, `the ${name} panel's button ${when}`).toBeVisible();
  await expect(button, `the ${name} panel's button ${when}`).toHaveText(folded ? "Show" : "Hide");
  await expect(button, `the ${name} panel's button ${when}`).toHaveAttribute("aria-expanded", String(!folded));
}

// The panels at the foot of their columns, which keep their bottoms; every other keeps its top, or follows the panel
// above it in its column
const AT_FOOT = ["tools", "map"];
// The panels under another in their column, each of which follows the panel above it up as that one folds
const FOLLOWING = ["menu", "demand", "overlay", "status"];

// Each panel's place on the page, by its name: its bottom for a panel at its column's foot, and its top for any other
async function places(page: Page): Promise<Record<string, number>> {
  const found: Record<string, number> = {};
  for (const name of SHOWING) {
    const box = (await panel(page, name).boundingBox())!;
    found[name] = AT_FOOT.includes(name) ? box.y + box.height : box.y;
  }
  return found;
}

// The places of the panels anchored in their regions, which folding moves none of
function anchored(found: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(found).filter(([name]) => !FOLLOWING.includes(name)));
}

test("each panel folds to its strip and unfolds by its button, in its place, as a reload finds it", async ({page}) => {
  const problems = collectPageProblems(page);
  const player = await startGame(server(), page, SEED, "Folding");
  const unfolded = await places(page);

  for (const name of SHOWING) {
    await panel(page, name).locator(".foldButton").click();
  }
  for (const name of SHOWING) {
    await expectFolded(page, name, true, "folded");
  }
  // A folded panel keeps its anchor in its region, and one under another in its column goes up as that one folds
  const folded = await places(page);
  expect(anchored(folded), "the anchored panels' places, folded").toEqual(anchored(unfolded));
  for (const name of FOLLOWING) {
    expect(folded[name], `the ${name} panel's top, under a folded panel`).toBeLessThan(unfolded[name]);
  }

  await player.reloadCity();
  for (const name of SHOWING) {
    await expectFolded(page, name, true, "after a reload");
  }

  for (const name of SHOWING) {
    await panel(page, name).locator(".foldButton").click();
  }
  for (const name of SHOWING) {
    await expectFolded(page, name, false, "unfolded again");
  }
  expect(await places(page), "the panels' places, unfolded again").toEqual(unfolded);
  expect(problems).toEqual([]);
});

test("the activity list folds while another player's lines come and go", async ({page, browser}) => {
  const problems = collectPageProblems(page);
  const player = await startGame(server(), page, SEED, "Shared");
  const activity = panel(page, "activity");

  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  const otherForwarded = await server().forward(other);
  try {
    const otherProblems = collectPageProblems(other);
    // Outside debug mode, so the other page's tool paths go as its ticks send them
    await other.goto(page.url().replace(/debug=1&?/, ""));
    await signIn(other, "Grace");
    await expect(other.locator("#name")).toHaveText("Shared");

    // The other player lays a road on a tile of the building site, which both pages show at the same place
    const build = async (tile: Tile) => {
      const corner = await player.tileCorner(tile);
      await other.click("#roadButton");
      await other.mouse.click(corner.x + 8, corner.y + 8);
      await expect.poll(async () => {
        await player.advance(1);
        return activity.isVisible();
      }, {message: "the activity list showing the other player's road"}).toBe(true);
    };

    await build({x: SITE[0].left, y: SITE[0].top});
    await expectFolded(page, "activity", false, "with a line");
    await activity.locator(".foldButton").click();
    await expectFolded(page, "activity", true, "folded");

    // Its lines gone, the list hides, and a new one shows it folded
    await expect(activity, "the activity list once its line has gone").toBeHidden({timeout: 20 * 1000});
    await build({x: SITE[0].left + 1, y: SITE[0].top});
    await expectFolded(page, "activity", true, "with a new line");
    expect(otherProblems).toEqual([]);
  } finally {
    await otherForwarded.stop();
    await otherContext.close();
  }
  expect(problems).toEqual([]);
});
