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

import { type TileReportAnswer, ZONE_CATEGORIES } from "../src/protocol";
import { queryView } from "../src/queryWindow";

// A report made up for the view, not one a city gave: each value is different, and each band shows a different label,
// so a field shown in another's place shows up as a difference
const REPORT: TileReportAnswer = {
    type: "tileReport", x: 27, y: 13, tile: 301, category: "RESIDENTIAL",
    populationDensity: 152, landValue: 79, crime: 119, pollution: 43, rateOfGrowth: 175,
    burnable: true, bulldozable: true, conductive: true, animated: false, powered: true, zoneCentre: true,
    fireStationMap: 31, fireCoverage: 1000, policeStationMap: 250, policeCoverage: 54, terrainDensity: 7,
    trafficDensity: 12, cityCentreScore: -44,
};

describe("the query window's view", () => {

    it("shows the report's bands as text, and its raw values for the debug rows", () => {
        expect(queryView(REPORT)).toEqual({
            category: "Residential",
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
