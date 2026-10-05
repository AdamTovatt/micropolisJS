/* micropolisJS. Adapted by Graeme McCutcheon from Micropolis.
 * Modified in Adam Tovatt's continuation of micropolisJS. Copyright (C) 2026 Adam Tovatt
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

// The tile value painted at each position of a view, so an animation can carry on from the frame painted last
class TileHistory {
  private data = new Map<string, number>();

  clear(): void {
    this.data.clear();
  }

  // The tile painted at the position, or undefined if none was recorded
  getTile(x: number, y: number): number | undefined {
    return this.data.get(toKey(x, y));
  }

  setTile(x: number, y: number, value: number): void {
    this.data.set(toKey(x, y), value);
  }
}

function toKey(x: number, y: number): string {
  return `${x},${y}`;
}

export { TileHistory };
