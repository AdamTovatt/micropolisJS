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

import { BIT_MASK } from "./tileFlags";
import { TILE_INVALID, WOODS_HIGH, WOODS_LOW } from "./tileValues";

// Where the map's woods and water lie, as the canopy over the world grass and its shadow, and the water and its shore,
// are drawn from them (docs/render-assets.md): each tile that lets the grass through draws the canopy and the water
// from the woods and the water of its own and the tiles round it, and each tile with woods about it the canopy's
// shadow, cast from the canopy up and left of it, toward the sun. Which tiles are water the art says (isWater of
// RenderArt in renderManifest.ts), since what stands over water, such as a bridge, is drawn as water too.

// The tiles round a tile whose woods and water its look is drawn from, on every side: two, since around reads two
// tiles up and left of it, the canopy's own three by three about each tile its shadow may be cast from
export const SURFACE_REACH = 2;

// The bits of around a tile's canopy and water are drawn from: the three by three about it
export const OWN_SURROUNDS = 0b1110_1110_1110_0000;

// Whether a tile id is woods, from which the map draws the canopy
export function isWoods(id: number): boolean {
  return id >= WOODS_LOW && id <= WOODS_HIGH;
}

// Where the tiles the test picks out by id lie round the tile at the column and row of a grid of tile values, width a
// row, as bits: bit (dy + 2) * 4 + (dx + 2) set where the tile dx across and dy down from it is one, for dx and dy from
// -2 to 1, so bit 10 is the tile's own: the three by three about the tile its canopy and water are drawn from, and
// about the tiles up and left of it, which may cast the canopy's shadow; the shaders read them back in surfaceAt. A
// tile past the grid's edge, or of no value, takes the id of the tile nearest it, as if the map ran on as at its edge,
// so woods and water at the map's edge reach it. The tiles a frame reads are the map's or reach SURFACE_REACH tiles
// past those in view, so every tile in view has its neighbours.
export function around(tiles: {width: number, height: number, values: readonly number[]}, column: number, row: number,
                       is: (id: number) => boolean): number {
  const {width, height, values} = tiles;
  const onMap = (x: number, y: number) => x >= 0 && x < width && y >= 0 && y < height &&
    values[y * width + x] !== TILE_INVALID;
  // The nearest of the tiles from the tile to the one d along, the tile's own if none is on the map
  const nearest = (along: number, d: number, on: (at: number) => boolean) => {
    for (let at = along + d; at !== along; at -= Math.sign(d)) {
      if (on(at)) {
        return at;
      }
    }
    return along;
  };
  let bits = 0;
  for (let dy = -2; dy <= 1; dy++) {
    const y = nearest(row, dy, (at) => onMap(column, at));
    for (let dx = -2; dx <= 1; dx++) {
      const x = nearest(column, dx, (at) => onMap(at, row));
      if (is(values[y * width + x] & BIT_MASK)) {
        bits |= 1 << ((dy + 2) * 4 + dx + 2);
      }
    }
  }
  return bits;
}
