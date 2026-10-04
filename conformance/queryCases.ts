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

import { cityFromSave, cityFromSeed, SaveData, Simulation, Speed } from "../headless/city";
import {
  BudgetForecastAnswer, BudgetRecord, EvaluationRecord, OVERLAY_LAYERS, OverlayAnswer, QueryAnswer, SettingsRecord,
  TileReportAnswer, ZONE_CATEGORIES,
} from "../src/protocol";
import { answerQueryWithoutCity, zoneCategory } from "../src/queries";
import { TILE_COUNT } from "../src/tileValues";

// What queries.json holds: what the simulation answers to queries, and the records it produces, over the fixtures'
// saves, which the C# implementation of the game rules must reproduce. A map preview's answer is the map maps.json
// holds, so none is listed here.

// A save the generator wrote, named by its fixture and checkpoint, such as town.built
export interface NamedSave {
  name: string;
  save: SaveData;
}

// A query and its answer, about the named save's city, or asked before any city has started when save is null. funds,
// where given, replaces the funds the save holds before the query is asked.
export interface AnsweredQuery {
  save: string | null;
  funds?: number;
  query: unknown;
  answer: QueryAnswer;
}

// A city the records come from: a save the generator wrote, by name, or a new city on the seed's map at the level
export type RecordedCity = string | {seed: number, level: number};

// The records a city produces once the commands given have applied to it, in order
export interface CityRecords {
  city: RecordedCity;
  commands: unknown[];
  evaluation: EvaluationRecord;
  budget: BudgetRecord;
  settings: SettingsRecord;
}

export interface QueryFile {
  // The category of each tile value, from 0
  categories: string[];
  records: CityRecords[];
  answers: AnsweredQuery[];
}

// Records the fixtures never produce: a city at the hardest level, with disasters on, auto-budget off and the
// game paused
const VARIED_RECORDS: {city: {seed: number, level: number}, commands: unknown[]}[] = [
  {city: {seed: 7, level: 2}, commands: [
    {type: "setDisasters", on: true}, {type: "setAutoBudget", on: false}, {type: "setSpeed", speed: 0},
  ]},
];

// The fundings a forecast is asked about in each save: none named, every service named, and one
const FORECASTS = [
  {type: "budgetForecast"},
  {type: "budgetForecast", road: 0, fire: 50, police: 100},
  {type: "budgetForecast", fire: 33},
];

// Queries the simulation rejects on the game's map, one or more for each reason it gives
const REJECTED_QUERIES: unknown[] = [
  null, [], "overlay", {}, {type: "weather"}, {type: 7},
  {type: "overlay"}, {type: "overlay", layer: "crime", extra: 1},
  {type: "tileReport", x: 1}, {type: "budgetForecast", tax: 7}, {type: "mapPreview"},
  {type: "overlay", layer: "weather"}, {type: "overlay", layer: 3},
  {type: "tileReport", x: -1, y: 0}, {type: "tileReport", x: 120, y: 0}, {type: "tileReport", x: 0, y: 100},
  {type: "tileReport", x: 1.5, y: 0},
  {type: "tileReport", x: "1", y: 0},
  {type: "budgetForecast", road: 101}, {type: "budgetForecast", fire: -1}, {type: "budgetForecast", police: 50.5},
  {type: "budgetForecast", road: "50"},
  {type: "mapPreview", seed: -1}, {type: "mapPreview", seed: 0.5}, {type: "mapPreview", seed: 2 ** 32},
  {type: "mapPreview", seed: "1"},
];

// Queries asked before any city has started, every one rejected: a map preview's answer is the map maps.json holds
const QUERIES_WITHOUT_CITY: unknown[] = [
  {type: "tileReport", x: 1, y: 1}, {type: "overlay", layer: "crime"}, "mapPreview", null,
  {type: "mapPreview", seed: -1}, {type: "mapPreview", seed: 1, extra: true},
];

// The reasons queryRejection and answerQueryWithoutCity give, told apart by their words, with each number they quote
// written #. The queries must reach every one, and a reason they reach that isn't listed fails too, so a reason the
// simulation gains is listed.
const REJECTION_REASONS = [
  "not a query",
  "no city has started",
  "the overlay query has exactly the fields type, layer",
  "the tileReport query has exactly the fields type, x, y",
  "the budgetForecast query has exactly the fields type, and may have fire, police, road",
  "the mapPreview query has exactly the fields type, seed",
  `the layer is one of ${OVERLAY_LAYERS.join(", ")}`,
  "the tile is an x from # to # and a y from # to #, in whole numbers",
  "road funding is a whole percent from # to #",
  "fire funding is a whole percent from # to #",
  "police funding is a whole percent from # to #",
  "the seed is a uint#",
];

function answered(save: string | null, query: unknown, answer: QueryAnswer): AnsweredQuery {
  return {save, query, answer};
}

// What the cash the year end would have is short of: nothing, as in a broke city, or every service's cost
function shortfall(answer: QueryAnswer): "none" | "partly" | "wholly" {
  const {budget, costs} = answer as BudgetForecastAnswer;
  const cash = budget.funds + budget.taxesCollected;
  const cost = costs.road + costs.fire + costs.police;
  return cash > cost || cost === 0 ? "none" : cash > 0 ? "partly" : "wholly";
}

// The forecasts in the first save whose year end has no cash for its services, with the funds set to half of what
// the services cost and to exactly what they cost: the funds pay some services and scale one back, as no fixture's
// year end leaves them to
function shortForecasts(saves: NamedSave[]): AnsweredQuery[] {
  const broke = saves.find(({save}) => shortfall(cityFromSave(save).answerQuery(FORECASTS[0])) === "wholly");
  if (broke === undefined) {
    return [];
  }

  const cost = (cityFromSave(broke.save).answerQuery(FORECASTS[0]) as BudgetForecastAnswer).costs;
  const total = cost.road + cost.fire + cost.police;

  return [Math.floor(total / 2), total].flatMap((funds) => {
    const city = cityFromSave(withFunds(broke.save, funds));
    return FORECASTS.map((query) => ({save: broke.name, funds, query, answer: city.answerQuery(query)}));
  });
}

// The save with its funds replaced, as an answer that names funds asks about it
function withFunds(save: SaveData, funds: number): SaveData {
  const {budget} = save as SaveData & {budget: object};
  return {...save, budget: {...budget, totalFunds: funds}} as SaveData;
}

function recorded(city: RecordedCity, commands: unknown[], simulation: Simulation): CityRecords {
  simulation.applyCommands(commands.map((command) => ({player: "conformance", command})));
  return {city, commands, evaluation: simulation.evaluationRecord(), budget: simulation.budgetRecord(),
          settings: simulation.settingsRecord()};
}

// Each tile's report the first time its category is met, in the saves' order, and the report at each city's centre
function tileReports(name: string, city: Simulation, reported: Set<string>): AnsweredQuery[] {
  const map = city.getMap() as unknown as {width: number, height: number, cityCentreX: number, cityCentreY: number,
                                            getTileValue(x: number, y: number): number};
  const ask = (x: number, y: number) => {
    const query = {type: "tileReport", x, y};
    return answered(name, query, city.answerQuery(query));
  };

  const reports = [ask(map.cityCentreX, map.cityCentreY)];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const category = zoneCategory(map.getTileValue(x, y));
      if (!reported.has(category)) {
        reported.add(category);
        reports.push(ask(x, y));
      }
    }
  }

  return reports;
}

// Whether an overlay's answer holds a value other than 0, which a layer the city never computed doesn't
function hasValues(answer: QueryAnswer): boolean {
  return (answer as OverlayAnswer).values.some((value) => value !== 0);
}

export function queryFile(saves: NamedSave[], ensureCovers: (condition: boolean, message: string) => void): QueryFile {
  const categories = Array.from({length: TILE_COUNT}, (_, value) => zoneCategory(value));
  const records: CityRecords[] = [];
  const answers: AnsweredQuery[] = [];
  const reported = new Set<string>();
  const overlaid = new Set<string>();

  for (const {name, save} of saves) {
    const city = cityFromSave(save);
    records.push(recorded(name, [], city));

    answers.push(...tileReports(name, city, reported));
    answers.push(...FORECASTS.map((query) => answered(name, query, city.answerQuery(query))));

    // Each layer once, from the first save where it holds a value other than 0
    for (const layer of OVERLAY_LAYERS.filter((layer) => !overlaid.has(layer))) {
      const query = {type: "overlay", layer};
      const answer = city.answerQuery(query);
      if (hasValues(answer)) {
        overlaid.add(layer);
        answers.push(answered(name, query, answer));
      }
    }
  }

  records.push(...VARIED_RECORDS.map(({city, commands}) =>
    recorded(city, commands, cityFromSeed(city.seed, city.level, Speed.medium))));

  ensureCovers(saves.length > 0, "a save to ask about");
  const first = cityFromSave(saves[0].save);
  // The far corner of the map, the last tile a report is given for
  answers.push(answered(saves[0].name, {type: "tileReport", x: 119, y: 99}, first.answerQuery({type: "tileReport", x: 119, y: 99})));
  answers.push(...REJECTED_QUERIES.map((query) => answered(saves[0].name, query, first.answerQuery(query))));
  answers.push(...QUERIES_WITHOUT_CITY.map((query) => answered(null, query, answerQueryWithoutCity(query))));
  answers.push(...shortForecasts(saves));

  for (const layer of OVERLAY_LAYERS) {
    ensureCovers(overlaid.has(layer), `an overlay of ${layer} holding a value other than 0`);
  }

  for (const category of ZONE_CATEGORIES) {
    ensureCovers(categories.includes(category), `a tile value of the category ${category}`);
  }

  const reports = answers.map(({answer}) => answer).filter((answer): answer is TileReportAnswer => answer.type === "tileReport");
  ensureCovers(reports.some((report) => report.powered && report.zoneCentre), "a tile report of a powered zone centre");
  ensureCovers(reports.some((report) => report.fireCoverage > 0 && report.policeCoverage > 0),
               "a tile report covered by fire and police stations");
  ensureCovers(answers.some(({answer}) => answer.type === "budgetForecast" && answer.fundsChange < 0),
               "a forecast of a year that takes funds away");
  ensureCovers(answers.some(({answer}) => answer.type === "budgetForecast" && shortfall(answer) === "partly"),
               "a forecast of a year whose cash pays only some of the services");
  ensureCovers(records.some(({evaluation}) => evaluation.problems.length > 0 && evaluation.scoreBreakdown.length > 0),
               "an evaluation with problems and a score breakdown");
  ensureCovers(records.some(({budget}) => [budget.funding.road, budget.funding.fire, budget.funding.police]
    .some((funding) => funding > 0 && funding < 1)), "a budget funding a service in part");
  ensureCovers(records.some(({evaluation}) => evaluation.level !== 0), "an evaluation of a city above the easiest level");
  ensureCovers(records.some(({settings}) => settings.disasters && !settings.autoBudget && settings.speed === 0),
               "settings with disasters on, the budget set by hand and the game paused");

  const reasons = new Set(answers.map(({answer}) => answer)
    .filter((answer) => answer.type === "rejected")
    .map((answer) => (answer as {reason: string}).reason.replace(/[0-9-][0-9e+.-]*/g, "#")));
  const missing = REJECTION_REASONS.filter((reason) => !reasons.has(reason));
  const unlisted = Array.from(reasons).filter((reason) => !REJECTION_REASONS.includes(reason));
  ensureCovers(missing.length === 0 && unlisted.length === 0,
               `every reason the queries are rejected for: missing [${missing.join("; ")}], ` +
               `reached but not in REJECTION_REASONS [${unlisted.join("; ")}]`);

  return {categories, records, answers};
}
