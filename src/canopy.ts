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

// Where the map's woods lie, as the canopy over the world grass is drawn from them (docs/render-assets.md): each tile
// that lets the grass through draws the canopy from the woods of its own and the tiles round it.

// The tiles round a tile whose woods its canopy is drawn from, on every side: one, since woodsAround reads the three by
// three tiles about it
export const CANOPY_REACH = 1;

// Whether a tile id is woods, from which the map draws the canopy
export function isWoods(id: number): boolean {
  return id >= WOODS_LOW && id <= WOODS_HIGH;
}

// The woods round the tile at the column and row of a grid of tile values, width a row, as bits: bit (dy + 1) * 3 +
// (dx + 1) set where the tile dx across and dy down from it is woods, for dx and dy from -1 to 1, so bit 4 is the
// tile's own; the ground shader reads them back in woodsAt. A tile past the grid's edge, or of no
// value, takes the woods of the tile nearest it, as if the map ran on as at its edge, so woods at the map's edge reach
// it. The tiles a frame reads are the map's or reach a tile past those in view, as far as a tile's look reaches, so
// every tile in view has its neighbours.
export function woodsAround(tiles: {width: number, height: number, values: readonly number[]}, column: number,
                            row: number): number {
  const {width, height, values} = tiles;
  const onMap = (x: number, y: number) => x >= 0 && x < width && y >= 0 && y < height &&
    values[y * width + x] !== TILE_INVALID;
  let woods = 0;
  for (let dy = -1; dy <= 1; dy++) {
    const y = onMap(column, row + dy) ? row + dy : row;
    for (let dx = -1; dx <= 1; dx++) {
      const x = onMap(column + dx, row) ? column + dx : column;
      if (isWoods(values[y * width + x] & BIT_MASK)) {
        woods |= 1 << ((dy + 1) * 3 + dx + 1);
      }
    }
  }
  return woods;
}
