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
import { BIT_MASK } from "../src/tileFlags";
import { TileUtils } from "../src/tileUtils.js";
import {
  AIRPORT, COMCLR, FIRESTATION, FREEZ, HROADPOWER, INDCLR, LASTPOWER, LASTRUBBLE, POLICESTATION, POWERBASE, POWERPLANT,
  RUBBLE, TREEBASE, VROADPOWER, WOODS5,
} from "../src/tileValues";
import { Player, GameSave, Tile } from "./player";

// The playthrough: one city played from a fixed seed through stages in order, each building on the last. A stage is
// a named block of player actions, and the runner takes a checkpoint after each one. Adding a stage is the normal way
// to cover a new feature. A stage builds only on SITE, which it may widen, or in FOREST, so the first stage's map check
// covers it.

export const SEED = 23;
export const CITY_NAME = "Playthrough";

// The steps in a year at the city's speed, medium
const YEAR = stepsPerYear(Simulation.SPEED_MED);

// What the game charges for an airport. A tool's cost is a property of every tool, which the type of the city's tools
// leaves out.
const AIRPORT_COST = (cityTools(new GameMap(120, 100)).airport as unknown as {toolCost: number}).toolCost;

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

// The building site, all in view and clear of the panels at the runner's window size. Every tile a stage builds on
// lies in these rectangles, all clear land on the seed's map, except the forest the fire burns in.
export const SITE: Rect[] = [
  {left: 47, top: 30, right: 69, bottom: 38},
  // The airport
  {left: 46, top: 40, right: 51, bottom: 45},
  // A second airport, refused for lack of funds
  {left: 71, top: 29, right: 76, bottom: 34},
  // The power line south to the forest, and the road beside it
  {left: 47, top: 46, right: 47, bottom: 61},
  {left: 35, top: 61, right: 46, bottom: 61},
  {left: 33, top: 63, right: 33, bottom: 63},
];

// The forest the seed's fire lands in, where the fire station stands
const FOREST: Rect = {left: 31, top: 60, right: 34, bottom: 62};

// Where the fire the disasters menu starts lands on this seed, at that point in the playthrough
const FIRE_TILE = {x: 31, y: 61};

export interface Stage {
  name: string;
  play(player: Player): Promise<void>;
}

// A raw tile value's tile, without its flags
function tileId(value: number): number {
  return value & BIT_MASK;
}

function tileAt(save: GameSave, tile: Tile): number {
  return tileId(save.map.tiles[tile.x + tile.y * save.map.width]);
}

function tilesIn(rect: Rect): Tile[] {
  const tiles = [];
  for (let y = rect.top; y <= rect.bottom; y++) {
    for (let x = rect.left; x <= rect.right; x++) {
      tiles.push({x, y});
    }
  }

  return tiles;
}

function tilesWhere(save: GameSave, test: (id: number) => boolean): Tile[] {
  const width = save.map.width;
  return save.map.tiles.flatMap((value, i) => test(tileId(value)) ? [{x: i % width, y: Math.floor(i / width)}] : []);
}

// Trees and woods, from the first tree to the last woods tile
function isTree(id: number): boolean {
  return id >= TREEBASE && id <= WOODS5;
}

// Power lines, those crossing a road or a rail included
function isPowerLine(id: number): boolean {
  return id >= POWERBASE && id <= LASTPOWER;
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
      const unwooded = tilesIn(FOREST).filter((tile) => !isTree(tileAt(start, tile)));
      expect(unwooded, "the forest is trees on the seed's map").toEqual([]);

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
      // Without auto-budget, the year end pays the city's services and offers the budget to review, while the city
      // steps on
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
      // A fire station in the forest the fire will land in, powered by a line from the airport, with a road beside
      // it. Building draws nothing from the simulation's stream, so the fire lands where it would have without them.
      await player.selectTool("wire");
      await player.dragTiles({x: 47, y: 46}, {x: 47, y: 61});
      await player.dragTiles({x: 46, y: 61}, {x: 35, y: 61});
      await player.selectTool("road");
      await player.clickTile({x: 33, y: 63});
      await player.selectTool("fire");
      await player.clickTile({x: 33, y: 61});
      await expectTiles(player, [[{x: 33, y: 61}, FIRESTATION]], "the fire station's centre");

      await player.triggerDisaster("Fire");
      expect(tilesWhere(await player.save(), TileUtils.isFire), "the tiles on fire").toEqual([FIRE_TILE]);

      // Until the fire is out: a unit of city time at a time, the time a scan of the map takes. Even under the
      // strongest cover a burning tile goes out on only one scan in eight, so a fire can last a year.
      let save = await player.save();
      for (let time = 0; tilesWhere(save, TileUtils.isFire).length > 0; time++) {
        if (time === 2 * CITY_TIME_PER_YEAR) {
          throw new Error(`Still on fire after two years: ${JSON.stringify(tilesWhere(save, TileUtils.isFire))}`);
        }

        await player.advance(stepsPerCityTime(Simulation.SPEED_MED));
        save = await player.save();
      }

      const burnt = tileAt(save, FIRE_TILE);
      expect(burnt >= RUBBLE && burnt <= LASTRUBBLE, `the burnt tile, ${burnt}, is rubble`).toBe(true);
      // Over 100 is the strongest cover, under which a fire goes out on half the scans that test it, against one in
      // eleven uncovered
      expect(await player.queryDebugFigure(FIRE_TILE, "queryFireStationEffectRaw"),
             "the fire department's cover where the fire was").toBeGreaterThan(100);
    },
  },
  {
    name: "Save, reload, and carry on",
    async play(player) {
      await player.saveGame();
      const saved = await player.save();

      await player.reloadSavedGame();
      expect(await player.save(), "the city after a reload is the city that was saved").toEqual(saved);

      await player.advance(YEAR / 2);
    },
  },
];

// After the stages, the browser's own driver runs the city. It waits on city time, never on wall time, and how many
// steps it takes depends on wall time, so its state is not reproducible.
export async function letTheDriverRun(player: Player): Promise<void> {
  // A month is four units of city time
  const start = await player.cityTime();
  await player.releaseDriver();
  await player.page.waitForFunction((target) => window.micropolisTestHook!.cityTime() >= target, start + 4,
                                    {polling: 100, timeout: 60 * 1000});
  await player.holdDriver();
}
