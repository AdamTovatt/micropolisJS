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

import type { PixelPoint } from "./viewPosition";

const LINE_WIDTH = 3;

// The rectangle to stroke, in canvas pixels
interface MouseBoxRect extends PixelPoint {
  width: number;
  height: number;
}

// The rectangle to stroke for a box around the area at pos, width by height pixels. A canvas strokes a rectangle's
// line centred on its edges, so the rectangle is moved half a line out of the area, and the line clears it.
function mouseBoxRect(pos: PixelPoint, width: number, height: number): MouseBoxRect {
  return {
    x: pos.x - LINE_WIDTH / 2,
    y: pos.y - LINE_WIDTH / 2,
    width: width + LINE_WIDTH,
    height: height + LINE_WIDTH,
  };
}

// Outlines the area at pos, width by height pixels, in the colour
function drawMouseBox(canvas: HTMLCanvasElement, pos: PixelPoint, width: number, height: number, colour: string): void {
  const rect = mouseBoxRect(pos, width, height);

  const ctx = canvas.getContext("2d")!;
  ctx.lineWidth = LINE_WIDTH;
  ctx.strokeStyle = colour;
  ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
}

// A name beside a box: a tag in the box's colour, its text LABEL_FONT_PX high, starting LABEL_GAP right of the box's
// line
const LABEL_FONT_PX = 12;
const LABEL_PADDING = 3;
const LABEL_GAP = LINE_WIDTH + 2;

// The tag for a name textWidth pixels wide, beside the box whose area's top-right corner is at pos
function boxLabelRect(pos: PixelPoint, textWidth: number): MouseBoxRect {
  return {
    x: pos.x + LABEL_GAP,
    y: pos.y - LINE_WIDTH / 2,
    width: Math.ceil(textWidth) + 2 * LABEL_PADDING,
    height: LABEL_FONT_PX + 2 * LABEL_PADDING,
  };
}

// Black or white, whichever reads better on the colour, a "#rrggbb", by its luminance as Rec. 601 weighs it
function labelTextColour(colour: string): string {
  const value = parseInt(colour.slice(1), 16);
  const luminance = 0.299 * (value >> 16) + 0.587 * ((value >> 8) & 0xff) + 0.114 * (value & 0xff);
  return luminance > 140 ? "black" : "white";
}

// Writes the name in a tag of the colour, a "#rrggbb", beside the box whose area's top-right corner is at pos, and
// gives the rectangle it covers
function drawBoxLabel(canvas: HTMLCanvasElement, pos: PixelPoint, name: string, colour: string): MouseBoxRect {
  const ctx = canvas.getContext("2d")!;
  ctx.font = `${LABEL_FONT_PX}px 'Open Sans', sans-serif`;
  const rect = boxLabelRect(pos, ctx.measureText(name).width);

  ctx.fillStyle = colour;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  ctx.fillStyle = labelTextColour(colour);
  ctx.textBaseline = "top";
  ctx.fillText(name, rect.x + LABEL_PADDING, rect.y + LABEL_PADDING);

  return rect;
}

export { boxLabelRect, drawBoxLabel, drawMouseBox, labelTextColour, mouseBoxRect };
export type { MouseBoxRect };
