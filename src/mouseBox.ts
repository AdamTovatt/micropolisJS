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

const LINE_WIDTH = 3;

interface Point {
  x: number;
  y: number;
}

// The rectangle to stroke, in canvas pixels
interface MouseBoxRect extends Point {
  width: number;
  height: number;
}

// The rectangle to stroke for a box around the area at pos, width by height pixels. A canvas strokes a rectangle's
// line centred on its edges, so the rectangle is moved half a line out of the area, and the line clears it.
function mouseBoxRect(pos: Point, width: number, height: number): MouseBoxRect {
  return {
    x: pos.x - LINE_WIDTH / 2,
    y: pos.y - LINE_WIDTH / 2,
    width: width + LINE_WIDTH,
    height: height + LINE_WIDTH,
  };
}

// Outlines the area at pos, width by height pixels, in the colour
function drawMouseBox(canvas: HTMLCanvasElement, pos: Point, width: number, height: number, colour: string): void {
  const rect = mouseBoxRect(pos, width, height);

  const ctx = canvas.getContext("2d")!;
  ctx.lineWidth = LINE_WIDTH;
  ctx.strokeStyle = colour;
  ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
}

export { LINE_WIDTH, drawMouseBox, mouseBoxRect };
