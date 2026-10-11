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

import { latticeHash, lowbias32 } from "./grass";
import { NINTHS_PER_SIDE } from "./protocol";
import type { TreeArt } from "./renderManifest";
import { isPark } from "./surfaces";
import { BIT_MASK } from "./tileFlags";
import { TILE_INVALID } from "./tileValues";
import { ninthWindow, windowBit } from "./walkwayDraw";
import type { WalkwayGrid } from "./walkwayDraw";

// The trees standing on a park's ninths (docs/render-assets.md): which of a park tile's ninths hold a tree, from the
// chance the groves' noise gives each ninth and an integer hash of its place on the map's grid of ninths, as the world
// grass picks its tiles, so trees gather in groves round open glades, and parks vary and never shift; and which kind of
// tree, how large and where in its ninth, from further hashes. A ninth holding walkway never holds a tree, and a crown
// may reach over the ninths about its own only where they lie in a park and hold no walkway, so a path through a park
// keeps the trees round it and no crown ever covers it.

// A tree on a park tile: the ninth it stands on, numbered row by row as a walkway value numbers them, the kind of tree,
// by its number among the art's kinds, and its crown's square, from the tile's top-left, in ninths: its left, its top
// and its side
export interface ParkTree {
  n: number;
  kind: number;
  x: number;
  y: number;
  side: number;
}

// The grid of tiles a frame reads: their walkway values, and their raw values, TILE_INVALID off the map
export interface ParkGrid extends WalkwayGrid {
  values: readonly number[];
}

// The window of the ninths about the tile at the column and row of a grid that lie in a park and hold no walkway, where a
// tree may stand or its crown reach: the tile's own, and those of the tiles beside it that touch them, laid out as the
// walkways' window is (ninthWindow in walkwayDraw.ts). A tile past the grid's edge has none.
export function openParkAround(tiles: ParkGrid, column: number, row: number): number {
  const {values} = tiles;
  return ninthWindow(tiles, column, row, (kind, index) =>
    kind === 0 && values[index] !== TILE_INVALID && isPark(values[index] & BIT_MASK));
}

// The chance each ninth of the map holds a tree, from 0 to 1, row by row, as the trees' groves give it: their leafy
// share, moved by the groves' noise at the ninth's middle, baked once (bakeNoise in grass.ts) and held from 0 to 1
export function treeChances(trees: TreeArt, groves: Float32Array): Float32Array {
  return groves.map((noise) => Math.min(Math.max(trees.leafy + noise, 0), 1));
}

// The trees on the park tile at (x, y) on the map, the window of open park about it given (openParkAround), from the
// chance of the ninth at each place on the map's grid of ninths holding one (treeChances)
export function parkTrees(x: number, y: number, open: number, trees: TreeArt,
                          chance: (ninthX: number, ninthY: number) => number): ParkTree[] {
  const found: ParkTree[] = [];
  const isOpen = (wx: number, wy: number) => (open >> windowBit(wx, wy) & 1) === 1;
  for (let n = 0; n < NINTHS_PER_SIDE * NINTHS_PER_SIDE; n++) {
    const column = n % NINTHS_PER_SIDE;
    const row = Math.floor(n / NINTHS_PER_SIDE);
    // The ninth in the window
    const wx = column + 1;
    const wy = row + 1;
    if (!isOpen(wx, wy)) {
      continue;
    }
    const ninthX = x * NINTHS_PER_SIDE + column;
    const ninthY = y * NINTHS_PER_SIDE + row;
    // A whole number below 2 ** 32, which holds a tree where it falls under the ninth's chance of them
    const hash = latticeHash(ninthX, ninthY, trees.seed);
    if (hash >= chance(ninthX, ninthY) * 2 ** 32) {
      continue;
    }

    // Further hashes of the first, a byte each for the size and the place of its middle in its ninth
    const more = lowbias32(hash);
    const byte = (shift: number) => ((more >>> shift) & 0xff) / 0xff;
    const side = trees.smallest + (trees.largest - trees.smallest) * byte(0);
    const middleX = byte(8);
    const middleY = byte(16);
    // The crown's square, held to its own ninth on each side the three ninths beside it on that side don't all lie open
    const openColumn = (cx: number) => isOpen(cx, wy - 1) && isOpen(cx, wy) && isOpen(cx, wy + 1);
    const openRow = (cy: number) => isOpen(wx - 1, cy) && isOpen(wx, cy) && isOpen(wx + 1, cy);
    const half = side / 2;
    const left = openColumn(wx - 1) ? middleX - half : Math.max(middleX - half, 0);
    const right = openColumn(wx + 1) ? middleX + half : Math.min(middleX + half, 1);
    const top = openRow(wy - 1) ? middleY - half : Math.max(middleY - half, 0);
    const bottom = openRow(wy + 1) ? middleY + half : Math.min(middleY + half, 1);
    // Square again, in the middle of what is left, so a crown held back only ever shrinks within where it would be
    const held = Math.min(right - left, bottom - top);
    found.push({n, kind: lowbias32(more) % trees.kinds.length, x: column + (left + right - held) / 2,
                y: row + (top + bottom - held) / 2, side: held});
  }
  return found;
}
