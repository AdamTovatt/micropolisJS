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

import { BIT_MASK } from "../src/tileFlags";
import { FIREBASE, LTRFBASE, POWERBASE, ROADBASE } from "../src/tileValues";
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

// A burning tile: one of the eight fire tiles, as the fire's animation runs through them
export function isFire(id: number): boolean {
  return id >= FIREBASE && id < ROADBASE;
}

// A road tile: plain road, a bridge, road with traffic, or a road crossing a power line or rail
export function isRoad(id: number): boolean {
  return id >= ROADBASE && id < POWERBASE;
}

// How many road ids there are without traffic, from ROADBASE: the traffic tiles repeat them in blocks as long, from
// LTRFBASE
const ROAD_IDS = LTRFBASE - ROADBASE;

// A road tile as the road without its traffic, so a straight road along a row is ROADS and one along a column ROADS2,
// whatever its traffic; any other tile as it is
export function normalizeRoad(id: number): number {
  return isRoad(id) ? ROADBASE + (id - ROADBASE) % ROAD_IDS : id;
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

// A block map, a value for each square block of blockSize tiles a side, as the simulation keeps its coarse maps: the
// values row by row, top row first, as a save holds them, block (x, y) at index width * y + x, with a block for the
// tiles left over at the right and bottom edges
export class BlockMap {
  readonly width: number;
  readonly height: number;
  private readonly values: readonly number[];

  constructor(mapWidth: number, mapHeight: number, readonly blockSize: number, values: readonly number[]) {
    this.width = Math.ceil(mapWidth / blockSize);
    this.height = Math.ceil(mapHeight / blockSize);
    if (values.length !== this.width * this.height) {
      throw new Error(`A ${this.width}x${this.height} block map has ${this.width * this.height} values, got ` +
                      `${values.length}`);
    }

    this.values = [...values];
  }

  get(blockX: number, blockY: number): number {
    return this.values[blockX + blockY * this.width];
  }

  // The value of the block the tile is in
  worldGet(x: number, y: number): number {
    return this.get(Math.floor(x / this.blockSize), Math.floor(y / this.blockSize));
  }
}

// A block map's value at a tile, as the save holds the map under its scanned state, by its name in the simulation's
// block maps and its block size there
export function savedBlockMapAt(save: GameSave, name: string, blockSize: number, tile: Tile): number {
  const blockMaps = (save.scannedState as {blockMaps: Record<string, number[]>}).blockMaps;
  return new BlockMap(save.map.width, save.map.height, blockSize, blockMaps[name]).worldGet(tile.x, tile.y);
}

// How many tiles apart two tiles are, counting a diagonal step as one
export function chebyshev(a: Tile, b: Tile): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}
