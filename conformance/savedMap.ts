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

import { BIT_MASK } from "../src/tileFlags";

// A map as a save holds its tiles, read as the simulation's modules read a map
export function savedMap({width, height, tiles}: {width: number, height: number, tiles: number[]}) {
  const getRawValue = (x: number, y: number) => tiles[y * width + x];
  const getTileValue = (x: number, y: number) => getRawValue(x, y) & BIT_MASK;
  return {
    width,
    height,
    testBounds: (x: number, y: number) => x >= 0 && x < width && y >= 0 && y < height,
    getRawValue,
    getTileValue,
    getTile: (x: number, y: number) => ({getRawValue: () => getRawValue(x, y), getValue: () => getTileValue(x, y)}),
  };
}

export type SavedMap = ReturnType<typeof savedMap>;
