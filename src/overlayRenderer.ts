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
// same against any city source.

type Rgb = readonly [number, number, number];

// The colour a layer's undesirable high end, or a decline, is tinted: magenta, which stands out from the brown of the
// bare ground where red would not
const HARM: Rgb = [190, 0, 150];

// The colour of each layer's tint. A layer's ramp is its colour throughout, only its opacity growing, from none at the
// low end to MAX_ALPHA at the high end (see opacity), so the overlay marks where a layer has something to show, each
// level of it tells from the next by how strongly it shows, and the tiles stay readable elsewhere.
const LAYER_COLOURS: Record<OverlayLayer, Rgb> = {
  landValue: [0, 150, 60],
  pollution: HARM,
  crime: HARM,
  trafficDensity: HARM,
  populationDensity: [0, 80, 220],
  policeCoverage: [0, 80, 220],
  fireCoverage: [230, 90, 0],
  powerGrid: [240, 200, 0],
  // A layer whose range runs both sides of zero, such as the rate of growth, is untinted at zero and fades in from
  // there both ways: in this colour above it, and in DECLINE below
  rateOfGrowth: [0, 150, 60],
};

const DECLINE = HARM;

// The opacity of a ramp's high end
const MAX_ALPHA = 0.75;

// The share of MAX_ALPHA a value just above the low end is tinted at
const FLOOR = 1 / 3;

// The opacity of a value at place t of its ramp, from 0, the low end, to 1, the high end: none at the low end, and
// above it from FLOOR of the full opacity, growing with the square root of t. The values real cities reach are a
// small part of some layers' range, as fire coverage peaks around 50 to 110 of its 1000, and a tint that grew with t
// would leave them all but invisible.
function opacity(t: number): number {
  return t === 0 ? 0 : MAX_ALPHA * (FLOOR + (1 - FLOOR) * Math.sqrt(t));
}

// The places along a ramp the legend's gradient draws the opacity at, going straight between them, close enough to
// the curve, and with room at the low end for the bar to read as none there
const LEGEND_PLACES = [0, 0.04, 0.1, 0.2, 0.35, 0.5, 0.7, 1];

// A tint: red, green and blue from 0 to 255, and its alpha from 0 to 1, rounded to thousandths as CSS writes it
export interface Tint {
  r: number;
  g: number;
  b: number;
  a: number;
}

// A colour as CSS writes it, which the legend's gradient takes, its alpha rounded to thousandths as a tint's is
function css([r, g, b]: Rgb, alpha: number): string {
  return `rgba(${r}, ${g}, ${b}, ${Math.round(alpha * 1000) / 1000})`;
}

// A value's place along its ramp, from 0, the low end, to 1, the high end, which opacity turns into the tint's alpha.
// A value past an end of the range, as several stations' coverage can be, is placed at that end.
function strength(value: number, from: number, to: number): number {
  return Math.min(Math.max((value - from) / (to - from), 0), 1);
}

// The colour at place t of its ramp, or null for none, which leaves the tile untinted
function tint([r, g, b]: Rgb, t: number): Tint | null {
  if (t === 0) {
    return null;
  }

  return {r, g, b, a: Math.round(opacity(t) * 1000) / 1000};
}

function isDiverging(answer: OverlayAnswer): boolean {
  return answer.low < 0 && answer.high > 0;
}

// The tint of a value of the answer's layer, or null to leave the tile untinted
export function rampColour(answer: OverlayAnswer, value: number): Tint | null {
  const colour = LAYER_COLOURS[answer.layer];

  if (isDiverging(answer)) {
    return value < 0 ? tint(DECLINE, strength(-value, 0, -answer.low)) : tint(colour, strength(value, 0, answer.high));
  }

  return tint(colour, strength(value, answer.low, answer.high));
}

// What the legend shows for an answer: the layer's name, the words for its low and high ends, and the colour ramp
// between them as a CSS gradient, which the legend lays over a neutral background, as the tint lies over the map, so
// its untinted end reads as none
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
  const colour = LAYER_COLOURS[answer.layer];
  // The stop of place t of a ramp in the colour, drawn from 0 to 1 at the fraction of the bar given
  const stop = (rgb: Rgb, t: number, at: number) => `${css(rgb, opacity(t))} ${Math.round(at * 1000) / 10}%`;

  // A diverging ramp fades out to zero in each of its colours, so neither colour's hue tints the other's side
  const zero = isDiverging(answer) ? -answer.low / (answer.high - answer.low) : 0;
  const stops = [
    ...(zero > 0 ? [...LEGEND_PLACES].reverse().map((t) => stop(DECLINE, t, zero * (1 - t))) : []),
    ...LEGEND_PLACES.map((t) => stop(colour, t, zero + (1 - zero) * t)),
  ];
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
