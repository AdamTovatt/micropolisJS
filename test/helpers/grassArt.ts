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

import { repositoryJson } from "./repository";

// A render manifest's grass and canopy sections, for the tests that build manifests of their own
// (docs/render-assets.md)

// A rectangle of an atlas, as a manifest writes it
export interface RectJson {
  atlas: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

// A grass section as JSON, loosely enough for a test to break it
export interface GrassJson {
  colours: number;
  sets: Record<"lush" | "straw", {mean: number[], tiles: Record<string, unknown>[]}>;
  mask: {gradients: unknown[], octaves: Record<string, unknown>[], [key: string]: unknown};
  tint: {octaves: Record<string, unknown>[], [key: string]: unknown};
  corners: Record<string, unknown>;
  [key: string]: unknown;
}

// A canopy section as JSON, loosely enough for a test to break it
export interface CanopyJson {
  corners: Record<string, unknown>;
  cut: unknown;
  feather: unknown;
  edge: {octaves: Record<string, unknown>[], [key: string]: unknown};
  tiles: Record<string, unknown>[];
  [key: string]: unknown;
}

// The committed manifest's grass section, each set's tile i moved to the rectangle place gives it
export function committedGrass(place: (set: "lush" | "straw", i: number) => RectJson): GrassJson {
  const json = structuredClone(repositoryJson<{grass: GrassJson}>("images/render/manifest.json").grass);
  json.sets.lush.tiles = json.sets.lush.tiles.map((_, i) => ({...place("lush", i)}));
  json.sets.straw.tiles = json.sets.straw.tiles.map((_, i) => ({...place("straw", i)}));
  return json;
}

// The committed manifest's canopy section, its tile i moved to the rectangle place gives it
export function committedCanopy(place: (i: number) => RectJson): CanopyJson {
  const json = structuredClone(repositoryJson<{canopy: CanopyJson}>("images/render/manifest.json").canopy);
  json.tiles = json.tiles.map((_, i) => ({...place(i)}));
  return json;
}

// The plainest grass section: one colour, so each set is the one tile, the rectangle given, of the mean colour given,
// half of each set everywhere and no tint, so where the rectangle is that colour all over, the grass is too. Its mask
// weighs nothing, but its gradients are the sixteen ways round, which a canopy's wobble is drawn on.
export function plainGrass(rect: RectJson, mean: [number, number, number] = [0, 0, 0]): GrassJson {
  return {
    colours: 1,
    corners: {seed: 0},
    mask: {
      octaves: [{cell: 1, seed: 0, weight: 0, turn: [1, 0]}],
      gradients: Array.from({length: 16}, (_, i) => [Math.cos(i * Math.PI / 8), Math.sin(i * Math.PI / 8)]),
      centre: 0,
      width: 1,
    },
    tint: {octaves: [{cell: 1, seed: 0, weight: 0}], brightness: 0, warmth: 0, warm: [1, 1, 1]},
    texelsPerTile: 1,
    sets: {lush: {mean, tiles: [{...rect}]}, straw: {mean, tiles: [{...rect}]}},
  };
}

// The plainest canopy section, for the plainest grass: the one tile, the rectangle given, in the grass's atlas and of
// its tile's size, cut halfway up the woods' surface and feathered over a tenth of it, its edge wobbled by noise of the
// weight given, none by default
export function plainCanopy(rect: RectJson, wobble = 0): CanopyJson {
  return {corners: {seed: 0}, cut: 0.5, feather: 0.1,
          edge: {octaves: [{cell: 0.9, seed: 0x6001, weight: wobble, turn: [0.819648, 0.572867]}]},
          tiles: [{...rect}]};
}
