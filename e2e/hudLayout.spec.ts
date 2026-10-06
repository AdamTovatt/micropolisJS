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

import { BrowserContext, expect, Page, test } from "@playwright/test";

import * as Messages from "../src/messages";
import { PANELS } from "../src/panelFolding";
import { MOST_LINES } from "../src/playerActivity";
import type { StatusRecord } from "../src/protocol";
import { Text } from "../src/text";
import { Forwarded, serverForTests, signIn } from "./gameServer";
import { checkLayout, HUD_PANELS, LAYOUT_SIZES } from "./layoutCheck";
import { collectPageProblems } from "./page";
import { startGame, Tile } from "./player";
import { CITY_TIMES_PER_YEAR, STEPS_PER_CITY_TIME } from "./ruleNumbers";
import { SEED, SITE, STAGES } from "./stages";

// The HUD's layout (layoutCheck.ts): at each screen size it is laid out for, with every panel open, with each kind of
// button under the pointer, and with every panel folded, no element shows outside its panel or overflows its box, its
// text cut off included, no panel leaves the screen, no two panels overlap, the disaster view, the tool toast and the
// notification bar among them, every text reads at WCAG AA's 4.5:1 against what it is drawn on, over the darkest and the
// lightest map, and every text is drawn in Inter. Each panel is at the fullest the game shows: the disaster view open,
// news with "Go there", the Budget button marking a review due, three players online, the other two's activity at its
// most lines, the invite link's field open, a tool's toast, and the status with every demand cap and more conditions
// than its list shows at once.

const server = serverForTests("manual");

// The parts of the HUD that show at its fullest, open and folded alike, by id
const SHOWN = ["infobar", "onlineList", "miscButtons", "RCIContainer", "monstertv", "notifications", "lastEvent",
               "controls", "overlayPanel", "statusPanel", "activityList", "minimap"];

// Each kind of button, and each state of one, under the pointer: a tool's, the tool chosen, a menu item, the Budget
// button marking a review due, the danger item, a panel's fold button, the primary button, Last event and the disaster
// view's Close
const HOVERED = ["#roadButton", "#residentialButton", "#evalRequest", "#budgetRequest", "#disasterRequest",
                 "#onlineList .foldButton", "#inviteCopy", "#lastEvent", "#monsterTVForm .hudButton"];

// The status at its fullest: power over capacity, every demand cap, and more of the advisor's conditions, the longest
// it words, than its list shows at once
const FULL_STATUS: StatusRecord = {
  type: "status", powerCapacity: 700, powerLoad: 920, residentialCapped: true, commercialCapped: true,
  industrialCapped: true,
  conditions: [
    Messages.NOT_ENOUGH_POWER, Messages.BLACKOUTS_REPORTED, Messages.ROAD_NEEDS_FUNDING,
    Messages.FIRE_STATION_NEEDS_FUNDING, Messages.POLICE_NEEDS_FUNDING, Messages.NEED_POLICE_STATION,
    Messages.NEED_FIRE_STATION, Messages.TAX_TOO_HIGH, Messages.TRAFFIC_JAMS, Messages.HIGH_POLLUTION,
  ],
};

// A planted fault, the stylesheet's rule that makes it, and what the layout check reports for it
interface Fault {
  rule: string;
  reported: RegExp;
}

// A player who joins the city of the page given, in a browser context of their own
interface OtherPlayer {
  page: Page;
  context: BrowserContext;
  forwarded: Forwarded;
}

async function join(browser: {newContext(): Promise<BrowserContext>}, url: string, name: string): Promise<OtherPlayer> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const forwarded = await server().forward(page);
  await page.goto(url);
  await signIn(page, name);
  return {page, context, forwarded};
}

// Each other player does two things the activity list tells of, on tiles of the building site new in each round,
// clicked where the other's page shows them, the same place as on the first page as it started
async function act(other: OtherPlayer, corners: Map<string, {x: number, y: number}>, work: [string, Tile][]):
    Promise<void> {
  for (const [tool, tile] of work) {
    const corner = corners.get(`${tile.x},${tile.y}`)!;
    await other.page.click(`#${tool}Button`);
    await other.page.mouse.click(corner.x + 8, corner.y + 8);
  }
}

// The status at its fullest, shown by the status panel as it shows the city's own, until its list scrolls
async function fillStatus(page: Page): Promise<void> {
  await page.evaluate((status) => window.micropolisTestHook!.showStatus(status), FULL_STATUS);
  expect(await page.locator("#statusPanelBody").evaluate((body) => body.scrollHeight > body.clientHeight),
         "the status list, scrolling at its fullest").toBe(true);
}

// The page runs in debug mode, for the test hook the runner moves the city with, but the layout is checked as a player
// outside debug mode sees it, without the debug panel
async function withoutDebugPanel(page: Page): Promise<void> {
  await page.addStyleTag({content: "#debug { display: none !important; }"});
}

// Folds or unfolds every panel showing, by its button, all at once, well within the time the activity's lines last
async function setFolded(page: Page, folded: boolean): Promise<void> {
  const left = await page.evaluate(({names, folded}) => names.filter((name) => {
    const panel = document.querySelector(`[data-panel="${name}"]`)!;
    if (panel.getClientRects().length > 0 && panel.classList.contains("folded") !== folded) {
      panel.querySelector<HTMLElement>(".foldButton")!.click();
    }
    return panel.getClientRects().length > 0 && panel.classList.contains("folded") !== folded;
  }), {names: [...PANELS], folded});
  expect(left, `the panels left ${folded ? "unfolded" : "folded"}`).toEqual([]);
}

// What the layout check finds with each button of HOVERED under the pointer in turn
async function hoveredProblems(page: Page): Promise<string[]> {
  const problems: string[] = [];
  for (const selector of HOVERED) {
    await page.hover(selector, {timeout: 5000});
    problems.push(...(await checkLayout(page, HUD_PANELS)).problems.map((problem) => `${problem}, hovering ${selector}`));
  }
  return problems;
}

test("every panel of the HUD fits the screen and its box at its fullest, open, hovered and folded, at each size", async (
  {page, browser}, testInfo) => {
  test.setTimeout(5 * 60 * 1000);
  const problems = collectPageProblems(page);
  // Where the clipboard is refused, the invite link shows in its field
  await page.addInitScript(() => {
    navigator.clipboard.writeText = () => Promise.reject(new DOMException("Write permission denied.", "NotAllowedError"));
  });
  const player = await startGame(server(), page, SEED, "Layout");
  await withoutDebugPanel(page);
  // The HUD's font is loaded, so the check sees the HUD in it, never in a fallback while it loads
  expect(await page.evaluate(async () => {
    await document.fonts.ready;
    let loaded = false;
    document.fonts.forEach((face) => {
      loaded ||= face.family.replace(/["']/g, "") === "Inter" && face.status === "loaded";
    });
    return loaded;
  }), "the HUD's font, loaded").toBe(true);

  // A town with people in it, as the playthrough builds it, then the year end without auto-budget, so the Budget button
  // marks the review due
  for (const stage of STAGES.slice(0, 2)) {
    await stage.play(player);
  }
  await player.setAutoBudget(false);
  await player.advanceUntilBudgetDue(2 * CITY_TIMES_PER_YEAR * STEPS_PER_CITY_TIME, STEPS_PER_CITY_TIME);

  // Two more players, who act on the building site's top rows, which the town leaves clear, where both their pages and
  // this one show them before this one's view moves
  const site = SITE[0];
  const tiles = (row: number, round: number, count: number) =>
    Array.from({length: count}, (_, at) => ({x: site.left + round * 4 + at, y: row}));
  const corners = new Map<string, {x: number, y: number}>();
  for (const tile of [0, 1, 2].flatMap((round) => [...tiles(site.top, round, 2), ...tiles(site.top + 1, round, 2)])) {
    corners.set(`${tile.x},${tile.y}`, await player.tileCorner(tile));
  }
  const others = [await join(browser, page.url(), "Grace"), await join(browser, page.url(), "Hedy")];
  await expect(page.locator("#onlineListBody"), "the three players online").toContainText(/Grace.*Hedy|Hedy.*Grace/);

  try {
    for (const [round, size] of LAYOUT_SIZES.entries()) {
      await page.setViewportSize(size);

      const [grace, hedy] = tiles(site.top, round, 2);
      const [wire, park] = tiles(site.top + 1, round, 2);
      await act(others[0], corners, [["road", grace], ["rail", hedy]]);
      await act(others[1], corners, [["wire", wire], ["park", park]]);
      await expect.poll(async () => {
        await player.advance(1);
        return page.locator("#activityListBody .activityLine").count();
      }, {message: "the activity list at its most lines"}).toBe(MOST_LINES);
      await setFolded(page, false);

      // A tornado, which the disaster view follows under its name, and the news tells of with its place
      await player.triggerDisaster("Tornado");
      await expect(page.locator("#notifications .notificationGoThere")).toBeVisible();
      await expect(page.locator("#monstertv.showing")).toHaveCount(1);
      await expect(page.locator("#monsterTVTitle")).toHaveText(Text.tvTitles[Messages.TORNADO_SIGHTED]);

      await fillStatus(page);

      // Last, as the toast fades a few seconds after it shows: a zone on the town's road, which the toast says can't be
      // built, beside the pointer, then the invite link's field, which a click on the map would close
      const zone = {x: site.right - 3, y: site.bottom - 2};
      await player.showTiles([zone]);
      await player.selectTool("residential");
      await player.clickTile(zone);
      await player.clickTile(zone);
      await expect(page.locator("#toolToast")).toBeVisible();
      await page.click("#inviteCopy");
      await expect(page.locator("#inviteLink")).toBeVisible();

      const name = `${size.width}x${size.height}`;
      const open = await checkLayout(page, HUD_PANELS);
      await page.screenshot({path: testInfo.outputPath(`hud-${name}.png`)});
      expect.soft(open.problems, `the HUD at ${name}`).toEqual([]);
      // The tools in two rows of nine, the second the rest, how many each row holds by where its buttons' tops are
      const buttons = page.locator("#buttons .toolButton");
      const rows = await buttons.evaluateAll((all) => {
        const tops = all.map((button) => Math.round(button.getBoundingClientRect().top));
        return [...new Set(tops)].map((top) => tops.filter((other) => other === top).length);
      });
      expect.soft(rows, `the tools' rows at ${name}`).toEqual([9, (await buttons.count()) - 9]);
      expect.soft(open.panels, `the panels showing at ${name}`).toEqual(expect.arrayContaining([...SHOWN, "toolToast"]));

      await setFolded(page, true);
      const folded = await checkLayout(page, HUD_PANELS);
      await page.screenshot({path: testInfo.outputPath(`hud-${name}-folded.png`)});
      expect.soft(folded.problems, `the HUD folded at ${name}`).toEqual([]);
      expect.soft(folded.panels, `the panels showing folded at ${name}`).toEqual(expect.arrayContaining(SHOWN));

      await setFolded(page, false);
      expect.soft(await hoveredProblems(page), `the HUD at ${name}, each button hovered`).toEqual([]);
    }
  } finally {
    for (const other of others) {
      await other.forwarded.stop();
      await other.context.close();
    }
  }
  expect(problems).toEqual([]);
});

// So the check above can't pass by finding nothing: each fault planted in the stylesheet is reported
test("the layout check reports each fault planted: an overlap, an element outside its panel, text cut off, content " +
     "overflowing its box, a panel off the screen, text too faint to read and text in another font", async ({page}) => {
  const player = await startGame(server(), page, SEED, "Faults");
  await withoutDebugPanel(page);
  await player.dismissNotification();
  expect((await checkLayout(page, HUD_PANELS)).problems, "the HUD before any fault is planted").toEqual([]);

  const faults: Fault[] = [
    {rule: "#statusPanel { margin-top: -60px; }", reported: /^#overlayPanel and #statusPanel overlap$/},
    {rule: "#budgetRequest { width: 300px; }", reported: /^#budgetRequest "Budget" shows outside #miscButtons$/},
    {rule: "#miscButtonsBody { max-height: 40px; overflow: hidden; }",
     reported: /^span\.hudButtonLabel "\w+" is cut off in #miscButtons$/},
    {rule: "#infobar .cityName { display: inline-block; width: 20px; white-space: nowrap; }",
     reported: /^#name "Faults" overflows its box in #infobar$/},
    {rule: "#minimap { margin-bottom: -60px; }", reported: /^#minimap leaves the \d+x\d+ screen$/},
    {rule: "#infobar .cityName { color: #303030; }", reported: /^#name "Faults" reads at 1\.\d\d:1 in #infobar$/},
    {rule: "#infobar .cityName { font-family: serif; }", reported: /^#name "Faults" is drawn in serif in #infobar$/},
  ];
  for (const fault of faults) {
    const style = await page.addStyleTag({content: fault.rule});
    const found = (await checkLayout(page, HUD_PANELS)).problems;
    expect.soft(found.some((problem) => fault.reported.test(problem)), `${fault.rule} reported, in ${found.join("; ")}`)
      .toBe(true);
    await style.evaluate((element) => element.parentNode!.removeChild(element));
  }
});
