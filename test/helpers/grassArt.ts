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
  shadow: Record<string, unknown>;
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

// A water section as JSON, loosely enough for a test to break it
export interface WaterJson {
  corners: Record<string, unknown>;
  cut: unknown;
  feather: unknown;
  edge: {octaves: Record<string, unknown>[], [key: string]: unknown};
  sand: Record<string, unknown>;
  tiles: Record<string, unknown>[];
  [key: string]: unknown;
}

// The committed manifest's canopy or water section, its tile i moved to the rectangle place gives it
export function committedSurface<S extends "canopy" | "water">(
  surface: S, place: (i: number) => RectJson): {canopy: CanopyJson, water: WaterJson}[S] {
  const json = structuredClone(
    repositoryJson<{canopy: CanopyJson, water: WaterJson}>("images/render/manifest.json")[surface]);
  json.tiles = json.tiles.map((_, i) => ({...place(i)}));
  return json;
}

// The plainest water section, for the plainest grass: the one tile, the rectangle given, in the grass's atlas and of its
// tile's size, cut halfway up the water's surface and feathered over a twentieth of it, its shore unwobbled, and its sand
// a tenth of the surface under the cut, of the colour given, none of the grass's light and dark in it
export function plainWater(rect: RectJson, sand: [number, number, number] = [0, 0, 0]): WaterJson {
  return {corners: {seed: 0}, cut: 0.5, feather: 0.05,
          edge: {octaves: [{cell: 1, seed: 0x5001, weight: 0, turn: [1, 0]}]},
          sand: {band: 0.1, mean: sand, contrast: 0},
          tiles: [{...rect}]};
}

// A walkway section as JSON, loosely enough for a test to break it
export interface WalkwayJson {
  cut: unknown;
  feather: unknown;
  edge: unknown;
  gravel: Record<string, unknown>;
  paving: Record<string, unknown>;
  crossing: Record<string, unknown>;
  [key: string]: unknown;
}

// The committed manifest's walkway section
export function committedWalkway(): WalkwayJson {
  return structuredClone(repositoryJson<{walkway: WalkwayJson}>("images/render/manifest.json").walkway);
}

// The plainest walkway section: its edge cut so a path fills its ninths but for their rounded ends and sides, unwobbled,
// its gravel, paving and crossing each one flat colour, as given, none of the grass's light and dark in them, and two
// stripes to a ninth
export function plainWalkway(gravel: [number, number, number] = [0, 0, 0], paving: [number, number, number] = [0, 0, 0],
                             crossing: [number, number, number] = [0, 0, 0]): WalkwayJson {
  return {cut: 0.6, feather: 0.2, edge: 0, gravel: {mean: gravel, contrast: 0}, paving: {mean: paving, contrast: 0},
          crossing: {colour: crossing, stripes: 2}};
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
// weight given, none by default, and its shadow, half a tile right and down, so each point of a tile's corner is shaded
// from the middle of the tile up and left of the corner, as dark as given, none by default
export function plainCanopy(rect: RectJson, wobble = 0, shadow = 0): CanopyJson {
  return {corners: {seed: 0}, cut: 0.5, feather: 0.1,
          edge: {octaves: [{cell: 0.9, seed: 0x6001, weight: wobble, turn: [0.819648, 0.572867]}]},
          shadow: {offset: 0.5, darkness: shadow, feather: 0.1},
          tiles: [{...rect}]};
}
