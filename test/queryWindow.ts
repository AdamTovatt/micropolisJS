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

import {
    GROWTH_BLOCKERS, GROWTH_OUTLOOKS, GROWTH_ZONES, type TileReportAnswer, ZONE_CATEGORIES, type ZoneGrowthReport,
} from "../src/protocol";
import { queryView } from "../src/queryWindow";

// A report made up for the view, not one a city gave: each value is different, and each band shows a different label,
// so a field shown in another's place shows up as a difference
const REPORT: TileReportAnswer = {
    type: "tileReport", x: 27, y: 13, tile: 301, category: "RESIDENTIAL",
    populationDensity: 152, landValue: 79, crime: 119, pollution: 43, rateOfGrowth: 175,
    burnable: true, bulldozable: true, conductive: true, animated: false, powered: true, zoneCentre: true,
    fireStationMap: 31, fireCoverage: 1000, policeStationMap: 250, policeCoverage: 54, terrainDensity: 7,
    trafficDensity: 12, cityCentreScore: -44, growth: null,
};

describe("the query window's view", () => {

    it("shows the report's bands as text, and its raw values for the debug rows", () => {
        expect(queryView(REPORT)).toEqual({
            category: "Residential",
            hasPower: "Yes",
            growth: null,
            populationDensityBand: "High",
            landValueBand: "Lower Class",
            crimeBand: "Light",
            pollutionBand: "Moderate",
            rateOfGrowthBand: "Fast Growth",
            position: "27, 13",
            tile: "301",
            fireStationMap: "31",
            fireCoverage: "1000",
            terrainDensity: "7",
            policeStationMap: "250",
            policeCoverage: "54",
            cityCentreScore: "-44",
            rateOfGrowth: "175",
            pollution: "43",
            crime: "119",
            landValue: "79",
            trafficDensity: "12",
            populationDensity: "152",
            burnable: "✔",
            bulldozable: "✔",
            conductive: "✔",
            animated: "✘",
            powered: "✔",
            zoneCentre: "✔",
        });
    });

    // stri.219 in the original's resources, which lists industrial and the drawbridge twice
    it("names each category as the original's list of names does", () => {
        const names = ZONE_CATEGORIES.map((category) => queryView({...REPORT, category}).category);

        expect(names).toEqual([
            "Clear", "Water", "Trees", "Rubble", "Flood", "Radioactive Waste", "Fire", "Road", "Power", "Rail",
            "Residential", "Commercial", "Industrial", "Seaport", "Airport", "Coal Power", "Fire Department",
            "Police Department", "Stadium", "Nuclear Power", "Draw Bridge", "Radar Dish", "Fountain",
            "Steelers 38  Bears 3", "Ur 238",
        ]);
    });
});

// A zone's growth made up for the view, a home that every note applies to
const GROWTH: ZoneGrowthReport = {
    zone: "RESIDENTIAL", x: 28, y: 14, score: -2400, outlook: "HOLDS_STEADY", assessedNowAndThen: true,
    wayAtEdge: false, blockers: ["NO_POWER", "LOW_DEMAND", "TOO_POLLUTED"],
};

describe("the query window's growth", () => {

    it("words where the zone stands, what holds it back and its notes, with its score and centre for the debug " +
       "rows", () => {
        expect(queryView({...REPORT, growth: GROWTH}).growth).toEqual({
            outlook: "Holding steady",
            blockers: ["No power", "Low demand for housing", "Too polluted for anyone to move in"],
            nowAndThen: "Homes are assessed now and then",
            noWayOut: "No road or path at its edge: its people may move out",
            score: "-2400",
            centre: "28, 14",
        });
    });

    it("leaves out the notes on a zone assessed whenever the scan finds it, with a way out at its edge", () => {
        const growth = queryView({...REPORT, growth: {...GROWTH, assessedNowAndThen: false, wayAtEdge: true}}).growth;

        expect([growth?.nowAndThen, growth?.noWayOut]).toEqual([null, null]);
    });

    it("words each outlook apart", () => {
        const words = GROWTH_OUTLOOKS.map(
            (outlook) => queryView({...REPORT, growth: {...GROWTH, outlook}}).growth?.outlook);

        expect(words.every((word) => typeof word === "string" && word !== "")).toBe(true);
        expect(new Set(words).size).toBe(GROWTH_OUTLOOKS.length);
    });

    it.each(GROWTH_ZONES)("words each blocker of a %s zone apart", (zone) => {
        const growth = queryView({...REPORT, growth: {...GROWTH, zone, blockers: [...GROWTH_BLOCKERS]}}).growth;

        expect(growth?.blockers.every((blocker) => typeof blocker === "string" && blocker !== "")).toBe(true);
        expect(new Set(growth?.blockers).size).toBe(GROWTH_BLOCKERS.length);
    });

    it.each(GROWTH_ZONES)("words both notes on a %s zone, apart", (zone) => {
        const growth = queryView({
            ...REPORT, growth: {...GROWTH, zone, assessedNowAndThen: true, wayAtEdge: false},
        }).growth;
        const notes = [growth?.nowAndThen, growth?.noWayOut];

        expect(notes.every((note) => typeof note === "string" && note !== "")).toBe(true);
        expect(new Set(notes).size).toBe(notes.length);
    });

    it("names the demand for the zone's own kind", () => {
        const lowDemand = GROWTH_ZONES.map(
            (zone) => queryView({...REPORT, growth: {...GROWTH, zone, blockers: ["LOW_DEMAND"]}}).growth?.blockers);

        expect(lowDemand).toEqual([
            ["Low demand for housing"], ["Low demand for commerce"], ["Low demand for industry"],
        ]);
    });
});

describe("the query window's powered row", () => {

    it.each([
        ["a powered zone's centre", {zoneCentre: true, conductive: true, powered: true}, "Yes"],
        ["an unpowered zone's centre", {zoneCentre: true, conductive: true, powered: false}, "No"],
        ["a powered power line", {category: "POWER", zoneCentre: false, conductive: true, powered: true}, "Yes"],
        ["an unpowered power line", {category: "POWER", zoneCentre: false, conductive: true, powered: false}, "No"],
        ["water", {category: "WATER", zoneCentre: false, conductive: false, powered: false}, null],
        ["a park", {category: "FOUNTAIN", zoneCentre: false, conductive: false, powered: false}, null],
    ] as const)("for %s is %p", (_, tile, shown) => {
        expect(queryView({...REPORT, ...tile}).hasPower).toBe(shown);
    });
});

// The label the original shows for each value, as getDensity in MicropolisCore's tool.cpp sorts the values and
// stri.202 names the bands: each band's ends, and the ends of each map's range
describe("the query window's bands, as the original's getDensity sorts them", () => {

    it.each([
        [0, "Low"], [63, "Low"], [64, "Medium"], [127, "Medium"], [128, "High"], [191, "High"], [192, "Very High"],
        [255, "Very High"], [256, "Low"], [510, "Very High"],
    ])("shows a population density of %i as %s", (populationDensity, label) => {
        expect(queryView({...REPORT, populationDensity}).populationDensityBand).toBe(label);
    });

    it.each([
        [0, "Slum"], [29, "Slum"], [30, "Lower Class"], [79, "Lower Class"], [80, "Middle Class"],
        [149, "Middle Class"], [150, "High"], [250, "High"],
    ])("shows a land value of %i as %s", (landValue, label) => {
        expect(queryView({...REPORT, landValue}).landValueBand).toBe(label);
    });

    it.each([
        [0, "Safe"], [63, "Safe"], [64, "Light"], [127, "Light"], [128, "Moderate"], [191, "Moderate"],
        [192, "Dangerous"], [250, "Dangerous"],
    ])("shows a crime rate of %i as %s", (crime, label) => {
        expect(queryView({...REPORT, crime}).crimeBand).toBe(label);
    });

    it.each([
        [0, "None"], [1, "Moderate"], [63, "Moderate"], [64, "Moderate"], [127, "Moderate"], [128, "Heavy"],
        [191, "Heavy"], [192, "Very Heavy"], [255, "Very Heavy"],
    ])("shows a pollution of %i as %s", (pollution, label) => {
        expect(queryView({...REPORT, pollution}).pollutionBand).toBe(label);
    });

    it.each([
        [-200, "Declining"], [-1, "Declining"], [0, "Stable"], [1, "Slow Growth"], [100, "Slow Growth"],
        [101, "Fast Growth"], [200, "Fast Growth"],
    ])("shows a rate of growth of %i as %s", (rateOfGrowth, label) => {
        expect(queryView({...REPORT, rateOfGrowth}).rateOfGrowthBand).toBe(label);
    });
});
