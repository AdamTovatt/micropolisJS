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

import { BlockMap } from "./blockMap";
import { OVERLAY_LAYERS, OverlayLayer, Query, QueryAnswer, QueryType } from "./protocol";
import { FieldRule, fieldsReason, FieldRules, hasFields, isRecord, oneOf } from "./validation";

// How the simulation answers the queries a player sends it, which protocol.ts defines. They arrive untrusted, like
// commands: the simulation validates each one before it answers it. Answering reads the city and changes nothing.

// The maps a layer is read from: the simulation's block maps, and the power scan's grid
export interface OverlaySources {
  blockMaps: Record<string, BlockMap>;
  powerGridMap: BlockMap;
}

interface LayerSource {
  // The block map's key in the simulation's blockMaps, or null for the power grid. blockMaps is untyped JavaScript,
  // so the compiler can't check these keys; test/queries.ts reads each map directly and fails on a rename.
  blockMap: string | null;
  // The ends of the range, as the comment on each map in the Simulation constructor states it
  low: number;
  high: number;
}

const LAYERS: Record<OverlayLayer, LayerSource> = {
  landValue: {blockMap: "landValueMap", low: 0, high: 250},
  pollution: {blockMap: "pollutionDensityMap", low: 0, high: 255},
  crime: {blockMap: "crimeRateMap", low: 0, high: 250},
  trafficDensity: {blockMap: "trafficDensityMap", low: 0, high: 240},
  populationDensity: {blockMap: "populationDensityMap", low: 0, high: 510},
  policeCoverage: {blockMap: "policeStationEffectMap", low: 0, high: 1000},
  fireCoverage: {blockMap: "fireStationEffectMap", low: 0, high: 1000},
  rateOfGrowth: {blockMap: "rateOfGrowthMap", low: -200, high: 200},
  // Each tile, 1 where the last power scan powered it and 0 where it didn't
  powerGrid: {blockMap: null, low: 0, high: 1},
};

// The simulation phase whose scan recomputes each layer, as simulate in simulation.js runs them: the simulation
// emits OVERLAY_UPDATED for a layer once that phase has recomputed it. The map scan of phases 1 to 8 adds to the
// traffic and growth maps tile by tile, and phase 10 decays them, which completes them for the cycle.
export const LAYER_PHASES: Record<OverlayLayer, number> = {
  trafficDensity: 10,
  rateOfGrowth: 10,
  powerGrid: 11,
  landValue: 12,
  pollution: 12,
  crime: 13,
  policeCoverage: 13,
  populationDensity: 14,
  fireCoverage: 15,
};

// The layers each phase recomputes, in the order of OVERLAY_LAYERS
export function layersOfPhase(phase: number): OverlayLayer[] {
  return OVERLAY_LAYERS.filter((layer) => LAYER_PHASES[layer] === phase);
}

// Each query's fields but its type, as FIELDS in commands.ts holds the commands': the compiler holds the table to
// the Query type, both ways
const FIELDS = {
  overlay: {layer: "required"},
} satisfies {[T in QueryType]: FieldRules<Extract<Query, {type: T}>>};

// Why the simulation rejects this query, or null when it is valid. A valid query is a Query: exactly its type's
// fields, each one the protocol allows. A reason quotes no value from the query, so a hostile query can't make it
// long.
export function queryRejection(query: unknown): string | null {
  if (!isRecord(query) || !oneOf(query.type, Object.keys(FIELDS))) {
    return "not a query";
  }

  const type = query.type as QueryType;
  const rules: Record<string, FieldRule> = FIELDS[type];
  if (!hasFields(query, rules, "type")) {
    return fieldsReason(`the ${type} query`, rules);
  }

  switch (type) {
    case "overlay":
      return oneOf(query.layer, OVERLAY_LAYERS) ? null : `the layer is one of ${OVERLAY_LAYERS.join(", ")}`;
  }
}

// The answer to a query, or its rejection. The values are a copy, so nothing done with an answer reaches the city.
export function answerQuery(query: unknown, sources: OverlaySources): QueryAnswer {
  const reason = queryRejection(query);
  if (reason !== null) {
    return {type: "rejected", reason};
  }

  const layer = (query as {layer: OverlayLayer}).layer;
  const source = LAYERS[layer];
  const map = source.blockMap === null ? sources.powerGridMap : sources.blockMaps[source.blockMap];

  return {
    type: "overlay", layer, blockSize: map.blockSize, width: map.width, height: map.height, low: source.low,
    high: source.high, values: map.save(),
  };
}
