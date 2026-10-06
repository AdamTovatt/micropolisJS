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

import { expect, type Page, test } from "@playwright/test";

import type { TileReportAnswer, ZoneGrowthReport } from "../src/protocol";
import { serverForTests } from "./gameServer";
import { collectPageProblems } from "./page";
import { startGame } from "./player";
import { SEED, SITE } from "./stages";

// The query window leaves out what a tile's report doesn't hold: every part of a zone's growth for a tile of no zone
// that grows, the row of what holds a zone back when nothing does, and each note on its growth that doesn't apply.
// windowLayout.spec.ts shows the window at its fullest, with every part.

const server = serverForTests("manual");

// A zone's growth that nothing holds back and no note applies to, and a report of one of the zone's tiles
const GROWTH: ZoneGrowthReport = {
  zone: "COMMERCIAL", x: 50, y: 32, score: 400, outlook: "LIKELY_TO_GROW", assessedNowAndThen: false, roadAtEdge: true,
  blockers: [],
};
const REPORT: TileReportAnswer = {
  type: "tileReport", x: 51, y: 33, tile: 431, category: "COMMERCIAL", populationDensity: 40, landValue: 60, crime: 20,
  pollution: 0, rateOfGrowth: 0, burnable: true, bulldozable: true, conductive: true, animated: false, powered: true,
  zoneCentre: false, fireStationMap: 0, fireCoverage: 0, policeStationMap: 0, policeCoverage: 0, terrainDensity: 0,
  trafficDensity: 0, cityCentreScore: 10, growth: GROWTH,
};

// Writes a report into the query window, as it writes the city's own
async function showReport(page: Page, report: TileReportAnswer): Promise<void> {
  await page.evaluate((shown) => window.micropolisTestHook!.showTileReport(shown), report);
}

// Checks which of the growth's parts show, by an element of each that has text whenever it shows, so a part left
// showing empty fails too: the outlook's and the blockers' labels, and each note
async function expectShown(page: Page, shown: {outlook: boolean, blockers: boolean, noRoad: boolean,
                                               nowAndThen: boolean}): Promise<void> {
  for (const [part, selector] of [
    ["outlook", "#queryFigures dt.queryGrowthPart"], ["blockers", "dt.queryBlockersRow"], ["noRoad", "#queryNoRoad"],
    ["nowAndThen", "#queryNowAndThen"],
  ] as const) {
    const element = page.locator(selector);
    await (shown[part] ? expect(element, part).toBeVisible() : expect(element, part).toHaveCSS("display", "none"));
  }
}

test("the query window leaves out each part of a zone's growth the report doesn't hold", async ({page}) => {
  const problems = collectPageProblems(page);
  const player = await startGame(server(), page, SEED, "Query");

  // Clear land, which no zone holds: no part of a zone's growth, in the figures or the debug rows
  const clear = {x: SITE[0].left, y: SITE[0].top};
  await player.showTiles([clear]);
  await player.selectTool("query");
  await player.clickTile(clear);
  await expect(page.locator("#queryWindow")).toBeVisible();
  await expect(page.locator("#queryTile")).toHaveText(`${clear.x}, ${clear.y}`);
  await expectShown(page, {outlook: false, blockers: false, noRoad: false, nowAndThen: false});
  for (const selector of ["#queryGrowthNotes", "#queryDebugList dt.queryGrowthPart"]) {
    await expect(page.locator(selector).first(), selector).toHaveCSS("display", "none");
  }

  // A zone nothing holds back, with no note: where it stands alone
  await showReport(page, REPORT);
  await expectShown(page, {outlook: true, blockers: false, noRoad: false, nowAndThen: false});
  await expect(page.locator("#queryZoneScoreRaw")).toHaveText(`${GROWTH.score}`);

  // Each note alone, then something holding it back
  await showReport(page, {...REPORT, growth: {...GROWTH, roadAtEdge: false}});
  await expectShown(page, {outlook: true, blockers: false, noRoad: true, nowAndThen: false});
  await showReport(page, {...REPORT, growth: {...GROWTH, assessedNowAndThen: true}});
  await expectShown(page, {outlook: true, blockers: false, noRoad: false, nowAndThen: true});
  await showReport(page, {...REPORT, growth: {...GROWTH, blockers: ["LOW_DEMAND"]}});
  await expectShown(page, {outlook: true, blockers: true, noRoad: false, nowAndThen: false});

  // And a tile of no zone that grows again, after one
  await showReport(page, {...REPORT, growth: null});
  await expectShown(page, {outlook: false, blockers: false, noRoad: false, nowAndThen: false});
  expect(problems).toEqual([]);
});
