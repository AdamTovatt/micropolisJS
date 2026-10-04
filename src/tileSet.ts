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

import { TILE_COUNT } from "./tileValues";

// The tile set, images/tiles.png: every tile id's 16 px tile, which the map's art draws from where the rendered art
// leaves the tile out

// Tiles must be 16px square
const TILE_SIZE = 16;
const TILES_PER_ROW = Math.sqrt(TILE_COUNT);
const ACCEPTABLE_DIMENSION = TILES_PER_ROW * TILE_SIZE;

// We expect tilesets to be square, and of the required width/height
function isAcceptableTileImage(width: number, height: number): boolean {
  return width === height && width === ACCEPTABLE_DIMENSION;
}

// Where a tile's image starts in the tileset image, in pixels: tiles run in rows, in order of their value
function tileImageOrigin(tileValue: number): {x: number, y: number} {
  return {
    x: tileValue % TILES_PER_ROW * TILE_SIZE,
    y: Math.floor(tileValue / TILES_PER_ROW) * TILE_SIZE,
  };
}

export { TILE_SIZE, isAcceptableTileImage, tileImageOrigin };
