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

import type { GameSave, Tile } from "../e2e/player";
import { chebyshev, inBounds, Rect, tileAt, tilesAround, tilesIn } from "../e2e/savedMap";
import {
  planStation, runsOf, savedFireCover, StationPlan, StationReach, STRONGEST_COVER,
} from "../e2e/stationSite";
import { CONDBIT, ZONEBIT } from "../src/tileFlags";
import { DIRT, FIRE, LHPOWER, POWERPLANT, RIVER, ROADS, ROADS2, TREEBASE, WOODS, WOODS5 } from "../src/tileValues";

// The plan's own work: where it builds, given what the game server answers of each site. The server's answers, a
// station's perimeter and the cover with its road on each tile of it, are the rules', which Micropolis.Rules.Tests
// checks against stations built in a city; here a stand-in answers, and the playthrough asks the server itself.

const WIDTH = 48;
const HEIGHT = 32;
const PLANT = {x: 5, y: 5};
const FULL_FUNDING = 1000;

// A coal plant's four by four tiles, from the one above and left of its centre
function plantTilesOf(centre: Tile): Tile[] {
  return tilesIn({left: centre.x - 1, top: centre.y - 1, right: centre.x + 2, bottom: centre.y + 2});
}

// The plant's tiles, the grid the tests start from
const plantTiles = plantTilesOf(PLANT);

// A map of clear land with a coal plant whose centre is the one given, then the tiles given, as raw values
function saveWith(tiles: [Tile, number][], plant: Tile = PLANT): GameSave {
  const values = new Array<number>(WIDTH * HEIGHT).fill(DIRT);
  plantTilesOf(plant).forEach((tile, i) => {
    values[tile.x + tile.y * WIDTH] = (POWERPLANT - 5 + i) | CONDBIT;
  });
  values[plant.x + plant.y * WIDTH] = POWERPLANT | CONDBIT | ZONEBIT;
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

function treesAround(save: GameSave, centre: Tile): Tile[] {
  return tilesAround(centre, 2).filter((tile) => tileAt(save, tile) >= TREEBASE && tileAt(save, tile) <= WOODS5);
}

// The stand-in's cover falls in bands with how far the station's road is from the target, so the sites within a band
// tie
const STRONG_BAND = 7;
const WEAK_BAND = 12;
const BANDS = {strong: 300, weak: 150, none: 50};

// The stand-in for the server: the tiles on the map two from the centre beside the station's sides, row by row, each
// with the cover in the band its distance from the target falls in
function reachOn(save: GameSave): StationReach {
  return async (station, target) => ({
    perimeter: tilesAround(station, 2)
      .filter((tile) => inBounds(save, tile) && chebyshev(tile, station) === 2 &&
        Math.min(Math.abs(tile.x - station.x), Math.abs(tile.y - station.y)) <= 1)
      .map((tile) => {
        const distance = chebyshev(tile, target);
        return {...tile, cover: distance <= STRONG_BAND ? BANDS.strong : distance <= WEAK_BAND ? BANDS.weak : BANDS.none};
      }),
  });
}

// The cover the stand-in gives the fire from the station with its road where the plan put it
async function coverOf(save: GameSave, plan: StationPlan, fire: Tile): Promise<number> {
  const {perimeter} = await reachOn(save)(plan.centre, fire);
  return perimeter.find((tile) => tile.x === plan.road.x && tile.y === plan.road.y)!.cover;
}

function planFor(save: GameSave, fire: Tile): Promise<StationPlan> {
  return planStation(save, fire, reachOn(save));
}

// The tiles a fire may reach before the station answers it, either way
const FIRE_REACH = 2;

// A line tile the wire tool lays on: clear land or trees, or a straight road the line crosses at right angles, so
// with its neighbours in the line above and below a road running across, or beside one running down. The tests' maps
// hold only roads without traffic.
function laysOn(save: GameSave, line: Tile[], i: number): boolean {
  const id = tileAt(save, line[i]);
  if (id === DIRT || (id >= TREEBASE && id <= WOODS5)) {
    return true;
  }

  const neighbours = [line[i - 1], line[i + 1]];
  return i < line.length - 1 && (id === ROADS || id === ROADS2) &&
    neighbours.every((tile) => tile === undefined || (id === ROADS ? tile.x === line[i].x : tile.y === line[i].y));
}

// What a plan must hold wherever the fire is: a station clear of the fire whose cover reaches it at the strongest,
// a road where the station looks for one, and a line that runs unbroken from beside the station to beside the grid,
// over tiles the wire tool lays on and out of the fire's reach, or none when the station touches the grid
async function expectAWorkingPlan(save: GameSave, plan: StationPlan, fire: Tile,
                                   grid: Tile[] = plantTiles): Promise<void> {
  const station = tilesAround(plan.centre, 1);
  const besideTheGrid = (tile: Tile) => grid.some((powered) => adjacent(tile, powered));
  const {perimeter} = await reachOn(save)(plan.centre, fire);

  expect(station.filter((tile) => chebyshev(tile, fire) <= FIRE_REACH)).toEqual([]);
  expect(perimeter.map(({x, y}) => ({x, y}))).toContainEqual(plan.road);
  expect(await coverOf(save, plan, fire)).toBeGreaterThan(STRONGEST_COVER);

  if (plan.line.length === 0) {
    expect(station.filter(besideTheGrid)).not.toEqual([]);
    return;
  }

  expect(station.filter((tile) => adjacent(tile, plan.line[0]))).not.toEqual([]);
  expect(besideTheGrid(plan.line[plan.line.length - 1])).toBe(true);
  expect(plan.line.slice(1).flatMap((tile, i) => adjacent(tile, plan.line[i]) ? [] : [[plan.line[i], tile]]))
    .toEqual([]);
  expect(plan.line.filter((tile) => chebyshev(tile, fire) <= FIRE_REACH)).toEqual([]);
  expect(plan.line.filter((_, i) => !laysOn(save, plan.line, i))).toEqual([]);
  expect(plan.line.filter((tile) => tile.x === plan.road.x && tile.y === plan.road.y)).toEqual([]);
}

describe("the fire stage's station plan", () => {

    it("builds near a fire in a forest, where the cover is strongest, and lines it to the plant", async () => {
        const fire = {x: 30, y: 20};
        const save = saveWith([...filled({left: 25, top: 15, right: 35, bottom: 25}, WOODS), [fire, FIRE]]);
        const plan = await planFor(save, fire);

        await expectAWorkingPlan(save, plan, fire);
        expect(await coverOf(save, plan, fire)).toBe(BANDS.strong);
    });

    it("builds where the cover is weaker but still strong enough when no site of the strongest has room", async () => {
        const fire = {x: 28, y: 20};
        const save = saveWith([...filled({left: 20, top: 12, right: 36, bottom: 28}, RIVER), [fire, FIRE]]);
        const plan = await planFor(save, fire);

        await expectAWorkingPlan(save, plan, fire);
        expect(await coverOf(save, plan, fire)).toBe(BANDS.weak);
    });

    it("fails, naming the fire, when no site with room covers it strongly enough", async () => {
        const fire = {x: 28, y: 20};
        const water = filled({left: 15, top: 7, right: 41, bottom: HEIGHT - 1}, RIVER);

        await expect(planFor(saveWith([...water, [fire, FIRE]]), fire))
            .rejects.toThrow("No site near the fire at (28, 20) covers it at the strongest");
    });

    it("chooses a site with the fewest trees around it", async () => {
        const fire = {x: 30, y: 20};
        const save = saveWith([...filled({left: 24, top: 16, right: 31, bottom: 23}, WOODS),
                               ...filled({left: 24, top: 16, right: 28, bottom: 20}, DIRT), [fire, FIRE]]);
        const plan = await planFor(save, fire);

        await expectAWorkingPlan(save, plan, fire);
        expect(treesAround(save, plan.centre)).toEqual([]);
    });

    // The road goes where the station looks for one first, which is the rules' to say
    it("builds the road on the first tile of the station's perimeter with room, in the order the server gives", async () => {
        const fire = {x: 30, y: 20};
        const save = saveWith([[fire, FIRE]]);
        const reversed: StationReach = async (station, target) => {
            const reach = await reachOn(save)(station, target);
            return {...reach, perimeter: [...reach.perimeter].reverse()};
        };

        const forwards = await planFor(save, fire);
        const backwards = await planStation(save, fire, reversed);

        expect(backwards.centre).toEqual(forwards.centre);
        const perimeter = (await reachOn(save)(forwards.centre, fire)).perimeter.map(({x, y}) => ({x, y}));
        expect(forwards.road).toEqual(perimeter[0]);
        expect(backwards.road).toEqual(perimeter[perimeter.length - 1]);
    });

    // As under a change that moves the stream, the fire on the city's own power line: the plan keeps clear of it, and
    // of the line beyond it, which the fire cuts off from the plant
    it("keeps the station and its line clear of a fire on the city's power line, and lines it to the plant's side", async () => {
        const fire = {x: 20, y: 6};
        const cityLine = tilesIn({left: PLANT.x + 3, top: 6, right: 30, bottom: 6});
        const save = saveWith([...cityLine.map((tile): [Tile, number] => [tile, LHPOWER | CONDBIT]), [fire, FIRE]]);
        const plan = await planFor(save, fire);

        await expectAWorkingPlan(save, plan, fire, [...plantTiles, ...cityLine.filter((tile) => tile.x < fire.x - FIRE_REACH)]);
    });

    // The fire beside the city's line, with water keeping the station to the side of the fire away from the plant: the
    // line tiles within the fire's reach may burn, so the line runs round to the plant's side of them
    it("counts the city's line beyond the tiles beside the fire as cut off", async () => {
        const fire = {x: 20, y: 5};
        const cityLine = tilesIn({left: PLANT.x + 3, top: 6, right: 30, bottom: 6});
        const save = saveWith([...cityLine.map((tile): [Tile, number] => [tile, LHPOWER | CONDBIT]),
                               ...filled({left: 12, top: 0, right: 19, bottom: 5}, RIVER), [fire, FIRE]]);
        const plan = await planFor(save, fire);

        await expectAWorkingPlan(save, plan, fire, [...plantTiles, ...cityLine.filter((tile) => tile.x < fire.x - FIRE_REACH)]);
    });

    it("ends the line where the station touches the grid", async () => {
        const fire = {x: 13, y: 5};
        const save = saveWith([...filled({left: 8, top: 0, right: WIDTH - 1, bottom: HEIGHT - 1}, RIVER),
                               ...filled({left: 8, top: 3, right: 10, bottom: 7}, DIRT), [fire, FIRE]]);
        const plan = await planFor(save, fire);

        await expectAWorkingPlan(save, plan, fire);
        expect(plan.line).toEqual([]);
    });

    // A plant at the map's right edge, in the rows of the only site, at the left edge: the tile left of the site's left
    // column is no tile, though its index is the plant's in the row above
    it("never counts a tile past the map's side edge as beside the grid", async () => {
        const fire = {x: 6, y: 2};
        const plant = {x: WIDTH - 3, y: 1};
        const water = [
            {left: 3, top: 0, right: WIDTH - 6, bottom: 7},
            {left: WIDTH - 4, top: 4, right: WIDTH - 1, bottom: 7},
        ].flatMap((rect) => filled(rect, RIVER));
        const save = saveWith([...water, [fire, FIRE]], plant);
        const plan = await planFor(save, fire);

        expect(plan.centre).toEqual({x: 1, y: 1});
        await expectAWorkingPlan(save, plan, fire, plantTilesOf(plant));
    });

    // A line of trees between the fire and the plant, with a gap in it that a shortest line can pass through
    it("prefers bare land to trees for the line", async () => {
        const fire = {x: 30, y: 20};
        const trees = filled({left: 20, top: 0, right: 20, bottom: HEIGHT - 1}, WOODS)
            .filter(([tile]) => tile.y !== 12);
        const save = saveWith([...trees, [fire, FIRE]]);
        const plan = await planFor(save, fire);

        await expectAWorkingPlan(save, plan, fire);
        expect(plan.line.filter((tile) => tile.x === 20)).toEqual([{x: 20, y: 12}]);
    });

    it("crosses a road at right angles to reach the grid", async () => {
        const fire = {x: 30, y: 20};
        const save = saveWith([...filled({left: 15, top: 0, right: 15, bottom: HEIGHT - 1}, ROADS2), [fire, FIRE]]);
        const plan = await planFor(save, fire);

        await expectAWorkingPlan(save, plan, fire);
        const crossing = plan.line.findIndex((tile) => tile.x === 15);
        expect(plan.line.slice(crossing - 1, crossing + 2).map((tile) => tile.y))
            .toEqual(new Array(3).fill(plan.line[crossing].y));
    });

    // A band of trees between the station and the plant, with a road across it that a line running along it would
    // take for the cheapest way through, which the wire tool can't lay
    it("never runs a line along a road", async () => {
        const fire = {x: 30, y: 20};
        const save = saveWith([...filled({left: 12, top: 0, right: 18, bottom: HEIGHT - 1}, WOODS),
                               ...filled({left: 12, top: 15, right: 18, bottom: 15}, ROADS), [fire, FIRE]]);
        const plan = await planFor(save, fire);

        await expectAWorkingPlan(save, plan, fire);
    });

    it("fails, naming the fire, when no site near it has room", async () => {
        const fire = {x: 30, y: 20};

        await expect(planFor(saveWith([...filled({left: 14, top: 8, right: 47, bottom: 31}, RIVER), [fire, FIRE]]), fire))
            .rejects.toThrow("No site near the fire at (30, 20)");
    });
});

describe("the fire department's cover in a save", () => {

    // Blocks of eight tiles a side, held row by row
    it("is the fire analysis's figure for the tile's block", () => {
        const blocksAcross = WIDTH / 8;
        const covered = {x: 3, y: 2};
        const strongest = 218;
        const cover = new Array<number>(blocksAcross * (HEIGHT / 8)).fill(0);
        cover[blocksAcross * covered.y + covered.x] = strongest;
        const save = {...saveWith([]), scannedState: {blockMaps: {fireStationEffectMap: cover}}};

        // The covered block's first and last tiles, then the tiles just past it to the right and below
        const tiles = [{x: 24, y: 16}, {x: 31, y: 23}, {x: 32, y: 23}, {x: 31, y: 24}];
        expect(tiles.map((tile) => savedFireCover(save, tile))).toEqual([strongest, strongest, 0, 0]);
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
