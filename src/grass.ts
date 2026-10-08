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

// The world grass the map draws under bare land (docs/render-assets.md): which of a grass set's corner tiles a map tile
// draws, from an integer hash of its corners' positions, and the share of straw and the tint at each position, from
// noise, and the wobble of the canopy's edge where the woods meet the grass and of the shore where the water does,
// baked once into a field the renderer samples. The art build computes the same in art/tools/grass.py, with the same
// arithmetic, + - * / and floor, so both give the same numbers to the last bit; conformance/grass.json holds them to
// it. Only map positions go in, never a city's seed, so every city's grass lies the same.

// The map's size in tiles, which the baked field covers: every city's map is this size, the rules' (test/vocabulary.ts
// holds it to conformance/ruleConstants.json)
export const GRASS_MAP = {width: 120, height: 100} as const;

// One octave of noise: its lattice's spacing in tiles, its hash's seed, its weight in the sum, and for gradient noise
// the turn of its lattice off the map's axes, as a cosine and a sine
export interface NoiseOctave {
  cell: number;
  seed: number;
  weight: number;
}

export interface TurnedOctave extends NoiseOctave {
  turn: readonly [number, number];
}

// What the grass is computed from, as the manifest's grass section gives it
export interface GrassConstants {
  // The colours a lattice point takes, and the seed of its hash
  colours: number;
  corners: {seed: number};
  // The share of straw: gradient noise over the octaves, its gradients' directions, and the noise's centre and width
  // across which the share goes from none to all by smootherstep
  mask: {octaves: readonly TurnedOctave[], gradients: readonly (readonly [number, number])[], centre: number,
         width: number};
  // The tint, from 0 to 1: value noise over the octaves; how far it brightens and warms the grass, and the colour it
  // warms toward, as multipliers of red, green and blue
  tint: {octaves: readonly NoiseOctave[], brightness: number, warmth: number, warm: readonly [number, number, number]};
  // The baked field's texels a tile
  texelsPerTile: number;
}

// The wobble of an edge the map draws from where its woods or water lie, the canopy's or the shore's, as the
// manifest's canopy and water sections give it: gradient noise over the octaves, on the grass mask's gradients, in the
// units of the surface the edge cuts, baked into the grass's field from -1 to 1
export interface EdgeNoise {
  octaves: readonly TurnedOctave[];
}

// Chris Wellons' lowbias32 hash of a whole number taken modulo 2 ** 32
export function lowbias32(value: number): number {
  let x = value >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

// The hash of a lattice point, whole numbers, negative ones taken modulo 2 ** 32
export function latticeHash(x: number, y: number, seed: number): number {
  return lowbias32((x >>> 0) ^ lowbias32(((y >>> 0) ^ seed) >>> 0));
}

// The corner tile the map tile at (x, y) draws: its corners' colours as digits, north-west first, then north-east,
// south-west and south-east
export function grassTile(x: number, y: number, constants: Pick<GrassConstants, "colours" | "corners">): number {
  const {colours, corners: {seed}} = constants;
  const colour = (cx: number, cy: number) => latticeHash(cx, cy, seed) % colours;
  return colour(x, y) + colour(x + 1, y) * colours + colour(x, y + 1) * colours * colours +
    colour(x + 1, y + 1) * colours * colours * colours;
}

// The hashes of an octave's lattice points from (x0, y0) on, width a row, each worked out once
interface Lattice {
  x0: number;
  y0: number;
  width: number;
  hashes: Uint32Array;
}

// Where a map position falls along x and along y of a gradient octave's lattice, turned off the map's axes
function turnedX(x: number, y: number, octave: TurnedOctave): number {
  return (octave.turn[0] * x - octave.turn[1] * y) / octave.cell;
}

function turnedY(x: number, y: number, octave: TurnedOctave): number {
  return (octave.turn[1] * x + octave.turn[0] * y) / octave.cell;
}

// The octave's lattice over every point the positions from (left, top) to (right, bottom) fall between
function lattice(octave: NoiseOctave | TurnedOctave, left: number, top: number, right: number,
                 bottom: number): Lattice {
  const corners = [[left, top], [right, top], [left, bottom], [right, bottom]];
  const xs = corners.map(([x, y]) => "turn" in octave ? turnedX(x, y, octave) : x / octave.cell);
  const ys = corners.map(([x, y]) => "turn" in octave ? turnedY(x, y, octave) : y / octave.cell);
  const x0 = Math.floor(Math.min(...xs));
  const y0 = Math.floor(Math.min(...ys));
  const width = Math.floor(Math.max(...xs)) + 2 - x0;
  const height = Math.floor(Math.max(...ys)) + 2 - y0;
  const hashes = new Uint32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      hashes[y * width + x] = latticeHash(x0 + x, y0 + y, octave.seed);
    }
  }
  return {x0, y0, width, hashes};
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

// Perlin-style gradient noise at (x, y), in tiles, on the octave's turned lattice, with a quintic fade
function gradientNoise(x: number, y: number, octave: TurnedOctave, gradients: readonly (readonly [number, number])[],
                       points: Lattice): number {
  const gx = turnedX(x, y, octave);
  const gy = turnedY(x, y, octave);
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = gx - x0;
  const fy = gy - y0;
  const at = (y0 - points.y0) * points.width + (x0 - points.x0);
  const ga = gradients[points.hashes[at] & 15];
  const gb = gradients[points.hashes[at + 1] & 15];
  const gc = gradients[points.hashes[at + points.width] & 15];
  const gd = gradients[points.hashes[at + points.width + 1] & 15];
  const a = ga[0] * fx + ga[1] * fy;
  const b = gb[0] * (fx - 1) + gb[1] * fy;
  const c = gc[0] * fx + gc[1] * (fy - 1);
  const d = gd[0] * (fx - 1) + gd[1] * (fy - 1);
  const ux = fade(fx);
  const uy = fade(fy);
  return (a * (1 - ux) + b * ux) * (1 - uy) + (c * (1 - ux) + d * ux) * uy;
}

// Smooth value noise from 0 to 1 at (x, y), in tiles, on the octave's lattice
function valueNoise(x: number, y: number, octave: NoiseOctave, points: Lattice): number {
  const gx = x / octave.cell;
  const gy = y / octave.cell;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = gx - x0;
  const fy = gy - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const at = (y0 - points.y0) * points.width + (x0 - points.x0);
  const a = points.hashes[at] / 4294967295;
  const b = points.hashes[at + 1] / 4294967295;
  const c = points.hashes[at + points.width] / 4294967295;
  const d = points.hashes[at + points.width + 1] / 4294967295;
  return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
}

// The share of straw at (x, y), from the mask's octaves on their lattices
function shareOn(x: number, y: number, mask: GrassConstants["mask"], lattices: readonly Lattice[]): number {
  const {octaves, gradients, centre, width} = mask;
  let noise = 0;
  for (let i = 0; i < octaves.length; i++) {
    noise += octaves[i].weight * gradientNoise(x, y, octaves[i], gradients, lattices[i]);
  }
  const e = Math.min(Math.max((noise - centre) / width + 0.5, 0), 1);
  return e * e * e * (e * (e * 6 - 15) + 10);
}

// An edge's wobble at (x, y), from its octaves on their lattices, on the mask's gradients
function edgeOn(x: number, y: number, edge: EdgeNoise, gradients: GrassConstants["mask"]["gradients"],
                lattices: readonly Lattice[]): number {
  let sum = 0;
  for (let i = 0; i < edge.octaves.length; i++) {
    sum += edge.octaves[i].weight * gradientNoise(x, y, edge.octaves[i], gradients, lattices[i]);
  }
  return sum;
}

// An edge's wobble as the field bakes it, from 0 to 1 for -1 to 1, held there
function edgeByte(wobble: number): number {
  return Math.floor((Math.min(Math.max(wobble, -1), 1) + 1) / 2 * 255 + 0.5);
}

// The tint at (x, y), from the tint's octaves on their lattices
function tintOn(x: number, y: number, tint: GrassConstants["tint"], lattices: readonly Lattice[]): number {
  let sum = 0;
  for (let i = 0; i < tint.octaves.length; i++) {
    sum += tint.octaves[i].weight * valueNoise(x, y, tint.octaves[i], lattices[i]);
  }
  return sum;
}

// The share of straw at (x, y), in tiles, from 0 to 1
export function strawShare(x: number, y: number, constants: Pick<GrassConstants, "mask">): number {
  return shareOn(x, y, constants.mask, constants.mask.octaves.map((octave) => lattice(octave, x, y, x, y)));
}

// The tint at (x, y), in tiles, from 0 to 1
export function grassTint(x: number, y: number, constants: Pick<GrassConstants, "tint">): number {
  return tintOn(x, y, constants.tint, constants.tint.octaves.map((octave) => lattice(octave, x, y, x, y)));
}

// An edge's wobble at (x, y), in tiles, unbaked, on the grass mask's gradients
export function edgeWobble(x: number, y: number, edge: EdgeNoise, constants: Pick<GrassConstants, "mask">): number {
  return edgeOn(x, y, edge, constants.mask.gradients, edge.octaves.map((octave) => lattice(octave, x, y, x, y)));
}

// The bytes a texel of the baked field: the share of straw, the tint, the canopy's wobble and the shore's
export const FIELD_BYTES = 4;

// The baked field as the RGBA pixels of the texture the renderer samples: the share of straw in red, the tint in green,
// the canopy's wobble in blue and the shore's in alpha, which the shaders read back as its .r, .g, .b and .a
export function grassFieldPixels(field: Uint8Array): Uint8ClampedArray<ArrayBuffer> {
  return new Uint8ClampedArray(field);
}

// The field of straw share, tint and the canopy's and the shore's wobble over a map width by height tiles,
// texelsPerTile texels a tile, each its texel centre's, as bytes rounded half up: row by row, FIELD_BYTES a texel, the
// share, the tint, then each wobble, held from -1 to 1, as 0 to 255. Each lattice point over the map is hashed once,
// not once for each texel it reaches.
export function bakeGrassField(constants: GrassConstants, canopy: EdgeNoise, shore: EdgeNoise, width: number,
                               height: number): Uint8Array {
  const k = constants.texelsPerTile;
  const columns = width * k;
  const rows = height * k;
  const shares = constants.mask.octaves.map((octave) => lattice(octave, 0, 0, width, height));
  const tints = constants.tint.octaves.map((octave) => lattice(octave, 0, 0, width, height));
  const canopyEdges = canopy.octaves.map((octave) => lattice(octave, 0, 0, width, height));
  const shoreEdges = shore.octaves.map((octave) => lattice(octave, 0, 0, width, height));
  const field = new Uint8Array(columns * rows * FIELD_BYTES);
  for (let row = 0; row < rows; row++) {
    const y = (row + 0.5) / k;
    for (let column = 0; column < columns; column++) {
      const x = (column + 0.5) / k;
      const at = (row * columns + column) * FIELD_BYTES;
      field[at] = Math.floor(shareOn(x, y, constants.mask, shares) * 255 + 0.5);
      field[at + 1] = Math.floor(tintOn(x, y, constants.tint, tints) * 255 + 0.5);
      field[at + 2] = edgeByte(edgeOn(x, y, canopy, constants.mask.gradients, canopyEdges));
      field[at + 3] = edgeByte(edgeOn(x, y, shore, constants.mask.gradients, shoreEdges));
    }
  }
  return field;
}
