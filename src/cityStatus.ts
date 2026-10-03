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

import * as Messages from "./messages";

// The conditions that limit a city's growth, published by the simulation each cycle as persistent status.
// The record is derived from the city each cycle and never saved.
export interface CityStatus {
  // Power the coal and nuclear plants can deliver, and the power the grid draws, as of the last power scan.
  // The load is counted in the scan's steps, which revisit branch points, and exceeds the capacity exactly when
  // that scan reported NOT_ENOUGH_POWER.
  readonly powerCapacity: number;
  readonly powerLoad: number;

  // Whether residential, commercial or industrial demand is held at zero for want of a stadium, airport or
  // seaport.
  readonly residentialCapped: boolean;
  readonly commercialCapped: boolean;
  readonly industrialCapped: boolean;

  // The advisor conditions that hold, named by their message in messages.ts, in the order of ADVISOR_CONDITIONS.
  readonly conditions: readonly string[];
}

// The census figures the advisor conditions read.
export interface AdvisorCensus {
  airportPop: number;
  coalPowerPop: number;
  comPop: number;
  comZonePop: number;
  crimeAverage: number;
  fireStationPop: number;
  indPop: number;
  indZonePop: number;
  nuclearPowerPop: number;
  policeStationPop: number;
  pollutionAverage: number;
  poweredZoneCount: number;
  railTotal: number;
  resPop: number;
  resZonePop: number;
  roadTotal: number;
  seaportPop: number;
  stadiumPop: number;
  totalPop: number;
  trafficAverage: number;
  unpoweredZoneCount: number;
}

// The budget figures the advisor conditions read.
export interface AdvisorBudget {
  cityTax: number;
  fireEffect: number;
  policeEffect: number;
  roadEffect: number;
  // Budget is JavaScript, so the compiler can't check these names against it: a mismatch reads undefined and the
  // funding conditions never hold. The real-Budget test in test/cityStatus.ts checks them.
  MAX_FIRESTATION_EFFECT: number;
  MAX_POLICESTATION_EFFECT: number;
  MAX_ROAD_EFFECT: number;
}

// The power figures of the last power scan.
export interface AdvisorPower {
  powerCapacity: number;
  powerLoad: number;
}

export interface CityFigures {
  budget: AdvisorBudget;
  census: AdvisorCensus;
  power: AdvisorPower;
}

export interface CapFlags {
  comCap: boolean;
  indCap: boolean;
  resCap: boolean;
}

type Predicate = (figures: CityFigures) => boolean;

function totalZonePop(census: AdvisorCensus) {
  return census.resZonePop + census.comZonePop + census.indZonePop;
}

function powerPop(census: AdvisorCensus) {
  return census.nuclearPowerPop + census.coalPowerPop;
}

function blackouts(census: AdvisorCensus) {
  const zoneCount = census.unpoweredZoneCount + census.poweredZoneCount;
  return zoneCount > 0 && census.poweredZoneCount / zoneCount < 0.7 && powerPop(census) > 0;
}

// Each advisor condition and the test for it. This is the single home of the tests: Simulation._sendMessages
// asks conditionHolds when it decides whether to send a message, and the status record lists every condition
// that holds. NOT_ENOUGH_POWER is the power scan's own verdict, which it reports as it finishes.
const ADVISOR_CONDITIONS: ReadonlyArray<{condition: string, holds: Predicate}> = [
  {condition: Messages.NOT_ENOUGH_POWER, holds: ({power}) => power.powerLoad > power.powerCapacity},
  {condition: Messages.NEED_ELECTRICITY, holds: ({census}) => totalZonePop(census) > 10 && powerPop(census) === 0},
  {condition: Messages.BLACKOUTS_REPORTED, holds: ({census}) => blackouts(census)},
  {condition: Messages.NEED_STADIUM, holds: ({census}) => census.resPop > 500 && census.stadiumPop === 0},
  {condition: Messages.NEED_AIRPORT, holds: ({census}) => census.comPop > 100 && census.airportPop === 0},
  {condition: Messages.NEED_SEAPORT, holds: ({census}) => census.indPop > 70 && census.seaportPop === 0},
  {condition: Messages.NEED_MORE_RESIDENTIAL,
   holds: ({census}) => Math.floor(totalZonePop(census) / 4) >= census.resZonePop},
  {condition: Messages.NEED_MORE_COMMERCIAL,
   holds: ({census}) => Math.floor(totalZonePop(census) / 8) >= census.comZonePop},
  {condition: Messages.NEED_MORE_INDUSTRIAL,
   holds: ({census}) => Math.floor(totalZonePop(census) / 8) >= census.indZonePop},
  {condition: Messages.NEED_MORE_ROADS,
   holds: ({census}) => totalZonePop(census) > 10 && totalZonePop(census) * 2 > census.roadTotal},
  {condition: Messages.NEED_MORE_RAILS,
   holds: ({census}) => totalZonePop(census) > 50 && totalZonePop(census) > census.railTotal},
  {condition: Messages.HIGH_POLLUTION, holds: ({census}) => census.pollutionAverage > 60},
  {condition: Messages.HIGH_CRIME, holds: ({census}) => census.crimeAverage > 100},
  {condition: Messages.TRAFFIC_JAMS, holds: ({census}) => census.trafficAverage > 60},
  {condition: Messages.NEED_FIRE_STATION, holds: ({census}) => census.totalPop > 60 && census.fireStationPop === 0},
  {condition: Messages.NEED_POLICE_STATION,
   holds: ({census}) => census.totalPop > 60 && census.policeStationPop === 0},
  {condition: Messages.TAX_TOO_HIGH, holds: ({budget}) => budget.cityTax > 12},
  {condition: Messages.ROAD_NEEDS_FUNDING,
   holds: ({budget, census}) => budget.roadEffect < Math.floor(5 * budget.MAX_ROAD_EFFECT / 8) &&
                                census.roadTotal > 30},
  {condition: Messages.FIRE_STATION_NEEDS_FUNDING,
   holds: ({budget, census}) => budget.fireEffect < Math.floor(7 * budget.MAX_FIRESTATION_EFFECT / 10) &&
                                census.totalPop > 20},
  {condition: Messages.POLICE_NEEDS_FUNDING,
   holds: ({budget, census}) => budget.policeEffect < Math.floor(7 * budget.MAX_POLICESTATION_EFFECT / 10) &&
                                census.totalPop > 20},
];

export function conditionHolds(condition: string, census: AdvisorCensus, budget: AdvisorBudget,
                               power: AdvisorPower): boolean {
  for (const entry of ADVISOR_CONDITIONS) {
    if (entry.condition === condition) {
      return entry.holds({budget, census, power});
    }
  }

  throw new Error(`Unknown advisor condition ${condition}`);
}

export function buildCityStatus(census: AdvisorCensus, budget: AdvisorBudget, power: AdvisorPower,
                                caps: CapFlags): CityStatus {
  const figures = {budget, census, power};

  return {
    commercialCapped: caps.comCap,
    conditions: ADVISOR_CONDITIONS.filter((entry) => entry.holds(figures)).map((entry) => entry.condition),
    industrialCapped: caps.indCap,
    powerCapacity: power.powerCapacity,
    powerLoad: power.powerLoad,
    residentialCapped: caps.resCap,
  };
}
