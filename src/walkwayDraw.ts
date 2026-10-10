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

import { BITS_PER_NINTH, NINTHS_PER_SIDE } from "./protocol";
import { HBRDG0, HBRDG3, LASTRAIL, LASTROAD, RAILBASE, ROADBASE, VBRDG0, VBRDG3 } from "./tileValues";
import { ROAD_EAST, ROAD_NORTH, ROAD_SOUTH, ROAD_WEST, roadWays } from "./trafficTiles";

// Where the map's walkways lie, as the map draws them over each tile's ground (docs/render-assets.md): a path on the
// ninths that hold walkway, joined where ninths meet along an edge, across a tile's edge too, gravel on open land and in
// parks and grey paving on road and rail, and on a road's carriageway a crossing's stripes.

// The ninths a tile's walkways are drawn from: its own three by three and the ring of ninths round them, five by five,
// a bit for each that holds walkway of any kind, bit wy * 5 + wx for the ninth wx across and wy down from the ring's
// top-left, so the tile's own ninth n, numbered row by row as a walkway value numbers them, is bit
// (n / 3 + 1) * 5 + n % 3 + 1; the shaders read them back in walkwayAt
export const WINDOW = NINTHS_PER_SIDE + 2;

function windowBit(wx: number, wy: number): number {
  return wy * WINDOW + wx;
}

// Whether a tile's walkway value holds walkway on its ninth n
function holds(walkway: number, n: number): boolean {
  return ((walkway >> (BITS_PER_NINTH * n)) & ((1 << BITS_PER_NINTH) - 1)) !== 0;
}

// The window of walkway round the tile at the column and row of a grid of walkway values, width a row: the tile's own
// ninths and those of the tiles beside it that touch them. A tile past the grid's edge holds none. The tiles a frame
// reads reach past those in view, so every tile in view has its neighbours.
export function walkwaysAround(tiles: {width: number, height: number, walkways: readonly number[]}, column: number,
                               row: number): number {
  const {width, height, walkways} = tiles;
  // Most tiles have no walkway in or beside them, and none round them
  let near = false;
  for (let y = Math.max(row - 1, 0); y <= Math.min(row + 1, height - 1) && !near; y++) {
    for (let x = Math.max(column - 1, 0); x <= Math.min(column + 1, width - 1); x++) {
      near ||= walkways[y * width + x] !== 0;
    }
  }
  if (!near) {
    return 0;
  }

  let bits = 0;
  for (let wy = 0; wy < WINDOW; wy++) {
    for (let wx = 0; wx < WINDOW; wx++) {
      // The ninth's place on the grid of ninths, from the tile's top-left ninth
      const nx = column * NINTHS_PER_SIDE + wx - 1;
      const ny = row * NINTHS_PER_SIDE + wy - 1;
      const x = Math.floor(nx / NINTHS_PER_SIDE);
      const y = Math.floor(ny / NINTHS_PER_SIDE);
      if (x < 0 || x >= width || y < 0 || y >= height) {
        continue;
      }
      const n = (ny - y * NINTHS_PER_SIDE) * NINTHS_PER_SIDE + nx - x * NINTHS_PER_SIDE;
      if (holds(walkways[y * width + x], n)) {
        bits |= 1 << windowBit(wx, wy);
      }
    }
  }
  return bits;
}

// Whether a path on a tile of the id is grey paving, as on a road or rail, a bridge or a tunnel; elsewhere, on open land
// and in parks, it is gravel
export function isPaved(id: number): boolean {
  return (id >= ROADBASE && id <= LASTROAD) || (id >= RAILBASE && id <= LASTRAIL) ||
    (id >= HBRDG0 && id <= HBRDG3) || (id >= VBRDG0 && id <= VBRDG3);
}

// The ninths of a tile of the id that are a road's carriageway, a bit 1 << n for each ninth n, where a path is a
// crossing: the middle ninth and the middle of each side the road leaves by, or none off a road
export function carriageway(id: number): number {
  const ways = roadWays(id);
  if (ways === 0) {
    return 0;
  }

  let ninths = 1 << 4;
  const sides: [number, number][] = [[ROAD_NORTH, 1], [ROAD_EAST, 5], [ROAD_SOUTH, 7], [ROAD_WEST, 3]];
  for (const [way, n] of sides) {
    if ((ways & way) !== 0) {
      ninths |= 1 << n;
    }
  }
  return ninths;
}
