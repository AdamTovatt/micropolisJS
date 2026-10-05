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
import { chebyshev, Rect, tileAt, tilesAround, tilesIn } from "../e2e/savedMap";
import { planStation, runsOf, savedFireCover, stationCover, StationPlan, STRONGEST_COVER } from "../e2e/stationSite";
import { CONDBIT, ZONEBIT } from "../src/tileFlags";
import { repositoryJson } from "./helpers/repository";
import { DIRT, FIRE, LHPOWER, POWERPLANT, RIVER, ROADS, ROADS2, TREEBASE, WOODS, WOODS5 } from "../src/tileValues";

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

function block(tile: Tile): Tile {
  return {x: Math.floor(tile.x / 8), y: Math.floor(tile.y / 8)};
}

function treesAround(save: GameSave, centre: Tile): Tile[] {
  return tilesAround(centre, 2).filter((tile) => tileAt(save, tile) >= TREEBASE && tileAt(save, tile) <= WOODS5);
}

// The cover at the fire of a station of full strength at the centre, as the game's fire analysis smooths it
function coverAt(save: GameSave, centre: Tile, fire: Tile): number {
  return stationCover(WIDTH, HEIGHT, centre, save.budget.fireEffect).worldGet(fire.x, fire.y);
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
function expectAWorkingPlan(save: GameSave, plan: StationPlan, fire: Tile, grid: Tile[] = plantTiles): void {
  const station = tilesAround(plan.centre, 1);
  const besideTheGrid = (tile: Tile) => grid.some((powered) => adjacent(tile, powered));

  expect(station.filter((tile) => chebyshev(tile, fire) <= FIRE_REACH)).toEqual([]);
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
  expect(plan.line.filter((tile) => chebyshev(tile, fire) <= FIRE_REACH)).toEqual([]);
  expect(plan.line.filter((_, i) => !laysOn(save, plan.line, i))).toEqual([]);
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

        expectAWorkingPlan(save, plan, fire, [...plantTiles, ...cityLine.filter((tile) => tile.x < fire.x - FIRE_REACH)]);
    });

    // The fire beside the city's line, with water keeping the station to the side of the fire away from the plant: the
    // line tiles within the fire's reach may burn, so the line runs round to the plant's side of them
    it("counts the city's line beyond the tiles beside the fire as cut off", () => {
        const fire = {x: 20, y: 5};
        const cityLine = tilesIn({left: PLANT.x + 3, top: 6, right: 30, bottom: 6});
        const save = saveWith([...cityLine.map((tile): [Tile, number] => [tile, LHPOWER | CONDBIT]),
                               ...filled({left: 12, top: 0, right: 19, bottom: 5}, RIVER), [fire, FIRE]]);
        const plan = planStation(save, fire);

        expectAWorkingPlan(save, plan, fire, [...plantTiles, ...cityLine.filter((tile) => tile.x < fire.x - FIRE_REACH)]);
    });

    it("ends the line where the station touches the grid", () => {
        const fire = {x: 13, y: 5};
        const save = saveWith([...filled({left: 8, top: 0, right: WIDTH - 1, bottom: HEIGHT - 1}, RIVER),
                               ...filled({left: 8, top: 3, right: 10, bottom: 7}, DIRT), [fire, FIRE]]);
        const plan = planStation(save, fire);

        expectAWorkingPlan(save, plan, fire);
        expect(plan.line).toEqual([]);
    });

    // A plant at the map's right edge, in the rows of the only site, at the left edge: the tile left of the site's left
    // column is no tile, though its index is the plant's in the row above
    it("never counts a tile past the map's side edge as beside the grid", () => {
        const fire = {x: 6, y: 2};
        const plant = {x: WIDTH - 3, y: 1};
        const water = [
            {left: 3, top: 0, right: WIDTH - 6, bottom: 7},
            {left: WIDTH - 4, top: 4, right: WIDTH - 1, bottom: 7},
        ].flatMap((rect) => filled(rect, RIVER));
        const save = saveWith([...water, [fire, FIRE]], plant);
        const plan = planStation(save, fire);

        expect(plan.centre).toEqual({x: 1, y: 1});
        expectAWorkingPlan(save, plan, fire, plantTilesOf(plant));
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

    // A band of trees between the station and the plant, with a road across it that a line running along it would
    // take for the cheapest way through, which the wire tool can't lay
    it("never runs a line along a road", () => {
        const fire = {x: 30, y: 20};
        const save = saveWith([...filled({left: 12, top: 0, right: 18, bottom: HEIGHT - 1}, WOODS),
                               ...filled({left: 12, top: 15, right: 18, bottom: 15}, ROADS), [fire, FIRE]]);
        const plan = planStation(save, fire);

        expectAWorkingPlan(save, plan, fire);
    });

    it("fails, naming the fire, when no site near it has room", () => {
        const fire = {x: 30, y: 20};

        expect(() => planStation(saveWith([...filled({left: 14, top: 8, right: 47, bottom: 31}, RIVER), [fire, FIRE]]),
                                 fire))
            .toThrow("No site near the fire at (30, 20)");
    });
});

describe("a station's cover", () => {

    // Each block's cover, row by row, as the C# rules' fire analysis spreads a station's, which the fixture tool writes
    // to conformance/stationCover.json
    const spread = repositoryJson<{mapWidth: number, mapHeight: number,
                                   cases: {centre: Tile, fireEffect: number, cover: number[][]}[]}>("conformance/stationCover.json");

    it.each(spread.cases.map((spreadCase) => [spreadCase.centre, spreadCase.fireEffect, spreadCase]))(
        "spreads as the game spreads it, from a station at %o with a fire effect of %d", (_, __, {centre, fireEffect, cover}) => {
            const spreadHere = stationCover(spread.mapWidth, spread.mapHeight, centre, fireEffect);

            expect(cover.map((row, y) => row.map((___, x) => spreadHere.get(x, y)))).toEqual(cover);
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
