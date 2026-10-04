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

import type { OverlayAnswer, OverlayLayer } from "./protocol";
import { Text } from "./text";

// Draws a map overlay: one layer of the simulation's maps as a semi-transparent tint over the tiles, with a legend.
// It draws only from the simulation's answer to an overlay query, never from simulation objects, so it works the
// same against the simulation in the page and against a server.

type Rgb = readonly [number, number, number];

// The colour a layer's undesirable high end, or a decline, is tinted: magenta, which stands out from the brown of the
// bare ground where red would not
const HARM: Rgb = [190, 0, 150];

// The colour of each layer's high end. A value at the low end is left untinted, so the overlay marks where a layer
// has something to show and the tiles stay readable elsewhere.
const HIGH_COLOURS: Record<OverlayLayer, Rgb> = {
  landValue: [0, 150, 60],
  pollution: HARM,
  crime: HARM,
  trafficDensity: HARM,
  populationDensity: [0, 80, 220],
  policeCoverage: [0, 80, 220],
  fireCoverage: [230, 90, 0],
  powerGrid: [240, 200, 0],
  // A layer whose range runs both sides of zero, such as the rate of growth, is tinted from zero both ways: toward
  // this colour above it, and toward DECLINE below
  rateOfGrowth: [0, 150, 60],
};

const DECLINE = HARM;

// The tint of a value just past the low end: pale, and faint
const PALE: Rgb = [255, 250, 190];
const MIN_ALPHA = 0.25;
const MAX_ALPHA = 0.75;

// A tint: red, green and blue from 0 to 255, and its alpha from 0 to 1, rounded to thousandths as CSS writes it
export interface Tint {
  r: number;
  g: number;
  b: number;
  a: number;
}

// A colour as CSS writes it, which the legend's gradient takes
function css([r, g, b]: Rgb, alpha: number): string {
  return tintCss({r, g, b, a: Math.round(alpha * 1000) / 1000});
}

export function tintCss({r, g, b, a}: Tint): string {
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function mix(from: Rgb, to: Rgb, t: number): Rgb {
  return [0, 1, 2].map((i) => Math.round(from[i] + (to[i] - from[i]) * t)) as unknown as Rgb;
}

// How far toward its colour a value is tinted, from 0, untinted, to 1. A value past an end of the range, as several
// stations' coverage can be, is tinted as that end.
function strength(value: number, from: number, to: number): number {
  return Math.min(Math.max((value - from) / (to - from), 0), 1);
}

function tint(colour: Rgb, t: number): Tint | null {
  if (t === 0) {
    return null;
  }

  const [r, g, b] = mix(PALE, colour, t);
  return {r, g, b, a: Math.round((MIN_ALPHA + (MAX_ALPHA - MIN_ALPHA) * t) * 1000) / 1000};
}

function isDiverging(answer: OverlayAnswer): boolean {
  return answer.low < 0 && answer.high > 0;
}

// The tint of a value of the answer's layer, or null to leave the tile untinted
export function rampColour(answer: OverlayAnswer, value: number): Tint | null {
  const colour = HIGH_COLOURS[answer.layer];

  if (isDiverging(answer)) {
    return value < 0 ? tint(DECLINE, strength(-value, 0, -answer.low)) : tint(colour, strength(value, 0, answer.high));
  }

  return tint(colour, strength(value, answer.low, answer.high));
}

// What the legend shows for an answer: the layer's name, the words for its low and high ends, and the colour ramp
// between them as a CSS gradient
export interface LegendView {
  title: string;
  lowLabel: string;
  highLabel: string;
  gradient: string;
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
  const colour = HIGH_COLOURS[answer.layer];
  const stops = isDiverging(answer) ?
    [css(DECLINE, MAX_ALPHA), css(PALE, 0), css(colour, MAX_ALPHA)] :
    [css(PALE, 0), css(mix(PALE, colour, 0.5), (MIN_ALPHA + MAX_ALPHA) / 2), css(colour, MAX_ALPHA)];
  const text = layerText[answer.layer];

  return {
    title: text.name,
    lowLabel: text.low,
    highLabel: text.high,
    gradient: `linear-gradient(to right, ${stops.join(", ")})`,
  };
}

// One answer, ready to draw tile by tile
export class OverlayView {
  // Each block's tint, in the answer's order
  private readonly tints: (Tint | null)[];

  constructor(readonly answer: OverlayAnswer) {
    this.tints = answer.values.map((value) => rampColour(answer, value));
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
