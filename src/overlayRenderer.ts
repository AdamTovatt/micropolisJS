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

import type { OverlayAnswer, OverlayLayer } from "./protocol";
import { Text } from "./text";

// Draws a map overlay: one layer of the simulation's maps as a semi-transparent tint over the tiles, with a legend.
// It draws only from the simulation's answer to an overlay query, never from simulation objects, so it works the
// same against any city source.
//
// Every layer but the power grid is a heatmap: a ramp of hues from blue at its low end, through cyan, green and
// yellow, to red at its high end, all at one opacity, so the map shows through alike everywhere. The ramp spans the
// values this answer holds, not the layer's range, since real cities use a small part of some ranges: from the least to the greatest of the answer's values but zero, which
// stays clear and doesn't count. A layer whose range runs either side of zero, the rate of growth, diverges: its ramp
// runs from minus the largest magnitude among the answer's values to plus it, so zero falls at its middle, and stays
// clear. The power grid is either powered or not, and tints its powered tiles in one colour.

type Rgb = readonly [number, number, number];

// The heatmap's hues, from its low end to its high end, evenly spaced along the ramp
const HUES: readonly Rgb[] = [[0, 0, 255], [0, 255, 255], [0, 255, 0], [255, 255, 0], [255, 0, 0]];

// The opacity of every heatmap tint
const HEAT_ALPHA = 0.55;

// A tint: red, green and blue from 0 to 255, and its alpha from 0 to 1
export interface Tint {
  r: number;
  g: number;
  b: number;
  a: number;
}

// The power grid's tint of a powered tile
const POWERED: Tint = {r: 240, g: 200, b: 0, a: 0.75};

// A colour as CSS writes it, which the legend's gradient takes
function css({r, g, b, a}: Tint): string {
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

// The heatmap's tint at place t of its ramp, from 0, the low end, to 1, the high end, each channel going straight
// from one hue to the next, as the legend's gradient goes between its stops
function heat(t: number): Tint {
  const along = t * (HUES.length - 1);
  const from = Math.min(Math.floor(along), HUES.length - 2);
  const part = along - from;
  const [r, g, b] = HUES[from].map((channel, i) => Math.round(channel + (HUES[from + 1][i] - channel) * part));
  return {r, g, b, a: HEAT_ALPHA};
}

function isDiverging(answer: OverlayAnswer): boolean {
  return answer.low < 0 && answer.high > 0;
}

// The values a heatmap's ramp spans, from its low end to its high end
interface Span {
  low: number;
  high: number;
}

// The span of the answer's heatmap, or null when every value is zero, and the layer has nothing to show yet
function heatSpan(answer: OverlayAnswer): Span | null {
  let least = Infinity;
  let greatest = -Infinity;
  for (const value of answer.values) {
    if (value !== 0) {
      least = Math.min(least, value);
      greatest = Math.max(greatest, value);
    }
  }

  if (least > greatest) {
    return null;
  }

  if (isDiverging(answer)) {
    const magnitude = Math.max(-least, greatest);
    return {low: -magnitude, high: magnitude};
  }

  return {low: least, high: greatest};
}

// A value's place along the span's ramp, from 0, the low end, to 1, the high end: the middle for every value when the
// span is one value, and an end for a value past it
function heatPlace(span: Span, value: number): number {
  const t = span.high === span.low ? 0.5 : (value - span.low) / (span.high - span.low);
  return Math.min(Math.max(t, 0), 1);
}

// An answer's ramp, worked out once for it: the tint of each value, and what the legend shows of it
interface Ramp {
  // The tint of a value, or null to leave its tile untinted
  tint(value: number): Tint | null;
  // The ramp as a CSS gradient, or null when nothing is tinted
  gradient: string | null;
  // The values the ramp spans at its low and high ends, or null when the legend writes none
  ends: Span | null;
  // What the legend says in place of the values, or null for nothing
  note: string | null;
}

// The power grid's ramp: its powered tiles in one colour and the rest untinted, which the legend shows as a fade from
// untinted to that colour
function powerRamp(): Ramp {
  return {
    tint: (value) => value === 0 ? null : POWERED,
    gradient: `linear-gradient(to right, ${css({...POWERED, a: 0})}, ${css(POWERED)})`,
    ends: null,
    note: null,
  };
}

// A heatmap's ramp over the answer's own values. Zero is untinted. The legend draws the hues the ramp gives, or only
// its middle when every value but zero is the same, which is all the map shows then.
function heatRamp(answer: OverlayAnswer): Ramp {
  const span = heatSpan(answer);
  if (span === null) {
    return {tint: () => null, gradient: null, ends: null, note: Text.overlays.nothingToShow};
  }

  const places = span.low === span.high ? [0.5, 0.5] : HUES.map((_, i) => i / (HUES.length - 1));
  const stops = places.map((t, i) => `${css(heat(t))} ${i / (places.length - 1) * 100}%`);
  return {
    tint: (value) => value === 0 ? null : heat(heatPlace(span, value)),
    gradient: `linear-gradient(to right, ${stops.join(", ")})`,
    ends: span,
    note: null,
  };
}

function ramp(answer: OverlayAnswer): Ramp {
  return answer.layer === "powerGrid" ? powerRamp() : heatRamp(answer);
}

// The tint of a value of the answer's layer, or null to leave the tile untinted
export function rampColour(answer: OverlayAnswer, value: number): Tint | null {
  return ramp(answer).tint(value);
}

// What the legend shows for an answer: the layer's name, the words for its low and high ends, with the value the ramp
// spans at each where it has values, and the ramp between them as a CSS gradient, or null when nothing is tinted, and
// a note in place of the values when the layer has nothing to show yet. The legend lays the gradient over a neutral
// background, as the tint lies over the map.
export interface LegendView {
  title: string;
  lowLabel: string;
  highLabel: string;
  gradient: string | null;
  note: string | null;
}

interface LayerText {
  name: string;
  low: string;
  high: string;
}

const layerText: Record<OverlayLayer, LayerText> = Text.overlays.layers;

export function layerName(layer: OverlayLayer): string {
  return layerText[layer].name;
}

export function legendView(answer: OverlayAnswer): LegendView {
  const text = layerText[answer.layer];
  const {gradient, ends, note} = ramp(answer);

  return {
    title: text.name,
    lowLabel: ends === null ? text.low : Text.overlays.end(text.low, ends.low),
    highLabel: ends === null ? text.high : Text.overlays.end(text.high, ends.high),
    gradient,
    note,
  };
}

// One answer, ready to draw tile by tile
export class OverlayView {
  // Each block's tint, in the answer's order
  private readonly tints: (Tint | null)[];

  constructor(readonly answer: OverlayAnswer) {
    const {tint} = ramp(answer);
    this.tints = answer.values.map((value) => tint(value));
  }

  // The tint of the tile at (x, y) on the map, or null for none
  tileTint(x: number, y: number): Tint | null {
    const {blockSize, width, height} = this.answer;
    const blockX = Math.floor(x / blockSize);
    const blockY = Math.floor(y / blockSize);

    if (blockX < 0 || blockY < 0 || blockX >= width || blockY >= height) {
      return null;
    }

    return this.tints[width * blockY + blockX];
  }
}
