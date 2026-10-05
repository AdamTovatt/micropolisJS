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

import { placeNewCanvas, screenPixelRatio, stylesheetProperty } from "./domElements";
import type { DemandMessage } from "./protocol";

// The residential, commercial and industrial demand meter: a dark track for each, with a line across its middle, and a
// bar in it that rises from the line for demand and hangs from it for none, over the zone's initial.

// Each track is TRACK_WIDTH wide, and the tracks' middles are COLUMN apart, the first COLUMN / 2 in. A bar fills its
// track's width, and grows in steps of STEP pixels, at most BUCKETS steps either way of the line, which is 1 pixel tall.
const BUCKETS = 10; // 0..2000 is scaled into 10 buckets
const STEP = 4;
const SCALE = Math.floor(2000 / BUCKETS);
const TRACK_WIDTH = 18;
const COLUMN = 44;
const HALF = BUCKETS * STEP;
const TRACK_HEIGHT = 2 * HALF + 1;
// The initials, under the tracks with a gap above them, centred under each
const LABEL_GAP = 4;
const LABEL_HEIGHT = 12;

const LABELS = ["R", "C", "I"];

const CANVAS_ID = "RCICanvas";

// How the meter looks, from the HUD's custom properties on the stylesheet's :root: each bar's colour, residential
// first, the tracks', the line's across them, the initials', which are read on the panel's surface, and the HUD's font
export interface MeterStyle {
  bars: readonly [string, string, string];
  track: string;
  line: string;
  label: string;
  font: string;
}

// The custom properties each part of the meter's look is
export const STYLE_PROPERTIES = {
  bars: ["--hud-demand-residential-fill", "--hud-demand-commercial-fill", "--hud-demand-industrial-fill"],
  track: "--hud-demand-track-fill",
  line: "--hud-demand-line-fill",
  label: "--hud-muted-text",
  font: "--type-font",
} as const;

// The meter's size in CSS pixels: three columns across, and a track with the initials under it down
export const METER_WIDTH = 3 * COLUMN;
export const METER_HEIGHT = TRACK_HEIGHT + LABEL_GAP + LABEL_HEIGHT;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// The track for one kind of zone, by its place from residential, in CSS pixels
export function trackRect(index: number): Rect {
  return {x: COLUMN / 2 + index * COLUMN - TRACK_WIDTH / 2, y: 0, width: TRACK_WIDTH, height: TRACK_HEIGHT};
}

// The bar for one kind of zone, by its place from residential, in CSS pixels
export function barRect(index: number, value: number): Rect {
  // Industrial demand is scaled up from its range of 1500 to residential's 2000. Commercial demand's range is 1500 too
  // (Valves in the C# rules), but its bar is not scaled. The original scales neither: drawValve (w_update.c in
  // micropolis-activity) clamps all three demands to 1500, and UISetDemand (micropolis.tcl) draws them on one scale.
  if (index > 1) {
    value = Math.floor(2000 / 1500 * value);
  }

  const height = Math.floor(Math.abs(value) / SCALE) * STEP;
  const track = trackRect(index);

  return {x: track.x, y: value >= 0 ? HALF - height : HALF + 1, width: TRACK_WIDTH, height};
}

// What the meter draws with
export type MeterContext = Pick<CanvasRenderingContext2D,
  "clearRect" | "fillRect" | "fillText" | "fillStyle" | "font" | "textAlign" | "textBaseline" | "setTransform">;

// The canvas the meter draws on
export interface MeterCanvas {
  width: number;
  height: number;
  readonly style: {margin: string, padding: string, width: string, height: string};
  getContext(contextId: "2d"): MeterContext | null;
}

// The canvas is sized as it is made, not from its box on the page, which it has none of while its panel is folded, with
// a backing store of pixelRatio pixels for each CSS pixel, so it is sharp on a dense screen
export class RCI {
  constructor(private readonly canvas: MeterCanvas, private readonly look: MeterStyle,
              private readonly pixelRatio: number) {
    canvas.width = Math.round(METER_WIDTH * pixelRatio);
    canvas.height = Math.round(METER_HEIGHT * pixelRatio);
    canvas.style.width = `${METER_WIDTH}px`;
    canvas.style.height = `${METER_HEIGHT}px`;
    canvas.style.margin = "0";
    canvas.style.padding = "0";
  }

  // Draws the demand, as each demand message gives it
  update(data: Omit<DemandMessage, "type">): void {
    const ctx = this.canvas.getContext("2d")!;
    ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    ctx.clearRect(0, 0, METER_WIDTH, METER_HEIGHT);

    const values = [data.residential, data.commercial, data.industrial];
    for (let i = 0; i < 3; i++) {
      this.drawTrack(ctx, i);
      this.fill(ctx, barRect(i, values[i]), this.look.bars[i]);
      this.drawLabel(ctx, i);
    }
  }

  private drawTrack(ctx: MeterContext, index: number): void {
    const track = trackRect(index);
    this.fill(ctx, track, this.look.track);
    this.fill(ctx, {...track, y: HALF, height: 1}, this.look.line);
  }

  private fill(ctx: MeterContext, rect: Rect, colour: string): void {
    ctx.fillStyle = colour;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  }

  private drawLabel(ctx: MeterContext, index: number): void {
    ctx.font = `700 11px ${this.look.font}`;
    ctx.fillStyle = this.look.label;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(LABELS[index], COLUMN / 2 + index * COLUMN, METER_HEIGHT);
  }
}

// The meter on a new canvas, in the element given, in the look the stylesheet gives it
export function placeRCI(parent: HTMLElement): RCI {
  const [residential, commercial, industrial] = STYLE_PROPERTIES.bars.map(stylesheetProperty);
  return new RCI(placeNewCanvas(parent, CANVAS_ID), {
    bars: [residential, commercial, industrial], track: stylesheetProperty(STYLE_PROPERTIES.track),
    line: stylesheetProperty(STYLE_PROPERTIES.line), label: stylesheetProperty(STYLE_PROPERTIES.label),
    font: stylesheetProperty(STYLE_PROPERTIES.font),
  }, screenPixelRatio());
}
