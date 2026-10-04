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

import { expect } from "@playwright/test";

import { CITY_TIME_PER_YEAR, stepsPerCityTime, stepsPerYear } from "../src/cityTimeModel";
import { cityTools } from "../src/cityTools";
import { GameMap } from "../src/gameMap.js";
import { Simulation } from "../src/simulation.js";
import { POWERBIT } from "../src/tileFlags";
import { TileUtils } from "../src/tileUtils.js";
import {
  AIRPORT, COMCLR, FIRESTATION, FREEZ, HROADPOWER, INDCLR, LASTPOWER, LASTRUBBLE, POLICESTATION, POWERBASE, POWERPLANT,
  RUBBLE, VROADPOWER,
} from "../src/tileValues";
import { GameSave, Player, Tile } from "./player";
import { Rect, rawTileAt, tileAt, tilesIn, tilesWhere } from "./savedMap";
import { buildStation, planStation, savedFireCover, STRONGEST_COVER } from "./stationSite";

// The playthrough: one city played from a fixed seed through stages in order, each building on the last. A stage is
// a named block of player actions, and the runner takes a checkpoint after each one. Adding a stage is the normal way
// to cover a new feature. A stage builds only on SITE, which it may widen, so the first stage's map check covers it,
// or where it chooses from the city, as the fire stage does: a rule change that moves the random stream then moves
// only the goldens, unless the fire lands where the stage finds no site for its station, which it names.

export const SEED = 23;
export const CITY_NAME = "Playthrough";
// The name the player signs in to the game server under
export const PLAYER_NAME = "Mayor";

// The steps in a year at the city's speed, medium
const YEAR = stepsPerYear(Simulation.SPEED_MED);

// What the game charges for an airport. A tool's cost is a property of every tool, which the type of the city's tools
// leaves out.
const AIRPORT_COST = (cityTools(new GameMap(120, 100)).airport as unknown as {toolCost: number}).toolCost;

// The building site, all in view and clear of the panels at the runner's window size. Every tile a stage builds on
// at a fixed place lies in these rectangles, all clear land on the seed's map.
export const SITE: Rect[] = [
  {left: 47, top: 30, right: 69, bottom: 38},
  // The airport
  {left: 46, top: 40, right: 51, bottom: 45},
  // A second airport, refused for lack of funds
  {left: 71, top: 29, right: 76, bottom: 34},
];

export interface Stage {
  name: string;
  play(player: Player): Promise<void>;
}

// Power lines, those crossing a road or a rail included
function isPowerLine(id: number): boolean {
  return (id >= POWERBASE && id <= LASTPOWER) || id === HROADPOWER || id === VROADPOWER;
}

// Advances a unit of city time at a time, the time a scan of the map takes, until the city holds what is tested, and
// returns the save it holds in. When that never comes within the units given, it fails naming what it waited for,
// and the city as `describe` tells it, if given.
async function advanceUntil(player: Player, holds: (save: GameSave) => boolean, what: string, limit: number,
                            describe?: (save: GameSave) => string): Promise<GameSave> {
  let save = await player.save();
  for (let time = 0; !holds(save); time++) {
    if (time === limit) {
      throw new Error(`Waited ${limit} units of city time for ${what}${describe ? `: ${describe(save)}` : ""}`);
    }

    await player.advance(stepsPerCityTime(Simulation.SPEED_MED));
    save = await player.save();
  }

  return save;
}

// Checks that each tile holds the tile value given for it
async function expectTiles(player: Player, expected: [Tile, number][], what: string): Promise<void> {
  const save = await player.save();
  expect(expected.map(([tile]) => tileAt(save, tile)), what).toEqual(expected.map(([, id]) => id));
}

export const STAGES: Stage[] = [
  {
    name: "Roads, a power plant and power lines",
    async play(player) {
      const start = await player.save();
      const builtOn = SITE.flatMap(tilesIn).filter((tile) => tileAt(start, tile) !== 0);
      expect(builtOn, "the building site is clear land on the seed's map").toEqual([]);

      await player.selectTool("road");
      await player.dragTiles({x: 47, y: 36}, {x: 69, y: 36});

      await player.selectTool("coal");
      await player.clickTile({x: 48, y: 33});

      // A line east to where the fire station will stand, and one across the road to the industry's side
      await player.selectTool("wire");
      await player.dragTiles({x: 63, y: 34}, {x: 66, y: 34});
      await player.clickTile({x: 48, y: 36});

      const save = await player.save();
      const road = tilesIn({left: 47, top: 36, right: 69, bottom: 36})
        .filter((tile) => tile.x !== 48)
        .map((tile) => tileAt(save, tile));
      expect(road.every((id) => TileUtils.isRoad(id)), `road tiles ${road}`).toBe(true);
      const line = tilesIn({left: 63, top: 34, right: 66, bottom: 34}).map((tile) => tileAt(save, tile));
      expect(line.every(isPowerLine), `power line tiles ${line}`).toBe(true);
      expect([HROADPOWER, VROADPOWER], "the line across the road").toContain(tileAt(save, {x: 48, y: 36}));
      expect(tileAt(save, {x: 48, y: 33}), "the power plant's centre").toBe(POWERPLANT);
    },
  },
  {
    name: "Zone a small town and run until it has population",
    async play(player) {
      const zones: [Tile, number][] = [];

      await player.selectTool("residential");
      for (const tile of [{x: 52, y: 34}, {x: 55, y: 34}, {x: 54, y: 38}, {x: 57, y: 38}]) {
        await player.clickTile(tile);
        zones.push([tile, FREEZ]);
      }

      await player.selectTool("commercial");
      for (const tile of [{x: 58, y: 34}, {x: 61, y: 34}]) {
        await player.clickTile(tile);
        zones.push([tile, COMCLR]);
      }

      await player.selectTool("industrial");
      for (const tile of [{x: 48, y: 38}, {x: 51, y: 38}]) {
        await player.clickTile(tile);
        zones.push([tile, INDCLR]);
      }

      await expectTiles(player, zones, "the zones' centres");

      await player.advance(2 * YEAR);

      expect(Number(await player.page.locator("#population").textContent()), "population").toBeGreaterThan(0);
    },
  },
  {
    name: "Build while paused",
    async play(player) {
      await player.pressPause();
      await expect(player.advance(1), "a paused city takes no steps").rejects.toThrow("it is paused");

      await player.selectTool("police");
      await player.clickTile({x: 60, y: 38});
      await player.selectTool("fire");
      await player.clickTile({x: 68, y: 34});
      await player.selectTool("residential");
      await player.clickTile({x: 63, y: 38});
      await expectTiles(player, [[{x: 60, y: 38}, POLICESTATION], [{x: 68, y: 34}, FIRESTATION],
                                 [{x: 63, y: 38}, FREEZ]], "the buildings' centres, built while paused");

      await player.pressPause();
      await player.advance(YEAR / 2);
    },
  },
  {
    name: "A tool rejected for lack of funds",
    async play(player) {
      await player.selectTool("airport");
      await player.clickTile({x: 47, y: 41});
      await expect(player.page.locator("#toolOutput")).toHaveText("Tools");
      await expectTiles(player, [[{x: 47, y: 41}, AIRPORT]], "the airport's centre");

      // The airport left too little for a second one
      const before = await player.save();
      expect(before.budget.totalFunds).toBeLessThan(AIRPORT_COST);
      await player.clickTile({x: 72, y: 30});
      await expect(player.page.locator("#toolOutput")).toHaveText("Insufficient funds to build that");
      expect(await player.save(), "a rejected tool leaves the city as it was").toEqual(before);
    },
  },
  {
    name: "Change the budget and tax",
    async play(player) {
      // Without auto-budget, the year end pays the city's services and the Budget button marks the budget to review,
      // while the city steps on
      await player.setAutoBudget(false);
      await player.advanceUntilBudgetReview(YEAR, stepsPerCityTime(Simulation.SPEED_MED));

      await player.setSlider("#taxRate", 9);
      await player.setSlider("#policeRate", 90);
      await player.confirmBudget();

      await player.setAutoBudget(true);
      await player.advance(YEAR / 2);

      const save = await player.save();
      expect(save.budget.cityTax, "the tax rate set in the budget window").toBe(9);
      // The budget holds its percentages in single precision, as the original's floats
      expect(save.budget.policePercent, "the police funding set in the budget window").toBe(Math.fround(0.9));
    },
  },
  {
    name: "Drag a long road quickly",
    async play(player) {
      // The pointer is seen twice on the way, about a dozen tiles apart: the tiles between are filled in, not skipped.
      // The stage takes no steps, and a road draws nothing from the simulation's stream.
      const row = {left: 47, top: 31, right: 69, bottom: 31};
      await player.selectTool("road");
      await player.dragTiles({x: row.left, y: row.top}, {x: row.right, y: row.top}, 2);

      const save = await player.save();
      const skipped = tilesIn(row).filter((tile) => !TileUtils.isRoad(tileAt(save, tile)));
      expect(skipped, "tiles of the drag that are not road").toEqual([]);
    },
  },
  {
    name: "A fire, and the fire department's response",
    async play(player) {
      // The fire lands where the stream puts it, so the stage reads where from the city, then builds a fire station
      // whose cover reaches it, with a road beside it and a power line to the grid, all chosen from the city around
      // the fire. Building takes no steps, so the station stands before the fire's first scan.
      await player.triggerDisaster("Fire");
      const lit = await player.save();
      const fires = tilesWhere(lit, TileUtils.isFire);
      expect(fires, "the tiles on fire").toHaveLength(1);
      const fire = fires[0];
      const plan = planStation(lit, fire);
      await buildStation(player, plan);

      const built = await player.save();
      expect(tileAt(built, plan.centre), "the fire station's centre").toBe(FIRESTATION);
      expect(TileUtils.isRoad(tileAt(built, plan.road)), "the road beside the station").toBe(true);
      const line = plan.line.map((tile) => tileAt(built, tile));
      expect(line.every(isPowerLine), `the power line's tiles ${line}`).toBe(true);

      // Even under the strongest cover a burning tile goes out on only one scan in eight, so a fire can last a year
      const burning = (save: GameSave) => tilesWhere(save, TileUtils.isFire);
      const out = await advanceUntil(player, (save) => burning(save).length === 0, "the fire to go out",
                                     2 * CITY_TIME_PER_YEAR, (save) => `burning at ${JSON.stringify(burning(save))}`);
      const burnt = tileAt(out, fire);
      expect(burnt >= RUBBLE && burnt <= LASTRUBBLE, `the burnt tile, ${burnt}, is rubble`).toBe(true);

      // The fire may go out before the power scan, which runs on some cycles only, reaches the station, and before
      // the fire analysis, which runs on fewer, spreads the station's cover
      const where = `the station at (${plan.centre.x}, ${plan.centre.y}) for the fire at (${fire.x}, ${fire.y})`;
      await advanceUntil(player, (save) => (rawTileAt(save, plan.centre) & POWERBIT) !== 0,
                         `the power of ${where}`, CITY_TIME_PER_YEAR);
      await advanceUntil(player, (save) => savedFireCover(save, fire) > STRONGEST_COVER,
                         `the strongest cover where the fire was, from ${where}`, CITY_TIME_PER_YEAR,
                         (save) => `the cover there is ${savedFireCover(save, fire)}`);
      await player.showTiles([fire]);
      expect(await player.queryDebugFigure(fire, "queryFireStationEffectRaw"),
             "the query window's figure for the cover where the fire was").toBeGreaterThan(STRONGEST_COVER);
    },
  },
  {
    name: "Save, reload, and carry on",
    async play(player) {
      await player.saveGame();
      const saved = await player.save();
      // Before the reload, whose leaving would save the city to the store whether or not the button had
      expect(player.storedSave(), "the city the Save button kept in the game server's store").toEqual(saved);

      await player.reloadCity();
      expect(await player.save(), "the city after a reload is the city that was saved").toEqual(saved);

      await player.advance(YEAR / 2);
    },
  },
  {
    name: "Zoom in, build, and zoom out",
    async play(player) {
      // A road dragged at the closest zoom, so the zoomed pointer's tiles are the ones built on. The game opens at 16
      // pixels a tile, which a reload starts again from. Zooming takes no steps and sends no commands.
      const row = {left: 50, top: 30, right: 56, bottom: 30};
      expect(await player.tileWidth(), "the zoom a loaded game opens at").toBe(16);
      await player.showTiles(tilesIn(row));
      await player.zoomWithWheel({x: 53, y: 30}, 1);
      await player.zoomWithKeys(1);

      await player.selectTool("road");
      await player.showTiles(tilesIn(row));
      await player.dragTiles({x: row.left, y: row.top}, {x: row.right, y: row.top});
      const save = await player.save();
      const notRoad = tilesIn(row).filter((tile) => !TileUtils.isRoad(tileAt(save, tile)));
      expect(notRoad, "tiles of the zoomed drag that are not road").toEqual([]);
      expect(TileUtils.isRoad(tileAt(save, {x: row.left - 1, y: row.top})), "the tile before the drag").toBe(false);
      expect(TileUtils.isRoad(tileAt(save, {x: row.right + 1, y: row.top})), "the tile after the drag").toBe(false);

      await player.zoomWithKeys(-1);
      await player.zoomWithWheel({x: 53, y: 30}, -1);
    },
  },
];

// After the stages, the server's own driver runs the city, on the server's clock. It waits on city time, never on wall
// time, and how many steps it takes depends on wall time, so its state is not reproducible.
export async function letTheDriverRun(player: Player): Promise<void> {
  // A month is four units of city time
  const start = await player.cityTime();
  await player.releaseDriver();
  // Polled from here: the page's waitForFunction doesn't await a predicate's promise, and takes the promise as true
  await expect.poll(() => player.cityTime(), {intervals: [100], timeout: 60 * 1000}).toBeGreaterThanOrEqual(start + 4);
  await player.holdDriver();
}
