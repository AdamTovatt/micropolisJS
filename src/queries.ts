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
import { budgetRecord, BudgetSource } from "./budgetRecord";
import { fundingRejection } from "./commands";
import { MapGenerator } from "./mapGenerator.js";
import {
  BudgetForecastAnswer, MapPreviewAnswer, MAX_SEED, OVERLAY_LAYERS, OverlayAnswer, OverlayLayer, Query, QueryAnswer, QueryType,
  ServiceAmounts, TileReportAnswer, ZoneCategory,
} from "./protocol";
import { Random } from "./random";
import { YearForecast } from "./serviceFunding";
import { Tile } from "./tile";
import * as TileValues from "./tileValues";
import { FieldRule, fieldsReason, FieldRules, hasFields, isRecord, isWholeNumberIn, oneOf } from "./validation";

// How the simulation answers the queries a player sends it, which protocol.ts defines. They arrive untrusted, like
// commands: the simulation validates each one before it answers it. Answering reads the city and changes nothing.

// What the simulation answers from: its map, its block maps, the power scan's grid, and the budget, which forecasts
// the year end as Budget.forecast in budget.js does
export interface QuerySources {
  map: {width: number, height: number, getTile(x: number, y: number): Tile};
  blockMaps: Record<string, BlockMap>;
  powerGridMap: BlockMap;
  budget: BudgetSource & {forecast(wholePercents: Partial<ServiceAmounts>): YearForecast};
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
  tileReport: {x: "required", y: "required"},
  budgetForecast: {fire: "optional", police: "optional", road: "optional"},
  mapPreview: {seed: "required"},
} satisfies {[T in QueryType]: FieldRules<Extract<Query, {type: T}>>};

// Why the simulation rejects this query on a map of this size, or null when it is valid. A valid query is a Query:
// exactly its type's fields, each one the protocol allows. A reason quotes no value from the query, so a hostile query
// can't make it long.
export function queryRejection(query: unknown, width: number, height: number): string | null {
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

    case "tileReport":
      return isWholeNumberIn(query.x, 0, width - 1) && isWholeNumberIn(query.y, 0, height - 1) ? null :
        `the tile is an x from 0 to ${width - 1} and a y from 0 to ${height - 1}, in whole numbers`;

    case "budgetForecast":
      return fundingRejection(query);

    case "mapPreview":
      return isWholeNumberIn(query.seed, 0, MAX_SEED) ? null : "the seed is a uint32";
  }
}

// The answer to a query asked before any city has started: the only query that needs no city is a map preview
export function answerQueryWithoutCity(query: unknown): QueryAnswer {
  if (!isRecord(query) || query.type !== "mapPreview") {
    return {type: "rejected", reason: "no city has started"};
  }

  // No map is needed to check a preview: only a tile report's checks read its size
  const reason = queryRejection(query, 0, 0);
  return reason === null ? mapPreview(query.seed as number) : {type: "rejected", reason};
}

// The answer to a query, or its rejection. The values are a copy, so nothing done with an answer reaches the city.
export function answerQuery(query: unknown, sources: QuerySources): QueryAnswer {
  const reason = queryRejection(query, sources.map.width, sources.map.height);
  if (reason !== null) {
    return {type: "rejected", reason};
  }

  const valid = query as Query;
  switch (valid.type) {
    case "overlay":
      return overlay(valid.layer, sources);

    case "tileReport":
      return tileReport(valid.x, valid.y, sources);

    case "budgetForecast":
      return budgetForecast(valid, sources);

    case "mapPreview":
      return mapPreview(valid.seed);
  }
}

// The map a new city on the seed starts on, which the generator draws from the seed's map stream alone
function mapPreview(seed: number): MapPreviewAnswer {
  const map = MapGenerator(Random.mapStream(seed));
  const tiles = map.getTileValuesForPainting(0, 0, map.width, map.height, []);

  return {type: "mapPreview", seed, width: map.width, height: map.height, tiles};
}

function overlay(layer: OverlayLayer, sources: QuerySources): OverlayAnswer {
  const source = LAYERS[layer];
  const map = source.blockMap === null ? sources.powerGridMap : sources.blockMaps[source.blockMap];

  return {
    type: "overlay", layer, blockSize: map.blockSize, width: map.width, height: map.height, low: source.low,
    high: source.high, values: map.save(),
  };
}

// The first tile of each category, in order: a tile belongs to the last category whose first tile it reaches. This is
// idArray in tool.cpp of the original's MicropolisCore, which doZoneStatus searches. The original also ends the table
// at 956, the first tile it has no category for, which it reports past the end of its list of names; the port's
// tiles from 956 on are churches it never builds, and fall in the last category.
const CATEGORY_STARTS: [number, ZoneCategory][] = [
  [TileValues.DIRT, "CLEAR"], [TileValues.RIVER, "WATER"], [TileValues.TREEBASE, "TREES"],
  [TileValues.RUBBLE, "RUBBLE"], [TileValues.FLOOD, "FLOOD"], [TileValues.RADTILE, "RADIOACTIVE_WASTE"],
  [TileValues.FIRE, "FIRE"], [TileValues.ROADBASE, "ROAD"], [TileValues.POWERBASE, "POWER"],
  [TileValues.RAILBASE, "RAIL"], [TileValues.RESBASE, "RESIDENTIAL"], [TileValues.COMBASE, "COMMERCIAL"],
  [TileValues.INDBASE, "INDUSTRIAL"], [TileValues.PORTBASE, "SEAPORT"], [TileValues.AIRPORTBASE, "AIRPORT"],
  [TileValues.COALBASE, "COAL_POWER"], [TileValues.FIRESTBASE, "FIRE_STATION"],
  [TileValues.POLICESTBASE, "POLICE_STATION"], [TileValues.STADIUMBASE, "STADIUM"],
  [TileValues.NUCLEARBASE, "NUCLEAR_POWER"], [TileValues.HBRDG0, "DRAWBRIDGE"], [TileValues.RADAR0, "RADAR"],
  [TileValues.FOUNTAIN, "FOUNTAIN"], [TileValues.INDBASE2, "INDUSTRIAL"], [TileValues.FOOTBALLGAME1, "FOOTBALL_GAME"],
  [TileValues.VBRDG0, "DRAWBRIDGE"], [TileValues.NUKESWIRL1, "URANIUM"],
];

// The category of a tile value without its flags, as doZoneStatus in the original's tool.cpp finds it. The coal
// plant's smoke lies among the industrial tiles, so it is first taken for the plant. MicropolisCore's doZoneStatus
// reports dirt past the end of its list of names (its comment says "This breaks the program"); the older C version,
// doZoneStatus in micropolis-activity's w_tool.c, reports it as clear, and so does the port.
export function zoneCategory(tile: number): ZoneCategory {
  const value = tile >= TileValues.COALSMOKE1 && tile < TileValues.FOOTBALLGAME1 ? TileValues.COALBASE : tile;

  let i = 0;
  while (i + 1 < CATEGORY_STARTS.length && value >= CATEGORY_STARTS[i + 1][0]) {
    i++;
  }

  return CATEGORY_STARTS[i][1];
}

function tileReport(x: number, y: number, sources: QuerySources): TileReportAnswer {
  const tile = sources.map.getTile(x, y);
  const value = tile.getValue();
  const at = (blockMap: string) => sources.blockMaps[blockMap].worldGet(x, y);

  return {
    type: "tileReport", x, y, tile: value, category: zoneCategory(value),
    populationDensity: at("populationDensityMap"), landValue: at("landValueMap"), crime: at("crimeRateMap"),
    pollution: at("pollutionDensityMap"), rateOfGrowth: at("rateOfGrowthMap"),
    burnable: tile.isCombustible(), bulldozable: tile.isBulldozable(), conductive: tile.isConductive(),
    animated: tile.isAnimated(), powered: tile.isPowered(), zoneCentre: tile.isZone(),
    fireStationMap: at("fireStationMap"), fireCoverage: at("fireStationEffectMap"),
    policeStationMap: at("policeStationMap"), policeCoverage: at("policeStationEffectMap"), terrainDensity: at("terrainDensityMap"),
    trafficDensity: at("trafficDensityMap"), cityCentreScore: at("cityCentreDistScoreMap"),
  };
}

function budgetForecast(query: Extract<Query, {type: "budgetForecast"}>, sources: QuerySources): BudgetForecastAnswer {
  const forecast = sources.budget.forecast({road: query.road, fire: query.fire, police: query.police});
  const costs = forecast.wanted;

  return {
    type: "budgetForecast", budget: budgetRecord(sources.budget),
    costs: {road: costs.road, fire: costs.fire, police: costs.police}, fundsChange: forecast.fundsChange,
    fundsAfterYear: forecast.fundsAfterYear,
  };
}
