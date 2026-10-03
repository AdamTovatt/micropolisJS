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

import { BlockMap } from "../src/blockMap";
import { BIT_MASK } from "../src/tileFlags";
import type { GameSave, Tile } from "./player";

// Reading the map of a save, as the runner and the fire stage's plan read it

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

// The raw tile value, with its flags
export function rawTileAt(save: GameSave, tile: Tile): number {
  return save.map.tiles[tile.x + tile.y * save.map.width];
}

// The tile value, without its flags
export function tileAt(save: GameSave, tile: Tile): number {
  return rawTileAt(save, tile) & BIT_MASK;
}

export function inBounds(save: GameSave, tile: Tile): boolean {
  return tile.x >= 0 && tile.y >= 0 && tile.x < save.map.width && tile.y < save.map.height;
}

// The tiles where a tile value passes the test, row by row
export function tilesWhere(save: GameSave, test: (id: number) => boolean): Tile[] {
  const width = save.map.width;
  return save.map.tiles.flatMap((value, i) => test(value & BIT_MASK) ? [{x: i % width, y: Math.floor(i / width)}] : []);
}

// The tiles of a rectangle, row by row
export function tilesIn(rect: Rect): Tile[] {
  const tiles = [];
  for (let y = rect.top; y <= rect.bottom; y++) {
    for (let x = rect.left; x <= rect.right; x++) {
      tiles.push({x, y});
    }
  }

  return tiles;
}

// The tiles at most reach from the centre either way, row by row
export function tilesAround(centre: Tile, reach: number): Tile[] {
  return tilesIn({left: centre.x - reach, top: centre.y - reach, right: centre.x + reach, bottom: centre.y + reach});
}

// A block map's value at a tile, as the save holds the map under its scanned state, by its name in the simulation's
// block maps and its block size there
export function savedBlockMapAt(save: GameSave, name: string, blockSize: number, tile: Tile): number {
  const blockMaps = (save.scannedState as {blockMaps: Record<string, number[]>}).blockMaps;
  const map = new BlockMap(save.map.width, save.map.height, blockSize);
  map.load(blockMaps[name]);
  return map.worldGet(tile.x, tile.y);
}

// How many tiles apart two tiles are, counting a diagonal step as one
export function chebyshev(a: Tile, b: Tile): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}
