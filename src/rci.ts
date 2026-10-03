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

import { placeNewCanvas, requiredElement } from "./domElements";
import { VALVES_UPDATED } from "./messages";

// The residential, commercial and industrial demand meter: a bar for each, up for demand and down for none, over a
// grey box carrying their initials.

// The meter is laid out in rects, and in units of padding of a few rects each. The grey box is 1 unit in from the left,
// 7 units wide and 1 unit tall, with a full bar's height and 1 unit above it. The bars are 1 unit wide and 1 unit
// apart, the first 2 units in, so the box reaches 1 unit past the bars on either side. A bar rises from the box's top
// for demand and hangs from its bottom for none, at most BUCKETS rects either way.
const PADDING = 3; // 3 rectangles in each bit of padding
const BUCKETS = 10; // 0..2000 is scaled into 10 buckets
const RECT_SIZE = 5; // Each rect is 5px
const SCALE = Math.floor(2000 / BUCKETS);

const COLOURS = ["rgb(0,255,0)", "rgb(0, 0, 139)", "rgb(255, 255, 0)"];
const LABELS = ["R", "C", "I"];

const CANVAS_ID = "RCICanvas";

// The demand for each kind of zone, as the simulation reports it
export interface Valves {
  residential: number;
  commercial: number;
  industrial: number;
}

export interface ValveSource {
  addEventListener(event: typeof VALVES_UPDATED, listener: (valves: Valves) => void): void;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// The bar for one kind of zone, by its place from residential, in pixels
export function barRect(index: number, value: number): Rect {
  // Industrial demand is scaled up from its range of 1500 to residential's 2000. Commercial demand's range is 1500 too
  // (valves.js), but its bar is not scaled.
  if (index > 1) {
    value = Math.floor(2000 / 1500 * value);
  }

  const barHeightRect = Math.floor(Math.abs(value) / SCALE);
  const barStartY = (value >= 0) ? BUCKETS + PADDING - barHeightRect : BUCKETS + 2 * PADDING;
  const barStartX = 2 * PADDING + (index * 2 * PADDING);

  return {x: barStartX * RECT_SIZE, y: barStartY * RECT_SIZE, width: PADDING * RECT_SIZE,
          height: barHeightRect * RECT_SIZE};
}

// What the meter draws with
export type MeterContext =
  Pick<CanvasRenderingContext2D, "clearRect" | "fillRect" | "fillText" | "fillStyle" | "font" | "textBaseline">;

// The canvas the meter draws on
export interface MeterCanvas {
  width: number;
  height: number;
  readonly style: {margin: string, padding: string};
  getContext(contextId: "2d"): MeterContext | null;
}

// The element the meter's canvas fills
export interface MeterContainer {
  getBoundingClientRect(): {width: number, height: number};
}

export class RCI {
  constructor(private readonly container: MeterContainer, private readonly canvas: MeterCanvas,
              eventSource: ValveSource) {
    eventSource.addEventListener(VALVES_UPDATED, (valves) => this.update(valves));
  }

  update(data: Valves): void {
    // The canvas is assumed to fill its container on-screen. It takes the container's size at every update.
    const rect = this.container.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
    this.canvas.style.margin = "0";
    this.canvas.style.padding = "0";

    const ctx = this.canvas.getContext("2d")!;
    this.clear(ctx);
    this.drawRect(ctx);

    const values = [data.residential, data.commercial, data.industrial];
    for (let i = 0; i < 3; i++) {
      this.drawValue(ctx, i, values[i]);
      this.drawLabel(ctx, i);
    }
  }

  private clear(ctx: MeterContext): void {
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private drawRect(ctx: MeterContext): void {
    // Laid out as the comment at the top of the module describes
    const boxLeft = PADDING * RECT_SIZE;
    const boxTop = (BUCKETS + PADDING) * RECT_SIZE;
    const boxWidth = 7 * PADDING * RECT_SIZE;
    const boxHeight = PADDING * RECT_SIZE;

    ctx.fillStyle = "rgb(192, 192, 192)";
    ctx.fillRect(boxLeft, boxTop, boxWidth, boxHeight);
  }

  private drawValue(ctx: MeterContext, index: number, value: number): void {
    const bar = barRect(index, value);

    ctx.fillStyle = COLOURS[index];
    ctx.fillRect(bar.x, bar.y, bar.width, bar.height);
  }

  private drawLabel(ctx: MeterContext, index: number): void {
    const textLeft = 2 * PADDING + (index * 2 * PADDING) + Math.floor(PADDING / 2);

    ctx.font = "normal xx-small sans-serif";
    ctx.fillStyle = "rgb(0, 0, 0)";
    ctx.textBaseline = "bottom";
    ctx.fillText(LABELS[index], textLeft * RECT_SIZE, (BUCKETS + 2 * PADDING) * RECT_SIZE);
  }
}

// The meter on a new canvas, in the element with the parent's id
export function placeRCI(parentId: string, eventSource: ValveSource): RCI {
  const container = requiredElement(parentId);
  return new RCI(container, placeNewCanvas(container, CANVAS_ID), eventSource);
}
