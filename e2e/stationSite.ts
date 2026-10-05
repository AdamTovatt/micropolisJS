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

import { CONDBIT } from "../src/tileFlags";
import { DIRT, NUCLEAR, POWERPLANT, ROADS, ROADS2, TREEBASE, WOODS5 } from "../src/tileValues";
import type { GameSave, Player, Tile } from "./player";
import {
  BlockMap, chebyshev, inBounds, isFire, normalizeRoad, rawTileAt, savedBlockMapAt, tileAt, tilesAround, tilesIn,
  tilesWhere,
} from "./savedMap";

// Where the playthrough's fire stage builds its fire station, chosen from the city as the fire left it, so the stage
// holds wherever the random stream lands the fire: a site whose cover reaches the fire, a road beside it, and a power
// line to the grid.

export interface StationPlan {
  // The station's centre
  centre: Tile;
  // A road tile on the station's perimeter, where the station looks for a road
  road: Tile;
  // A power line from beside the station to beside the grid, in order: empty when the station touches the grid
  line: Tile[];
}

// The fire department's cover above which a fire goes out on half the scans that test it, against one in eleven
// uncovered: the strongest there is
export const STRONGEST_COVER = 100;

// How far from a burning tile the plan keeps everything it builds and every tile it counts on the grid: a fire sets
// its burnable neighbours alight, and those spread again on later scans, at the weakest cover until the station's
// arrives, so a fire reaches two tiles out before the station answers it
const FIRE_MARGIN = 2;

// The block size of the fire station maps, as the Simulation constructor makes them
const FIRE_BLOCK_SIZE = 8;

// The longest run of power line laid in one drag, so both its ends fit in the view
const LONGEST_DRAG = 12;

// The station's perimeter, where Traffic.findPerimeterRoad looks for a road, in its order
const PERIMETER: Tile[] = [
  {x: -1, y: -2}, {x: 0, y: -2}, {x: 1, y: -2}, {x: 2, y: -1}, {x: 2, y: 0}, {x: 2, y: 1},
  {x: 1, y: 2}, {x: 0, y: 2}, {x: -1, y: 2}, {x: -2, y: 1}, {x: -2, y: 0}, {x: -2, y: -1},
];

const NEIGHBOURS: Tile[] = [{x: 1, y: 0}, {x: -1, y: 0}, {x: 0, y: 1}, {x: 0, y: -1}];

// What laying a line on a tile costs the plan: trees cost more than bare land or a road, since a fire spreads
// through them
const DIRT_COST = 1;
const TREE_COST = 3;

function isTree(id: number): boolean {
  return id >= TREEBASE && id <= WOODS5;
}

function step(tile: Tile, by: Tile): Tile {
  return {x: tile.x + by.x, y: tile.y + by.y};
}

// The city around a fire, as the plan reads it
class FireSite {
  private readonly fires: Tile[];

  constructor(readonly save: GameSave) {
    this.fires = tilesWhere(save, isFire);
  }

  index(tile: Tile): number {
    return tile.x + tile.y * this.save.map.width;
  }

  // Further than FIRE_MARGIN from every burning tile
  clearOfFire(tile: Tile): boolean {
    return this.fires.every((fire) => chebyshev(fire, tile) > FIRE_MARGIN);
  }

  // Clear land or trees, which a building or a line clears with auto-bulldoze, clear of the fire
  buildable(tile: Tile): boolean {
    return inBounds(this.save, tile) && (tileAt(this.save, tile) === DIRT || isTree(tileAt(this.save, tile))) &&
      this.clearOfFire(tile);
  }

  // A straight road a line crosses at right angles going by step, as the wire tool lays a line over one
  crossable(tile: Tile, by: Tile): boolean {
    return inBounds(this.save, tile) && this.clearOfFire(tile) &&
      normalizeRoad(tileAt(this.save, tile)) === (by.y !== 0 ? ROADS : ROADS2);
  }

  // The tiles the power scan reaches from the plants through conducting tiles, leaving out those beside a fire,
  // which may burn and cut them off
  grid(): Set<number> {
    const plants = tilesWhere(this.save, (id) => id === POWERPLANT || id === NUCLEAR);
    const reached = new Set(plants.map((plant) => this.index(plant)));
    const queue = [...plants];

    for (let tile = queue.pop(); tile !== undefined; tile = queue.pop()) {
      for (const by of NEIGHBOURS) {
        const next = step(tile, by);
        if (inBounds(this.save, next) && !reached.has(this.index(next)) && this.clearOfFire(next) &&
            (rawTileAt(this.save, next) & CONDBIT) !== 0) {
          reached.add(this.index(next));
          queue.push(next);
        }
      }
    }

    return reached;
  }

  // The cover at the fire of a station alone at the centre, with power and a road, at the city's funding
  coverAt(centre: Tile, fire: Tile): number {
    const {width, height} = this.save.map;
    return stationCover(width, height, centre, this.save.budget.fireEffect).worldGet(fire.x, fire.y);
  }
}

// The fire department's cover of a station alone at the centre of a map of the size given, at the fire effect the
// city's funding gives it: as the scan records the station on the fire station map, and the fire analysis spreads it
// with three passes of smoothing
export function stationCover(mapWidth: number, mapHeight: number, centre: Tile, fireEffect: number): BlockMap {
  const width = Math.ceil(mapWidth / FIRE_BLOCK_SIZE);
  const height = Math.ceil(mapHeight / FIRE_BLOCK_SIZE);
  let cover = new Array<number>(width * height).fill(0);
  cover[Math.floor(centre.x / FIRE_BLOCK_SIZE) + Math.floor(centre.y / FIRE_BLOCK_SIZE) * width] = fireEffect;
  for (let pass = 0; pass < 3; pass++) {
    cover = smoothed(cover, width, height);
  }

  return new BlockMap(mapWidth, mapHeight, FIRE_BLOCK_SIZE, cover);
}

// A block map's values, row by row, width blocks to a row and height rows, smoothed as the fire analysis smooths the
// fire station map (SpreadStationCover in the C# rules' BlockMapUtils): each block's value and a quarter of the sum of
// the blocks beside it on the map, halved, each division dropping its fraction
function smoothed(blocks: readonly number[], width: number, height: number): number[] {
  const at = (x: number, y: number) => blocks[x + y * width];
  return blocks.map((value, i) => {
    const x = i % width;
    const y = Math.floor(i / width);
    const beside = (x > 0 ? at(x - 1, y) : 0) + (x < width - 1 ? at(x + 1, y) : 0) +
      (y > 0 ? at(x, y - 1) : 0) + (y < height - 1 ? at(x, y + 1) : 0);
    return Math.floor((value + Math.floor(beside / 4)) / 2);
  });
}

// The station's site near the fire, with its road and its line: the sites whose three by three tiles are all
// buildable and whose cover at the fire is the strongest, the most cover first, then the fewest trees around, then
// the nearest, and the first of them with a buildable tile on its perimeter for the road and a line to the grid
export function planStation(save: GameSave, fire: Tile): StationPlan {
  const site = new FireSite(save);
  const grid = site.grid();
  const trees = (centre: Tile) => tilesAround(centre, 2).filter((tile) => inBounds(save, tile) &&
                                                                          isTree(tileAt(save, tile))).length;

  // The fire's block and those around it, beyond which no station's cover reaches the fire at its strongest
  const block = {x: Math.floor(fire.x / FIRE_BLOCK_SIZE), y: Math.floor(fire.y / FIRE_BLOCK_SIZE)};
  const near = tilesIn({left: (block.x - 1) * FIRE_BLOCK_SIZE, top: (block.y - 1) * FIRE_BLOCK_SIZE,
                        right: (block.x + 2) * FIRE_BLOCK_SIZE - 1, bottom: (block.y + 2) * FIRE_BLOCK_SIZE - 1});

  const sites = near
    .filter((centre) => tilesAround(centre, 1).every((tile) => site.buildable(tile)))
    .map((centre) => ({centre, cover: site.coverAt(centre, fire)}))
    .filter(({cover}) => cover > STRONGEST_COVER)
    .map(({centre, cover}) => ({centre, key: [-cover, trees(centre), chebyshev(centre, fire), centre.y, centre.x]}));
  sites.sort((a, b) => {
    const differs = a.key.findIndex((value, i) => value !== b.key[i]);
    return differs === -1 ? 0 : a.key[differs] - b.key[differs];
  });

  for (const {centre} of sites) {
    const road = PERIMETER.map((offset) => step(centre, offset)).find((tile) => site.buildable(tile));
    if (road === undefined) {
      continue;
    }

    const line = lineToTheGrid(site, grid, centre, road);
    if (line !== null) {
      return {centre, road, line};
    }
  }

  throw new Error(`No site near the fire at (${fire.x}, ${fire.y}) covers it at the strongest and has room for a ` +
                  "fire station, a road beside it and a power line to the grid");
}

// The cheapest line over buildable tiles and across roads from beside the station to beside the grid, avoiding the
// road, or null
function lineToTheGrid(site: FireSite, grid: Set<number>, centre: Tile, road: Tile): Tile[] | null {
  const station = tilesAround(centre, 1);
  const stationTiles = new Set(station.map((tile) => site.index(tile)));
  const touchesTheGrid = (tile: Tile) => NEIGHBOURS.some((by) => inBounds(site.save, step(tile, by)) &&
                                                                 grid.has(site.index(step(tile, by))));

  if (station.some(touchesTheGrid)) {
    return [];
  }

  const open = (tile: Tile) => site.buildable(tile) && !stationTiles.has(site.index(tile)) &&
    site.index(tile) !== site.index(road);
  const stepCost = (tile: Tile) => (isTree(tileAt(site.save, tile)) ? TREE_COST : DIRT_COST);

  // The tiles a line from the tile takes going by step: the roads it crosses, then the open tile it lands on
  const lay = (from: Tile, by: Tile): Tile[] | null => {
    const tiles: Tile[] = [];
    let next = step(from, by);
    for (; site.crossable(next, by); next = step(next, by)) {
      tiles.push(next);
    }

    return open(next) ? [...tiles, next] : null;
  };

  // Dijkstra over small whole costs, with a list of tiles for each cost: each tile reached is a tile the line lands
  // on, with the tiles laid to reach it from the one before
  const spent = new Map<number, number>();
  type Landing = {from: Tile | null, laid: Tile[]};
  const previous = new Map<number, Landing>();
  const queues: Tile[][] = [];
  const reach = (from: Tile | null, laid: Tile[], costSoFar: number) => {
    const tile = laid[laid.length - 1];
    const total = costSoFar + laid.reduce((sum, at) => sum + stepCost(at), 0);
    if ((spent.get(site.index(tile)) ?? Infinity) <= total) {
      return;
    }

    spent.set(site.index(tile), total);
    previous.set(site.index(tile), {from, laid});
    (queues[total] ??= []).push(tile);
  };

  for (const tile of station) {
    for (const by of NEIGHBOURS) {
      const laid = lay(tile, by);
      if (laid !== null) {
        reach(null, laid, 0);
      }
    }
  }

  for (let total = 0; total < queues.length; total++) {
    for (const tile of queues[total] ?? []) {
      if (spent.get(site.index(tile)) !== total) {
        continue;
      }

      if (touchesTheGrid(tile)) {
        const line: Tile[] = [];
        for (let at: Tile | null = tile; at !== null;) {
          const {from, laid}: Landing = previous.get(site.index(at))!;
          line.unshift(...laid);
          at = from;
        }

        return line;
      }

      for (const by of NEIGHBOURS) {
        const laid = lay(tile, by);
        if (laid !== null) {
          reach(tile, laid, total);
        }
      }
    }
  }

  return null;
}

// The fire department's cover at the tile as the save holds it, from the last fire analysis
export function savedFireCover(save: GameSave, tile: Tile): number {
  return savedBlockMapAt(save, "fireStationEffectMap", FIRE_BLOCK_SIZE, tile);
}

// A line as straight runs of at most longest tiles, each from its first tile to its last, in order: each a drag of the
// line tool, or a click for a run of one
export function runsOf(line: Tile[], longest: number): [Tile, Tile][] {
  const runs: [Tile, Tile][] = [];
  let start = 0;

  for (let i = 1; i <= line.length; i++) {
    const turns = i < line.length && i - start >= 2 &&
      (line[i].x - line[i - 1].x !== line[i - 1].x - line[i - 2].x || line[i].y - line[i - 1].y !== line[i - 1].y - line[i - 2].y);
    if (i === line.length || turns || i - start === longest) {
      runs.push([line[start], line[i - 1]]);
      start = i;
    }
  }

  return runs;
}

// Builds the plan through the game's tools, scrolling each piece into view first: the station, its road, then the
// line, a drag or a click for each run
export async function buildStation(player: Player, plan: StationPlan): Promise<void> {
  await player.selectTool("fire");
  await player.showTiles(tilesAround(plan.centre, 1));
  await player.clickTile(plan.centre);

  await player.selectTool("road");
  await player.showTiles([plan.road]);
  await player.clickTile(plan.road);

  await player.selectTool("wire");
  for (const [from, to] of runsOf(plan.line, LONGEST_DRAG)) {
    await player.showTiles([from, to]);
    if (from.x === to.x && from.y === to.y) {
      await player.clickTile(from);
    } else {
      await player.dragTiles(from, to);
    }
  }
}
