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

import {
  type BudgetForecastAnswer, type EvaluationRecord, MAX_RANKED_PROBLEMS, SCORE_REASONS, type TileReportAnswer,
} from "../src/protocol";
import { CITY_LIST_KEY } from "../src/storage";
import { serverForTests, signIn } from "./gameServer";
import { checkLayout, problemsAtEachSize, SCREENS, WINDOWS } from "./layoutCheck";
import { keepOldSave, oldSaveText } from "./oldSave";
import { blockNetwork, collectPageProblems } from "./page";
import { startGame } from "./player";
import { SEED, SITE, STAGES } from "./stages";

// The windows' and the screens' layout (layoutCheck.ts): at each screen size the HUD is laid out for, each window,
// opened over a town, and four of the screens before a city opens, the sign-in form, the splash screen, the start form
// and the no-server message, fit the screen, and nothing in them shows outside them, overflows its box or is cut off,
// reads under WCAG AA's 4.5:1 or is drawn in any font but Inter. Each is at the fullest the game shows it: the budget
// and the evaluation with the widest figures, the evaluation with every problem and every step of its score, the query
// window in debug mode, with its raw values and flags and a zone's growth with every note and the most blockers one
// zone has, and the splash screen with more of this browser's cities than its list shows at once and a game it kept
// from before cities were kept on the server. A window or a screen that scrolls at these sizes fails, since a part
// scrolled away is a part out of sight.

const server = serverForTests("manual");

// The widest figures. A city's population is 20 for each unit of its residential census and 160 for each of its
// commercial and industrial (Evaluation.GetPopulation), and a zone of nine tiles counts at most 40 residential, 5
// commercial or 4 industrial, so on the 120x100 map it is at most about 1.07 million: seven digits. Its assessed value is $1,000 for each unit of value its
// buildings give, of which a nuclear plant gives the most for its tiles, 6,000 for 16 (Evaluation.GetAssessedValue), so
// at most $4.5 billion: ten digits. The funds, and the costs and taxes, are a long the rules don't bound, so they take
// ten digits too, past what any city plays to.
const POPULATION = 8_888_888;
const ASSESSED_VALUE = 8_888_888_888;
const MONEY = 8_888_888_888;

// An evaluation at its fullest: the four longest problems the public ranks (Unemployment, Pollution, Housing,
// Traffic), every step of the score, and the widest figures
const FULL_EVALUATION: EvaluationRecord = {
  type: "evaluation", approval: 100, problems: [5, 1, 2, 4], population: POPULATION, migration: -POPULATION,
  assessedValue: ASSESSED_VALUE, cityClass: "MEGALOPOLIS", level: 2, score: 1000, scoreDelta: 200,
  scoreBreakdown: SCORE_REASONS.map((reason, at) => ({reason, points: at % 2 === 0 ? 125 : -100})),
};

// A budget forecast at its fullest: the widest figures, the year losing money, and each service funded at a fraction
// of a percent, which its label writes to a tenth
const FULL_FORECAST: BudgetForecastAnswer = {
  type: "budgetForecast",
  budget: {
    type: "budget", taxRate: 20, taxesCollected: MONEY, funds: MONEY,
    maintenance: {road: MONEY, fire: MONEY, police: MONEY}, funding: {road: 0.999, fire: 0.999, police: 0.999},
  },
  costs: {road: MONEY, fire: MONEY, police: MONEY}, taxes: MONEY, fundsChange: -MONEY, fundsAfterYear: -MONEY,
};

// A tile report at its fullest: the widest raw values, and a home zone with every note and as many blockers as one
// zone can have at once, the longest of each set that exclude each other, beside the widest zone score, demand and
// location at their least, and the longest outlook, which no one zone shows together
const FULL_REPORT: TileReportAnswer = {
  type: "tileReport", x: 119, y: 99, tile: 1018, category: "RESIDENTIAL", populationDensity: 510, landValue: 250,
  crime: 250, pollution: 255, rateOfGrowth: -200, burnable: true, bulldozable: true, conductive: true, animated: true,
  powered: false, zoneCentre: true, fireStationMap: 8888, fireCoverage: 8888, policeStationMap: 8888,
  policeCoverage: 8888, terrainDensity: 240, trafficDensity: 240, cityCentreScore: -64,
  growth: {
    zone: "RESIDENTIAL", x: 118, y: 98, score: -5000, outlook: "MAY_GROW_OR_DECLINE", assessedNowAndThen: true,
    wayAtEdge: false,
    blockers: ["NO_POWER", "LOW_DEMAND", "POLLUTION_OUTWEIGHS_LAND_VALUE", "TOO_POLLUTED", "NEIGHBOURHOOD_TOO_SPARSE"],
  },
};

// A window by its element's id, and how a player opens it
interface WindowOpener {
  id: string;
  open(page: Page): Promise<void>;
}

const WINDOW_LIST: WindowOpener[] = [
  // The city's own forecast, then the fullest, written into the window as it writes the answer to its own
  {id: "budget", open: async (page) => {
    await page.click("#budgetRequest");
    await expect(page.locator("#fundsNow"), "the city's own forecast").not.toBeEmpty();
    await page.evaluate((forecast) => window.micropolisTestHook!.showBudgetForecast(forecast), FULL_FORECAST);
    await expect(page.locator("#fundsAfterYear")).toHaveText("-$8,888,888,888");
  }},
  // The city's own evaluation, then the fullest, written into the window as it writes the city's own
  {id: "evalWindow", open: async (page) => {
    await page.click("#evalRequest");
    await expect(page.locator("#evalScoreBreakdown dt"), "the reasons the score changed").not.toHaveCount(0);
    await page.evaluate((record) => window.micropolisTestHook!.showEvaluation(record), FULL_EVALUATION);
    await expect(page.locator("#problemList li:visible"), "every problem").toHaveCount(MAX_RANKED_PROBLEMS);
    await expect(page.locator("#evalScoreBreakdown dt"), "last year's score and every step")
      .toHaveCount(SCORE_REASONS.length + 1);
  }},
  {id: "disasterWindow", open: (page) => page.click("#disasterRequest")},
  {id: "settingsWindow", open: (page) => page.click("#settingsRequest")},
  {id: "debugWindow", open: (page) => page.click("#debugRequest")},
  {id: "screenshotWindow", open: (page) => page.click("#screenshotRequest")},
  {id: "screenshotLinkWindow", open: async (page) => {
    await page.click("#screenshotRequest");
    await page.click("#screenshotOK");
  }},
  {id: "saveWindow", open: (page) => page.click("#saveRequest")},
  // The page warns of a touch screen at its first touch
  {id: "touchWarnWindow", open: async (page) => {
    await page.evaluate(() => {
      window.dispatchEvent(new Event("touchstart"));
    });
  }},
];

// Has the stylesheet make a fault, and checks the layout check reports it among the panels the selector picks, then
// takes the fault out again
async function expectReported(page: Page, selector: string, rule: string, reported: RegExp): Promise<void> {
  const fault = await page.addStyleTag({content: rule});
  expect((await checkLayout(page, selector)).problems, rule).toEqual(expect.arrayContaining([
    expect.stringMatching(reported),
  ]));
  await fault.evaluate((element) => element.parentNode!.removeChild(element));
}

test("each window fits the screen and its box at each size, opened over a town", async ({page}) => {
  test.setTimeout(4 * 60 * 1000);
  const problems = collectPageProblems(page);
  const player = await startGame(server(), page, SEED, "Windows");
  // A town with people in it, a year old, so the evaluation says why its score changed
  for (const stage of STAGES.slice(0, 2)) {
    await stage.play(player);
  }

  const found: string[] = [];
  for (const opener of WINDOW_LIST) {
    await opener.open(page);
    await expect(page.locator(`#${opener.id}`)).toBeVisible();
    found.push(...await problemsAtEachSize(page, WINDOWS, opener.id));
    await page.keyboard.press("Escape");
    await expect(page.locator(`#${opener.id}`)).toBeHidden();
  }

  // The query window, in debug mode, with the tile's raw values and flags, then the fullest report, written into the
  // window as it writes the city's own
  const zone = {x: SITE[0].left + 1, y: SITE[0].bottom - 1};
  await player.showTiles([zone]);
  await player.selectTool("query");
  await player.clickTile(zone);
  await expect(page.locator("#queryWindow")).toBeVisible();
  await expect(page.locator("#queryDebugTable")).toBeVisible();
  await expect(page.locator("#queryOutlook"), "the city's own zone's growth").not.toBeEmpty();
  await page.evaluate((report) => window.micropolisTestHook!.showTileReport(report), FULL_REPORT);
  await expect(page.locator("#queryBlockers li"), "every blocker").toHaveCount(FULL_REPORT.growth!.blockers.length);
  await expect(page.locator("#queryNoWayOut")).toBeVisible();
  await expect(page.locator("#queryNowAndThen")).toBeVisible();
  found.push(...await problemsAtEachSize(page, WINDOWS, "queryWindow"));

  expect(found).toEqual([]);
  expect(problems).toEqual([]);
});

test("the sign-in form, the splash screen, the start form and the no-server message fit the screen and their boxes " +
     "at each size", async ({page, browser}) => {
  const problems = collectPageProblems(page);
  const found: string[] = [];
  await page.addInitScript(({key, cities}) => localStorage.setItem(key, JSON.stringify(cities)), {
    key: CITY_LIST_KEY,
    cities: ["Riverton", "Harbour", "Lakeside", "Old Mill", "Northgate", "Brookfield"]
      .map((name, at) => ({city: `${at}`.repeat(32), name})),
  });
  await keepOldSave(page, oldSaveText());
  await server().forward(page);
  await page.goto(`/?seed=${SEED}`);

  await expect(page.locator("#signIn")).toBeVisible();
  found.push(...await problemsAtEachSize(page, SCREENS, "signIn"));

  await signIn(page, "Screens");
  await expect(page.locator("#splash")).toBeVisible();
  await expect(page.locator("#splashOldSave")).toBeVisible();
  await expect(page.locator("#splashCityList li")).toHaveCount(6);
  expect(await page.locator("#splashCityList").evaluate((list) => list.scrollHeight > list.clientHeight),
         "the list of cities, scrolling at its fullest").toBe(true);
  found.push(...await problemsAtEachSize(page, SCREENS, "splash"));

  await page.click("#splashPlay");
  await expect(page.locator("#start")).toBeVisible();
  found.push(...await problemsAtEachSize(page, SCREENS, "start"));

  // With no server answering
  const offline = await browser.newPage();
  try {
    await blockNetwork(offline);
    await offline.goto("/");
    await expect(offline.locator("#noServer")).toBeVisible();
    found.push(...await problemsAtEachSize(offline, SCREENS, "noServer"));
  } finally {
    await offline.close();
  }

  expect(found).toEqual([]);
  expect(problems).toEqual([]);
});

// So the checks above can't pass by finding nothing: each fault planted in the stylesheet is reported, the form
// controls' text among what they check
test("the layout check reports an overflow and a form control in another font planted in a window and on a screen, " +
     "and a window that scrolls", async ({page}) => {
  await server().forward(page);
  await page.goto(`/?seed=${SEED}`);
  await expect(page.locator("#signIn")).toBeVisible();
  expect((await checkLayout(page, SCREENS)).problems, "the sign-in form before any fault is planted").toEqual([]);

  await expectReported(page, SCREENS, "#signIn .hudFieldName { display: block; width: 40px; white-space: nowrap; }",
                       /^label\.hudFieldName "Your name, as the other mayors" overflows its box in #signIn$/);
  await expectReported(page, SCREENS, "#signInName { font-family: serif; }",
                       /^#signInName "" is drawn in serif in #signIn$/);

  await signIn(page, "Faults");
  await page.click("#splashPlay");
  await page.fill("#nameForm", "Faults");
  await page.click("#playit");
  await expect(page.locator("#infobar")).toBeVisible();
  await page.click("#settingsRequest");
  await expect(page.locator("#settingsWindow")).toBeVisible();
  expect((await checkLayout(page, WINDOWS)).problems, "the settings before any fault is planted").toEqual([]);

  await expectReported(page, WINDOWS, "#settingsWindow .hudChoices { flex-wrap: nowrap; width: 60px; }",
                       /^span\.hudChoices ".*" overflows its box in #settingsWindow$/);
  // A window taller than the screen, which scrolls a part of it out of sight
  await expectReported(page, WINDOWS, "#settingsContainer { height: 2000px; }",
                       /^#settingsWindow ".*" overflows its box in #settingsWindow$/);
  await page.keyboard.press("Escape");

  await page.click("#disasterRequest");
  await expect(page.locator("#disasterWindow")).toBeVisible();
  expect((await checkLayout(page, WINDOWS)).problems, "the disasters before any fault is planted").toEqual([]);
  await expectReported(page, WINDOWS, "#disasterSelect { font-family: serif; }",
                       /^#disasterSelect ".*" is drawn in serif in #disasterWindow$/);
});
