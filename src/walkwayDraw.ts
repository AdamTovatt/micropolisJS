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

import { NINTHS_PER_SIDE } from "./protocol";
import { HBRDG0, HBRDG3, LASTRAIL, LASTROAD, RAILBASE, ROADBASE, VBRDG0, VBRDG3 } from "./tileValues";
import { carriageway, kindAt, kindNumber, locateNinth, track } from "./walkwayValues";

// Where the map's walkways lie, as the map draws them over each tile's ground (docs/render-assets.md): a path on the
// ninths that hold walkway, joined where ninths meet along an edge, across a tile's edge too, gravel on open land and in
// parks and grey paving on road and rail, and on a road's carriageway a crossing's stripes.

// The walkway values of a grid of tiles, width a row
interface WalkwayGrid {
  width: number;
  height: number;
  walkways: readonly number[];
}

// The kind on the ninth at (nx, ny) of the grid of ninths of a grid of tiles, numbered as kindNumber numbers it, or 0
// for none or past the grid's edge, with its tile's index in the grid
function kindOnGrid(tiles: WalkwayGrid, nx: number, ny: number): {kind: number, index: number, n: number} {
  const {tile, n} = locateNinth(nx, ny);
  if (tile.x < 0 || tile.x >= tiles.width || tile.y < 0 || tile.y >= tiles.height) {
    return {kind: 0, index: -1, n};
  }
  const index = tile.y * tiles.width + tile.x;
  return {kind: kindAt(tiles.walkways[index], n), index, n};
}

// The ninths a tile's walkways are drawn from: its own three by three and the ring of ninths round them, five by five,
// a bit for each that holds walkway of any kind, bit wy * 5 + wx for the ninth wx across and wy down from the ring's
// top-left, so the tile's own ninth n, numbered row by row as a walkway value numbers them, is bit
// (n / 3 + 1) * 5 + n % 3 + 1; the shaders read them back in walkwayAt
export const WINDOW = NINTHS_PER_SIDE + 2;

function windowBit(wx: number, wy: number): number {
  return wy * WINDOW + wx;
}

// The window of walkway round the tile at the column and row of a grid of walkway values: the tile's own ninths and
// those of the tiles beside it that touch them. A tile past the grid's edge holds none. The tiles a frame reads reach
// past those in view, so every tile in view has its neighbours.
export function walkwaysAround(tiles: WalkwayGrid, column: number, row: number): number {
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
      if (kindOnGrid(tiles, column * NINTHS_PER_SIDE + wx - 1, row * NINTHS_PER_SIDE + wy - 1).kind !== 0) {
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

// The ninths of a tile of the id that an underpass goes under: its road's carriageway, or every ninth of a tile of
// rail, whose double track fills it, so an underpass's stairs on rail go down beside the tile, never over its track
export function underWay(id: number): number {
  return track(id) !== 0 ? ALL_NINTHS : carriageway(id);
}

// Every ninth of a tile
const ALL_NINTHS = (1 << (NINTHS_PER_SIDE * NINTHS_PER_SIDE)) - 1;

// The ninths that go under the road or the rail round the tile at the column and row of a grid of walkway values,
// whose tiles' ids idAt gives by their index in it: those of its own ninths, a bit 1 << n for each ninth n,
// and those of the ninths beside its edges in the tiles beside it, three a side, north, east, south then west, each
// side's from its top-left, a bit 1 << (3 * side + k) for the kth, from which the shader draws a mouth's stairs beside
// them. A ninth goes under where it holds an underpass on a ninth its tile's way goes under (underWay).
export function underAround(tiles: WalkwayGrid, idAt: (index: number) => number, column: number,
                            row: number): {own: number, ring: number} {
  const goesUnder = (nx: number, ny: number): boolean => {
    const {kind, index, n} = kindOnGrid(tiles, nx, ny);
    return kind === UNDERPASS && (underWay(idAt(index)) & (1 << n)) !== 0;
  };

  const left = column * NINTHS_PER_SIDE;
  const top = row * NINTHS_PER_SIDE;
  let own = 0;
  for (let n = 0; n < NINTHS_PER_SIDE * NINTHS_PER_SIDE; n++) {
    if (goesUnder(left + n % NINTHS_PER_SIDE, top + Math.floor(n / NINTHS_PER_SIDE))) {
      own |= 1 << n;
    }
  }
  let ring = 0;
  for (let k = 0; k < NINTHS_PER_SIDE; k++) {
    const beside: [number, number][] = [[left + k, top - 1], [left + NINTHS_PER_SIDE, top + k],
                                        [left + k, top + NINTHS_PER_SIDE], [left - 1, top + k]];
    beside.forEach(([nx, ny], side) => {
      if (goesUnder(nx, ny)) {
        ring |= 1 << (NINTHS_PER_SIDE * side + k);
      }
    });
  }
  return {own, ring};
}

// The kinds the drawing tells apart, as a walkway value numbers them
const UNDERPASS = kindNumber("underpass");
const FOOTBRIDGE = kindNumber("footbridge");

// The parts of a tile the paths over it can show on, from the window of walkway round it (walkwaysAround) and its own
// ninths that go under (underAround), as rectangles of its ninths, so the paths pass draws no more of the tile than its
// paths: each of its ninths that holds walkway and doesn't go under, and each that holds none but has a corner three of
// whose four ninths hold walkway, the inside of a turn, which the path rounds into. Each rectangle is packed as
// x | y << 2 | width << 4 | height << 6, in ninths from the tile's top-left; as few as a greedy walk row by row
// finds, each as wide as it runs, then as tall as the rows under it run as wide.
export function pathParts(around: number, under: number): number[] {
  const at = (wx: number, wy: number): number => (around >> windowBit(wx, wy)) & 1;
  let shows = 0;
  for (let n = 0; n < NINTHS_PER_SIDE * NINTHS_PER_SIDE; n++) {
    const wx = n % NINTHS_PER_SIDE + 1;
    const wy = Math.floor(n / NINTHS_PER_SIDE) + 1;
    const turn = [[-1, -1], [1, -1], [-1, 1], [1, 1]].some(([dx, dy]) =>
      at(wx + dx, wy) + at(wx, wy + dy) + at(wx + dx, wy + dy) === 3);
    if (at(wx, wy) === 1 ? (under & (1 << n)) === 0 : turn) {
      shows |= 1 << n;
    }
  }

  const parts: number[] = [];
  const free = (x: number, y: number): boolean => (shows & (1 << (y * NINTHS_PER_SIDE + x))) !== 0;
  for (let y = 0; y < NINTHS_PER_SIDE; y++) {
    for (let x = 0; x < NINTHS_PER_SIDE; x++) {
      if (!free(x, y)) {
        continue;
      }
      let width = 1;
      while (x + width < NINTHS_PER_SIDE && free(x + width, y)) {
        width++;
      }
      let height = 1;
      const rowFree = (row: number): boolean => {
        for (let dx = 0; dx < width; dx++) {
          if (!free(x + dx, row)) {
            return false;
          }
        }
        return true;
      };
      while (y + height < NINTHS_PER_SIDE && rowFree(y + height)) {
        height++;
      }
      for (let dy = 0; dy < height; dy++) {
        for (let dx = 0; dx < width; dx++) {
          shows &= ~(1 << ((y + dy) * NINTHS_PER_SIDE + x + dx));
        }
      }
      parts.push(x | y << PART_BITS | width << 2 * PART_BITS | height << 3 * PART_BITS);
    }
  }
  return parts;
}

// The bits each of a part's place and size takes, as pathParts packs them
export const PART_BITS = 2;

// The decks of footbridges round the tile at the column and row of a grid of walkway values that its
// footbridges' shadows are cast from: its own ninths and those up and left of them, four by four, a bit wy * 4 + wx for
// the ninth wx across and wy down from the ninth up and left of its top-left one, for each that holds a footbridge, and
// for each of those whose deck runs down, where the ninth north or south of it holds walkway of any kind, as the ground
// pass lays it, a bit the same in runsDown; the deck runs across the other ninths
export function decksAround(tiles: WalkwayGrid, column: number, row: number): {decks: number, runsDown: number} {
  const kindOn = (nx: number, ny: number): number => kindOnGrid(tiles, nx, ny).kind;

  let decks = 0;
  let runsDown = 0;
  for (let wy = 0; wy < DECK_WINDOW; wy++) {
    for (let wx = 0; wx < DECK_WINDOW; wx++) {
      const nx = column * NINTHS_PER_SIDE + wx - 1;
      const ny = row * NINTHS_PER_SIDE + wy - 1;
      if (kindOn(nx, ny) !== FOOTBRIDGE) {
        continue;
      }
      const bit = 1 << (wy * DECK_WINDOW + wx);
      decks |= bit;
      if (kindOn(nx, ny - 1) !== 0 || kindOn(nx, ny + 1) !== 0) {
        runsDown |= bit;
      }
    }
  }
  return {decks, runsDown};
}

// The side of the window of decks, a tile's ninths and those up and left of them
export const DECK_WINDOW = NINTHS_PER_SIDE + 1;
