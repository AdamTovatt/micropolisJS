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

import type { GameSave, Tile } from "../e2e/player";
import { chebyshev, Rect, tileAt, tilesAround, tilesIn } from "../e2e/savedMap";
import { planStation, runsOf, savedFireCover, StationPlan, STRONGEST_COVER } from "../e2e/stationSite";
import { BlockMap } from "../src/blockMap";
import { BlockMapUtils } from "../src/blockMapUtils.js";
import { CONDBIT, ZONEBIT } from "../src/tileFlags";
import { DIRT, FIRE, LHPOWER, POWERPLANT, RIVER, ROADS2, TREEBASE, WOODS, WOODS5 } from "../src/tileValues";

const WIDTH = 48;
const HEIGHT = 32;
const PLANT = {x: 5, y: 5};
const FULL_FUNDING = 1000;

// The coal plant's four by four tiles, the grid the tests start from
const plantTiles = tilesIn({left: PLANT.x - 1, top: PLANT.y - 1, right: PLANT.x + 2, bottom: PLANT.y + 2});

// A map of clear land with a coal plant whose centre is PLANT, then the tiles given, as raw values
function saveWith(tiles: [Tile, number][]): GameSave {
  const values = new Array<number>(WIDTH * HEIGHT).fill(DIRT);
  plantTiles.forEach((tile, i) => {
    values[tile.x + tile.y * WIDTH] = (POWERPLANT - 5 + i) | CONDBIT;
  });
  values[PLANT.x + PLANT.y * WIDTH] = POWERPLANT | CONDBIT | ZONEBIT;
  for (const [tile, value] of tiles) {
    values[tile.x + tile.y * WIDTH] = value;
  }

  return {map: {width: WIDTH, height: HEIGHT, tiles: values},
          budget: {totalFunds: 0, cityTax: 0, policePercent: 1, fireEffect: FULL_FUNDING}};
}

function filled(rect: Rect, value: number): [Tile, number][] {
  return tilesIn(rect).map((tile) => [tile, value]);
}

function adjacent(a: Tile, b: Tile): boolean {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
}

function block(tile: Tile): Tile {
  return {x: Math.floor(tile.x / 8), y: Math.floor(tile.y / 8)};
}

function treesAround(save: GameSave, centre: Tile): Tile[] {
  return tilesAround(centre, 2).filter((tile) => tileAt(save, tile) >= TREEBASE && tileAt(save, tile) <= WOODS5);
}

// The cover at the fire of a station of full strength at the centre, as the game's fire analysis smooths it
function coverAt(save: GameSave, centre: Tile, fire: Tile): number {
  const fireStationMap = new BlockMap(WIDTH, HEIGHT, 8);
  const fireStationEffectMap = new BlockMap(WIDTH, HEIGHT, 8);
  fireStationMap.worldSet(centre.x, centre.y, save.budget.fireEffect);
  BlockMapUtils.fireAnalysis({fireStationMap, fireStationEffectMap});

  return fireStationEffectMap.worldGet(fire.x, fire.y);
}

// What a plan must hold wherever the fire is: a station clear of the fire whose cover reaches it at the strongest,
// a road where the station looks for one, and a line that runs unbroken from beside the station to beside the grid,
// never beside the fire, or none when the station touches the grid
function expectAWorkingPlan(save: GameSave, plan: StationPlan, fire: Tile, grid: Tile[] = plantTiles): void {
  const station = tilesAround(plan.centre, 1);
  const besideTheGrid = (tile: Tile) => grid.some((powered) => adjacent(tile, powered));

  expect(station.filter((tile) => chebyshev(tile, fire) <= 1)).toEqual([]);
  expect(coverAt(save, plan.centre, fire)).toBeGreaterThan(STRONGEST_COVER);
  expect(chebyshev(plan.road, plan.centre)).toBe(2);
  expect(station.filter((tile) => adjacent(tile, plan.road))).not.toEqual([]);

  if (plan.line.length === 0) {
    expect(station.filter(besideTheGrid)).not.toEqual([]);
    return;
  }

  expect(station.filter((tile) => adjacent(tile, plan.line[0]))).not.toEqual([]);
  expect(besideTheGrid(plan.line[plan.line.length - 1])).toBe(true);
  expect(plan.line.slice(1).flatMap((tile, i) => adjacent(tile, plan.line[i]) ? [] : [[plan.line[i], tile]]))
    .toEqual([]);
  expect(plan.line.filter((tile) => chebyshev(tile, fire) <= 1)).toEqual([]);
  expect(plan.line.filter((tile) => tile.x === plan.road.x && tile.y === plan.road.y)).toEqual([]);
}

describe("the fire stage's station plan", () => {

    it("builds near a fire in a forest, in the fire's block, and lines it to the plant", () => {
        const fire = {x: 30, y: 20};
        const save = saveWith([...filled({left: 25, top: 15, right: 35, bottom: 25}, WOODS), [fire, FIRE]]);
        const plan = planStation(save, fire);

        expectAWorkingPlan(save, plan, fire);
        expect(block(plan.centre)).toEqual(block(fire));
    });

    // The cover of a station in a block beside the fire's is about half its own block's, and in a block diagonal to
    // it under a quarter, too little
    it("builds in a block beside the fire's when the fire's own has no room, and never diagonal to it", () => {
        const fire = {x: 28, y: 20};
        const save = saveWith([...filled({left: 24, top: 16, right: 31, bottom: 23}, RIVER), [fire, FIRE]]);
        const plan = planStation(save, fire);

        expectAWorkingPlan(save, plan, fire);
        expect(Math.abs(block(plan.centre).x - block(fire).x) + Math.abs(block(plan.centre).y - block(fire).y)).toBe(1);
    });

    it("fails, naming the fire, when only blocks diagonal to the fire's have room", () => {
        const fire = {x: 28, y: 20};
        const water = [
            {left: 16, top: 16, right: 39, bottom: 23},
            {left: 24, top: 8, right: 31, bottom: 31},
        ].flatMap((rect) => filled(rect, RIVER));

        expect(() => planStation(saveWith([...water, [fire, FIRE]]), fire))
            .toThrow("No site near the fire at (28, 20) covers it at the strongest");
    });

    it("chooses a site with the fewest trees around it", () => {
        const fire = {x: 30, y: 20};
        const save = saveWith([...filled({left: 24, top: 16, right: 31, bottom: 23}, WOODS),
                               ...filled({left: 24, top: 16, right: 28, bottom: 20}, DIRT), [fire, FIRE]]);
        const plan = planStation(save, fire);

        expectAWorkingPlan(save, plan, fire);
        expect(treesAround(save, plan.centre)).toEqual([]);
    });

    // As under a change that moves the stream, the fire on the city's own power line: the plan keeps clear of it, and
    // of the line beyond it, which the fire cuts off from the plant
    it("keeps the station and its line clear of a fire on the city's power line, and lines it to the plant's side", () => {
        const fire = {x: 20, y: 6};
        const cityLine = tilesIn({left: PLANT.x + 3, top: 6, right: 30, bottom: 6});
        const save = saveWith([...cityLine.map((tile): [Tile, number] => [tile, LHPOWER | CONDBIT]), [fire, FIRE]]);
        const plan = planStation(save, fire);

        expectAWorkingPlan(save, plan, fire, [...plantTiles, ...cityLine.filter((tile) => tile.x < fire.x - 1)]);
    });

    // The fire beside the city's line, with water keeping the station to the side of the fire away from the plant: the
    // line tiles beside the fire may burn, so the line runs round to the plant's side of them
    it("counts the city's line beyond the tiles beside the fire as cut off", () => {
        const fire = {x: 20, y: 5};
        const cityLine = tilesIn({left: PLANT.x + 3, top: 6, right: 30, bottom: 6});
        const save = saveWith([...cityLine.map((tile): [Tile, number] => [tile, LHPOWER | CONDBIT]),
                               ...filled({left: 12, top: 0, right: 19, bottom: 5}, RIVER), [fire, FIRE]]);
        const plan = planStation(save, fire);

        expectAWorkingPlan(save, plan, fire, [...plantTiles, ...cityLine.filter((tile) => tile.x < fire.x - 1)]);
    });

    it("ends the line where the station touches the grid", () => {
        const fire = {x: 12, y: 5};
        const save = saveWith([...filled({left: 8, top: 0, right: WIDTH - 1, bottom: HEIGHT - 1}, RIVER),
                               ...filled({left: 8, top: 3, right: 10, bottom: 7}, DIRT), [fire, FIRE]]);
        const plan = planStation(save, fire);

        expectAWorkingPlan(save, plan, fire);
        expect(plan.line).toEqual([]);
    });

    // A line of trees between the fire and the plant, with a gap in it that a shortest line can pass through
    it("prefers bare land to trees for the line", () => {
        const fire = {x: 30, y: 20};
        const trees = filled({left: 20, top: 0, right: 20, bottom: HEIGHT - 1}, WOODS)
            .filter(([tile]) => tile.y !== 12);
        const save = saveWith([...trees, [fire, FIRE]]);
        const plan = planStation(save, fire);

        expectAWorkingPlan(save, plan, fire);
        expect(plan.line.filter((tile) => tile.x === 20)).toEqual([{x: 20, y: 12}]);
    });

    it("crosses a road at right angles to reach the grid", () => {
        const fire = {x: 30, y: 20};
        const save = saveWith([...filled({left: 15, top: 0, right: 15, bottom: HEIGHT - 1}, ROADS2), [fire, FIRE]]);
        const plan = planStation(save, fire);

        expectAWorkingPlan(save, plan, fire);
        const crossing = plan.line.findIndex((tile) => tile.x === 15);
        expect(plan.line.slice(crossing - 1, crossing + 2).map((tile) => tile.y))
            .toEqual(new Array(3).fill(plan.line[crossing].y));
    });

    it("fails, naming the fire, when no site near it has room", () => {
        const fire = {x: 30, y: 20};

        expect(() => planStation(saveWith([...filled({left: 14, top: 8, right: 47, bottom: 31}, RIVER), [fire, FIRE]]),
                                 fire))
            .toThrow("No site near the fire at (30, 20)");
    });
});

describe("the fire department's cover in a save", () => {

    // Blocks of eight tiles a side, row by row: the 48 by 32 map is 6 blocks across
    it("is the fire analysis's figure for the tile's block", () => {
        const cover = new Array<number>(6 * 4).fill(0);
        cover[6 * 2 + 3] = 218;
        const save = {...saveWith([]), scannedState: {blockMaps: {fireStationEffectMap: cover}}};

        expect([savedFireCover(save, {x: 24, y: 16}), savedFireCover(save, {x: 31, y: 23}),
                savedFireCover(save, {x: 32, y: 23}), savedFireCover(save, {x: 31, y: 24})]).toEqual([218, 218, 0, 0]);
    });
});

describe("a line's runs", () => {
    const line = [{x: 0, y: 0}, {x: 1, y: 0}, {x: 2, y: 0}, {x: 2, y: 1}, {x: 2, y: 2}, {x: 2, y: 3}, {x: 3, y: 3}];

    it("split at its turns", () => {
        expect(runsOf(line, 12)).toEqual([[{x: 0, y: 0}, {x: 2, y: 0}], [{x: 2, y: 1}, {x: 2, y: 3}],
                                          [{x: 3, y: 3}, {x: 3, y: 3}]]);
    });

    it("split at the longest a drag may be", () => {
        expect(runsOf(line.slice(0, 3), 2)).toEqual([[{x: 0, y: 0}, {x: 1, y: 0}], [{x: 2, y: 0}, {x: 2, y: 0}]]);
    });

    it("are none for no line", () => {
        expect(runsOf([], 12)).toEqual([]);
    });
});
