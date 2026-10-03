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

import { AdvisorBudget, AdvisorCensus, AdvisorPower, buildCityStatus, conditionHolds } from "../src/cityStatus";
import * as Messages from "../src/messages";

interface Overrides {
    budget?: Partial<AdvisorBudget>;
    census?: Partial<AdvisorCensus>;
    power?: Partial<AdvisorPower>;
}

// A city in which no advisor condition holds: 20 zones, well balanced, powered, roaded, funded and calm.
const CALM_CENSUS: AdvisorCensus = {
    airportPop: 0,
    coalPowerPop: 1,
    comPop: 50,
    comZonePop: 5,
    crimeAverage: 0,
    fireStationPop: 0,
    indPop: 50,
    indZonePop: 5,
    nuclearPowerPop: 0,
    policeStationPop: 0,
    pollutionAverage: 0,
    poweredZoneCount: 20,
    railTotal: 0,
    resPop: 100,
    resZonePop: 10,
    roadTotal: 40,
    seaportPop: 0,
    stadiumPop: 0,
    totalPop: 50,
    trafficAverage: 0,
    unpoweredZoneCount: 0,
};

const CALM_BUDGET: AdvisorBudget = {
    MAX_FIRE_STATION_EFFECT: 1000,
    MAX_POLICE_STATION_EFFECT: 1000,
    MAX_ROAD_EFFECT: 32,
    cityTax: 7,
    fireEffect: 1000,
    policeEffect: 1000,
    roadEffect: 32,
};

const CALM_POWER: AdvisorPower = {powerCapacity: 700, powerLoad: 100};

const NO_CAPS = {comCap: false, indCap: false, resCap: false};

function city(overrides: Overrides) {
    return {
        budget: {...CALM_BUDGET, ...overrides.budget},
        census: {...CALM_CENSUS, ...overrides.census},
        power: {...CALM_POWER, ...overrides.power},
    };
}

// Each condition's figures at its thresholds: the last value that triggers it, and the first that does not.
const THRESHOLDS: Array<[string, string, Overrides, boolean]> = [
    [Messages.NOT_ENOUGH_POWER, "load one past capacity", {power: {powerCapacity: 700, powerLoad: 701}}, true],
    [Messages.NOT_ENOUGH_POWER, "load equal to capacity", {power: {powerCapacity: 700, powerLoad: 700}}, false],

    [Messages.NEED_ELECTRICITY, "11 zones, no plant", {census: {coalPowerPop: 0, comZonePop: 0, indZonePop: 0,
                                                                resZonePop: 11}}, true],
    [Messages.NEED_ELECTRICITY, "10 zones, no plant", {census: {coalPowerPop: 0, comZonePop: 0, indZonePop: 0,
                                                                resZonePop: 10}}, false],
    [Messages.NEED_ELECTRICITY, "11 zones, a nuclear plant", {census: {coalPowerPop: 0, comZonePop: 0,
                                                                       indZonePop: 0, nuclearPowerPop: 1,
                                                                       resZonePop: 11}}, false],

    [Messages.BLACKOUTS_REPORTED, "60% of zones powered", {census: {poweredZoneCount: 6, unpoweredZoneCount: 4}},
     true],
    [Messages.BLACKOUTS_REPORTED, "70% of zones powered", {census: {poweredZoneCount: 7, unpoweredZoneCount: 3}},
     false],
    [Messages.BLACKOUTS_REPORTED, "60% powered, no plant", {census: {coalPowerPop: 0, poweredZoneCount: 6,
                                                                     unpoweredZoneCount: 4}}, false],
    [Messages.BLACKOUTS_REPORTED, "no zones", {census: {poweredZoneCount: 0, unpoweredZoneCount: 0}}, false],

    [Messages.NEED_STADIUM, "501 residents, no stadium", {census: {resPop: 501}}, true],
    [Messages.NEED_STADIUM, "500 residents, no stadium", {census: {resPop: 500}}, false],
    [Messages.NEED_STADIUM, "501 residents, a stadium", {census: {resPop: 501, stadiumPop: 1}}, false],

    [Messages.NEED_AIRPORT, "101 commerce, no airport", {census: {comPop: 101}}, true],
    [Messages.NEED_AIRPORT, "100 commerce, no airport", {census: {comPop: 100}}, false],
    [Messages.NEED_AIRPORT, "101 commerce, an airport", {census: {airportPop: 1, comPop: 101}}, false],

    [Messages.NEED_SEAPORT, "71 industry, no seaport", {census: {indPop: 71}}, true],
    [Messages.NEED_SEAPORT, "70 industry, no seaport", {census: {indPop: 70}}, false],
    [Messages.NEED_SEAPORT, "71 industry, a seaport", {census: {indPop: 71, seaportPop: 1}}, false],

    [Messages.NEED_MORE_RESIDENTIAL, "5 of 20 zones residential",
     {census: {comZonePop: 10, indZonePop: 5, resZonePop: 5}}, true],
    [Messages.NEED_MORE_RESIDENTIAL, "6 of 20 zones residential",
     {census: {comZonePop: 9, indZonePop: 5, resZonePop: 6}}, false],

    [Messages.NEED_MORE_COMMERCIAL, "3 of 24 zones commercial",
     {census: {comZonePop: 3, indZonePop: 8, resZonePop: 13}}, true],
    [Messages.NEED_MORE_COMMERCIAL, "4 of 24 zones commercial",
     {census: {comZonePop: 4, indZonePop: 8, resZonePop: 12}}, false],

    [Messages.NEED_MORE_INDUSTRIAL, "3 of 24 zones industrial",
     {census: {comZonePop: 8, indZonePop: 3, resZonePop: 13}}, true],
    [Messages.NEED_MORE_INDUSTRIAL, "4 of 24 zones industrial",
     {census: {comZonePop: 8, indZonePop: 4, resZonePop: 12}}, false],

    [Messages.NEED_MORE_ROADS, "11 zones, 21 roads", {census: {comZonePop: 0, indZonePop: 0, resZonePop: 11,
                                                               roadTotal: 21}}, true],
    [Messages.NEED_MORE_ROADS, "11 zones, 22 roads", {census: {comZonePop: 0, indZonePop: 0, resZonePop: 11,
                                                               roadTotal: 22}}, false],
    [Messages.NEED_MORE_ROADS, "10 zones, no roads", {census: {comZonePop: 0, indZonePop: 0, resZonePop: 10,
                                                               roadTotal: 0}}, false],

    [Messages.NEED_MORE_RAILS, "51 zones, 50 rails", {census: {comZonePop: 0, indZonePop: 0, railTotal: 50,
                                                               resZonePop: 51}}, true],
    [Messages.NEED_MORE_RAILS, "51 zones, 51 rails", {census: {comZonePop: 0, indZonePop: 0, railTotal: 51,
                                                               resZonePop: 51}}, false],
    [Messages.NEED_MORE_RAILS, "50 zones, no rails", {census: {comZonePop: 0, indZonePop: 0, railTotal: 0,
                                                               resZonePop: 50}}, false],

    [Messages.HIGH_POLLUTION, "pollution 61", {census: {pollutionAverage: 61}}, true],
    [Messages.HIGH_POLLUTION, "pollution 60", {census: {pollutionAverage: 60}}, false],

    [Messages.HIGH_CRIME, "crime 101", {census: {crimeAverage: 101}}, true],
    [Messages.HIGH_CRIME, "crime 100", {census: {crimeAverage: 100}}, false],

    [Messages.TRAFFIC_JAMS, "traffic 60.5", {census: {trafficAverage: 60.5}}, true],
    [Messages.TRAFFIC_JAMS, "traffic 60", {census: {trafficAverage: 60}}, false],

    [Messages.NEED_FIRE_STATION, "61 people, no fire station", {census: {totalPop: 61}}, true],
    [Messages.NEED_FIRE_STATION, "60 people, no fire station", {census: {totalPop: 60}}, false],
    [Messages.NEED_FIRE_STATION, "61 people, a fire station", {census: {fireStationPop: 1, totalPop: 61}}, false],

    [Messages.NEED_POLICE_STATION, "61 people, no police station", {census: {totalPop: 61}}, true],
    [Messages.NEED_POLICE_STATION, "60 people, no police station", {census: {totalPop: 60}}, false],
    [Messages.NEED_POLICE_STATION, "61 people, a police station", {census: {policeStationPop: 1, totalPop: 61}},
     false],

    [Messages.TAX_TOO_HIGH, "tax 13%", {budget: {cityTax: 13}}, true],
    [Messages.TAX_TOO_HIGH, "tax 12%", {budget: {cityTax: 12}}, false],

    [Messages.ROAD_NEEDS_FUNDING, "road effect 19 of 32, 31 roads", {budget: {roadEffect: 19},
                                                                     census: {roadTotal: 31}}, true],
    [Messages.ROAD_NEEDS_FUNDING, "road effect 20 of 32, 31 roads", {budget: {roadEffect: 20},
                                                                     census: {roadTotal: 31}}, false],
    [Messages.ROAD_NEEDS_FUNDING, "road effect 19 of 32, 30 roads", {budget: {roadEffect: 19},
                                                                     census: {roadTotal: 30}}, false],
    [Messages.ROAD_NEEDS_FUNDING, "road effect 20 of 33, where five eighths is 20.625",
     {budget: {MAX_ROAD_EFFECT: 33, roadEffect: 20}, census: {roadTotal: 31}}, false],

    [Messages.FIRE_STATION_NEEDS_FUNDING, "fire effect 699 of 1000, 21 people",
     {budget: {fireEffect: 699}, census: {totalPop: 21}}, true],
    [Messages.FIRE_STATION_NEEDS_FUNDING, "fire effect 700 of 1000, 21 people",
     {budget: {fireEffect: 700}, census: {totalPop: 21}}, false],
    [Messages.FIRE_STATION_NEEDS_FUNDING, "fire effect 699 of 1000, 20 people",
     {budget: {fireEffect: 699}, census: {totalPop: 20}}, false],
    [Messages.FIRE_STATION_NEEDS_FUNDING, "fire effect 700 of 1001, where seven tenths is 700.7",
     {budget: {MAX_FIRE_STATION_EFFECT: 1001, fireEffect: 700}, census: {totalPop: 21}}, false],

    [Messages.POLICE_NEEDS_FUNDING, "police effect 699 of 1000, 21 people",
     {budget: {policeEffect: 699}, census: {totalPop: 21}}, true],
    [Messages.POLICE_NEEDS_FUNDING, "police effect 700 of 1000, 21 people",
     {budget: {policeEffect: 700}, census: {totalPop: 21}}, false],
    [Messages.POLICE_NEEDS_FUNDING, "police effect 699 of 1000, 20 people",
     {budget: {policeEffect: 699}, census: {totalPop: 20}}, false],
    [Messages.POLICE_NEEDS_FUNDING, "police effect 700 of 1001, where seven tenths is 700.7",
     {budget: {MAX_POLICE_STATION_EFFECT: 1001, policeEffect: 700}, census: {totalPop: 21}}, false],
];

describe("the advisor conditions", () => {

    const cases = THRESHOLDS.map(([condition, description, overrides, expected]) =>
        [condition, description, expected ? "holds" : "does not hold", overrides, expected] as const);

    it.each(cases)("%s with %s: %s", (condition, _, __, overrides, expected) => {
        const {budget, census, power} = city(overrides);

        expect(conditionHolds(condition, census, budget, power)).toBe(expected);
    });

    it("rejects an unknown condition", () => {
        const {budget, census, power} = city({});

        expect(() => conditionHolds(Messages.WELCOME, census, budget, power)).toThrow(Messages.WELCOME);
    });
});

describe("the city status record", () => {

    it("lists no condition for a calm city", () => {
        const {budget, census, power} = city({});

        expect(buildCityStatus(census, budget, power, NO_CAPS).conditions).toEqual([]);
    });

    it("lists the conditions that hold in the advisor's order", () => {
        const {budget, census, power} = city({
            budget: {cityTax: 13},
            census: {crimeAverage: 101, indPop: 71, resPop: 501},
            power: {powerCapacity: 700, powerLoad: 701},
        });

        expect(buildCityStatus(census, budget, power, NO_CAPS).conditions).toEqual([
            Messages.NOT_ENOUGH_POWER,
            Messages.NEED_STADIUM,
            Messages.NEED_SEAPORT,
            Messages.HIGH_CRIME,
            Messages.TAX_TOO_HIGH,
        ]);
    });

    it("carries the power capacity and load", () => {
        const {budget, census} = city({});
        const status = buildCityStatus(census, budget, {powerCapacity: 2700, powerLoad: 3100}, NO_CAPS);

        expect([status.powerCapacity, status.powerLoad]).toEqual([2700, 3100]);
    });

    it.each([
        [{comCap: false, indCap: false, resCap: true}, [true, false, false]],
        [{comCap: true, indCap: false, resCap: false}, [false, true, false]],
        [{comCap: false, indCap: true, resCap: false}, [false, false, true]],
        [{comCap: true, indCap: true, resCap: true}, [true, true, true]],
    ])("carries the demand caps %j", (caps, expected) => {
        const {budget, census, power} = city({});
        const status = buildCityStatus(census, budget, power, caps);

        expect([status.residentialCapped, status.commercialCapped, status.industrialCapped]).toEqual(expected);
    });
});
