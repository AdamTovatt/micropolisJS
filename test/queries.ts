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

import { cityFromSeed, Simulation as HeadlessSimulation, Speed } from "../headless/city";
import { fixtureLog } from "../headless/fixtures/index";
import { CommandLog } from "../src/commandLog";
import { CommandQueue } from "../src/commandQueue";
import * as Messages from "../src/messages";
import { startCity } from "../headless/runner";
import {
    OVERLAY_LAYERS, OverlayAnswer, OverlayLayer, QueryAnswer, TileReportAnswer, ZONE_CATEGORIES, ZoneCategory,
} from "../src/protocol";
import { LAYER_PHASES, queryRejection, zoneCategory } from "../src/queries";
import { stateHash } from "../src/stateHash";
import * as TileValues from "../src/tileValues";
import { CityBuilder } from "./helpers/cityBuilder";
import { buildCity, SimulationInstance, YEAR } from "./helpers/simulations";

const MAP_SEED = 2026;
const SIMULATION_SEED = 7;
// The size of every map the game makes
const WIDTH = 120;
const HEIGHT = 100;

// The helpers' city, with a fire and a police station below its road, so that every layer has something to show
function cityWithStations(): SimulationInstance {
    const simulation = buildCity(MAP_SEED, SIMULATION_SEED);
    const builder = new CityBuilder(simulation as unknown as HeadlessSimulation);
    builder.fireStation(45, 48);
    builder.policeStation(49, 48);
    return simulation;
}

function overlay(simulation: SimulationInstance | HeadlessSimulation, layer: OverlayLayer): OverlayAnswer {
    const answer: QueryAnswer = simulation.answerQuery({type: "overlay", layer});
    if (answer.type !== "overlay") {
        throw new Error(`The ${layer} query was not answered: ${JSON.stringify(answer)}`);
    }

    return answer;
}

// Each layer's map, read from the simulation's internals rather than through the query
function layerMap(simulation: SimulationInstance, layer: OverlayLayer) {
    const blockMaps = simulation.blockMaps;
    const maps = {
        landValue: blockMaps.landValueMap, pollution: blockMaps.pollutionDensityMap, crime: blockMaps.crimeRateMap,
        trafficDensity: blockMaps.trafficDensityMap, populationDensity: blockMaps.populationDensityMap,
        policeCoverage: blockMaps.policeStationEffectMap, fireCoverage: blockMaps.fireStationEffectMap,
        rateOfGrowth: blockMaps.rateOfGrowthMap, powerGrid: simulation._powerManager.powerGridMap,
    };

    return maps[layer];
}

describe("an overlay query", () => {

    it.each(OVERLAY_LAYERS)("is valid for the layer %s", (layer) => {
        expect(queryRejection({type: "overlay", layer}, WIDTH, HEIGHT)).toBeNull();
        expect(queryRejection({layer, type: "overlay"}, WIDTH, HEIGHT)).toBeNull();
    });

    it.each([
        ["not an object", "overlay"],
        ["null", null],
        ["an array", [{type: "overlay", layer: "crime"}]],
        ["of an unknown type", {type: "census", layer: "crime"}],
        ["without a type", {layer: "crime"}],
    ])("is not a query when it is %s", (_, query) => {
        expect(queryRejection(query, WIDTH, HEIGHT)).toBe("not a query");
    });

    it.each([
        ["no layer", {type: "overlay"}],
        ["a field it doesn't have", {type: "overlay", layer: "crime", blockSize: 2}],
    ])("is rejected with %s", (_, query) => {
        expect(queryRejection(query, WIDTH, HEIGHT)).toBe("the overlay query has exactly the fields type, layer");
    });

    it.each([["an unknown layer", "terrainDensity"], ["a layer that isn't a string", 3], ["a null layer", null]])(
        "is rejected with %s", (_, layer) => {
            expect(queryRejection({type: "overlay", layer}, WIDTH, HEIGHT)).toMatch(/^the layer is one of landValue, /);
        });
});

describe("a simulation answering an overlay query", () => {

    let city: SimulationInstance;
    // Each layer's least and greatest value over the year, read after every step
    const extremes = {} as Record<OverlayLayer, {min: number, max: number}>;

    beforeAll(() => {
        city = cityWithStations();
        for (const layer of OVERLAY_LAYERS) {
            extremes[layer] = {min: Infinity, max: -Infinity};
        }

        for (let i = 0; i < YEAR; i++) {
            city.step();
            for (const layer of OVERLAY_LAYERS) {
                for (const value of layerMap(city, layer).save()) {
                    extremes[layer].min = Math.min(extremes[layer].min, value);
                    extremes[layer].max = Math.max(extremes[layer].max, value);
                }
            }
        }
    });

    it.each(OVERLAY_LAYERS)("answers %s with the layer's map, block by block, row by row", (layer) => {
        const map = layerMap(city, layer);
        const answer = overlay(city, layer);

        // The range is taken from the answer here: the tests below check it
        expect(answer).toEqual({
            type: "overlay", layer, blockSize: map.blockSize, width: map.width, height: map.height,
            low: answer.low, high: answer.high, values: map.save(),
        });
        expect(answer.values.length).toBe(answer.width * answer.height);
        expect(answer.width * answer.blockSize).toBeGreaterThanOrEqual(city.getMap().width);
        expect(answer.height * answer.blockSize).toBeGreaterThanOrEqual(city.getMap().height);
        // The row-by-row order, checked at a block that isn't on the diagonal
        expect(answer.values[answer.width * 3 + 5]).toBe(map.get(5, 3));
    });

    // A city a year old has somewhere to show on each layer, so an answer of zeros can't pass for one read from the
    // wrong map
    it.each(OVERLAY_LAYERS)("answers %s with values that aren't all zero", (layer) => {
        expect(overlay(city, layer).values.some((value) => value !== 0)).toBe(true);
    });

    it("answers each layer with the range the Simulation constructor states for its map", () => {
        const ranges = Object.fromEntries(OVERLAY_LAYERS.map((layer) => {
            const answer = overlay(city, layer);
            return [layer, [answer.low, answer.high]];
        }));

        expect(ranges).toEqual({
            landValue: [0, 250], pollution: [0, 255], crime: [0, 250], trafficDensity: [0, 240],
            populationDensity: [0, 510], policeCoverage: [0, 1000], fireCoverage: [0, 1000], rateOfGrowth: [-200, 200],
            powerGrid: [0, 1],
        });
    });

    // The coverage of several stations in one block adds up past the high end, as in the original
    it.each(OVERLAY_LAYERS.filter((layer) => layer !== "policeCoverage" && layer !== "fireCoverage"))(
        "answers %s within its range at every step of the year", (layer) => {
            const answer = overlay(city, layer);

            expect(extremes[layer].min).toBeGreaterThanOrEqual(answer.low);
            expect(extremes[layer].max).toBeLessThanOrEqual(answer.high);
        });

    it("answers with a copy, so changing the answer changes nothing in the city", async () => {
        const before = await stateHash(city);
        for (const layer of OVERLAY_LAYERS) {
            overlay(city, layer).values.fill(99);
        }

        expect(await stateHash(city)).toBe(before);
        expect(layerMap(city, "pollution").save()).not.toContain(99);
    });

    it("answers a query it rejects with the reason", () => {
        expect(city.answerQuery({type: "overlay", layer: "weather"}))
            .toEqual({type: "rejected", reason: queryRejection({type: "overlay", layer: "weather"}, WIDTH, HEIGHT)});
        expect(city.answerQuery(undefined)).toEqual({type: "rejected", reason: "not a query"});
    });
});

describe("a simulation announcing a recomputed overlay layer", () => {

    // Runs the city, and lists each layer it announced at each step, with the phase it announced it in
    function announcements(city: SimulationInstance, steps: number, atStep: (step: number) => void = () => {}) {
        const announced: {step: number, phase: number, layer: OverlayLayer}[] = [];
        let step = 0;
        city.addEventListener(Messages.OVERLAY_UPDATED, (data: {layer: OverlayLayer}) => {
            announced.push({step, phase: city._phaseCycle, layer: data.layer});
        });

        for (; step < steps; step++) {
            city.step();
            atStep(step);
        }

        return announced;
    }

    it("announces each layer in the phase that recomputes it, and every layer within a year", () => {
        const announced = announcements(cityWithStations(), YEAR);

        for (const {phase, layer} of announced) {
            expect([layer, phase]).toEqual([layer, LAYER_PHASES[layer]]);
        }
        expect(new Set(announced.map(({layer}) => layer))).toEqual(new Set(OVERLAY_LAYERS));
    });

    it("announces the traffic and growth maps every cycle, once phase 10 has decayed them", () => {
        const announced = announcements(cityWithStations(), 16 * 10);

        expect(announced.filter(({layer}) => layer === "trafficDensity").length).toBe(10);
        expect(announced.filter(({layer}) => layer === "rateOfGrowth").length).toBe(10);
    });

    // The layers that only their own scan writes: each changes at a step that announces it, and at no other. The
    // traffic and growth maps also change tile by tile in the map scan.
    const SCANNED_LAYERS: OverlayLayer[] = [
        "powerGrid", "landValue", "pollution", "crime", "policeCoverage", "populationDensity", "fireCoverage",
    ];

    it("announces a layer that only its scan writes at every step that changes it", () => {
        const city = cityWithStations();
        const last = new Map(SCANNED_LAYERS.map((layer) => [layer, overlay(city, layer).values]));
        const changed: {step: number, layer: OverlayLayer}[] = [];

        const announced = announcements(city, YEAR, (step) => {
            for (const layer of SCANNED_LAYERS) {
                const values = overlay(city, layer).values;
                if (values.some((value, i) => value !== last.get(layer)![i])) {
                    changed.push({step, layer});
                }
                last.set(layer, values);
            }
        });

        const announcedSteps = new Set(announced.map(({step, layer}) => `${layer}@${step}`));
        for (const {step, layer} of changed) {
            expect(announcedSteps).toContain(`${layer}@${step}`);
        }
        // Each layer changed at least once, so the check above ran for each
        expect(new Set(changed.map(({layer}) => layer))).toEqual(new Set(SCANNED_LAYERS));
    });

    // An announcement made before the scan would hand the overlay the values the scan is about to replace
    it("announces a layer once it is recomputed: an answer asked then holds to the end of the step", () => {
        const city = cityWithStations();
        let atAnnouncement: OverlayAnswer[] = [];
        city.addEventListener(Messages.OVERLAY_UPDATED, (data: {layer: OverlayLayer}) => {
            atAnnouncement.push(overlay(city, data.layer));
        });

        let compared = 0;
        for (let i = 0; i < YEAR; i++) {
            city.step();
            for (const answer of atAnnouncement) {
                expect(overlay(city, answer.layer)).toEqual(answer);
                compared++;
            }
            atAnnouncement = [];
        }

        expect(compared).toBeGreaterThan(48 * 2);
    });

    it("announces a scan's layers only when the speed lets the scan run", () => {
        // At medium speed the power scan runs every 4th cycle, and the fire analysis every 10th
        const city = cityWithStations();
        city.setSpeed(Speed.medium);
        const announced = announcements(city, 3 * 16 * 40);
        const count = (layer: OverlayLayer) => announced.filter((a) => a.layer === layer).length;

        expect([count("trafficDensity"), count("powerGrid"), count("fireCoverage")]).toEqual([40, 10, 4]);
    });
});

describe("a tile report query", () => {

    it.each([[0, 0], [WIDTH - 1, HEIGHT - 1], [27, 13]])("is valid for the tile (%i, %i)", (x, y) => {
        expect(queryRejection({type: "tileReport", x, y}, WIDTH, HEIGHT)).toBeNull();
        expect(queryRejection({y, x, type: "tileReport"}, WIDTH, HEIGHT)).toBeNull();
    });

    it.each([
        ["no y", {type: "tileReport", x: 3}],
        ["a field it doesn't have", {type: "tileReport", x: 3, y: 4, layer: "crime"}],
    ])("is rejected with %s", (_, query) => {
        expect(queryRejection(query, WIDTH, HEIGHT)).toBe("the tileReport query has exactly the fields type, x, y");
    });

    it.each([
        ["left of the map", -1, 0], ["right of the map", WIDTH, 0], ["above the map", 0, -1],
        ["below the map", 0, HEIGHT], ["between two tiles", 1.5, 2], ["named by a string", "1", 2], ["null", 1, null],
    ])("is rejected with a tile %s", (_, x, y) => {
        expect(queryRejection({type: "tileReport", x, y}, WIDTH, HEIGHT))
            .toBe("the tile is an x from 0 to 119 and a y from 0 to 99, in whole numbers");
    });

    it("is checked against the size of the map it asks about", () => {
        expect(queryRejection({type: "tileReport", x: 15, y: 10}, 16, 16)).toBeNull();
        expect(queryRejection({type: "tileReport", x: 16, y: 10}, 16, 16))
            .toBe("the tile is an x from 0 to 15 and a y from 0 to 15, in whole numbers");
    });
});

// The first tile of each category in the original's table, by number, as idArray in MicropolisCore's tool.cpp names
// them and micropolis.h numbers them: DIRT, RIVER, TREEBASE, RUBBLE, FLOOD, RADTILE, FIRE, ROADBASE, POWERBASE,
// RAILBASE, RESBASE, COMBASE, INDBASE, PORTBASE, AIRPORTBASE, COALBASE, FIRESTBASE, POLICESTBASE, STADIUMBASE,
// NUCLEARBASE, HBRDG0, RADAR0, FOUNTAIN, INDBASE2, FOOTBALLGAME1, VBRDG0 and 952, with the names stri.219 gives them
const ORIGINAL_CATEGORIES: [number, ZoneCategory][] = [
    [0, "CLEAR"], [2, "WATER"], [21, "TREES"], [44, "RUBBLE"], [48, "FLOOD"], [52, "RADIOACTIVE_WASTE"], [56, "FIRE"],
    [64, "ROAD"], [208, "POWER"], [224, "RAIL"], [240, "RESIDENTIAL"], [423, "COMMERCIAL"], [612, "INDUSTRIAL"],
    [693, "SEAPORT"], [709, "AIRPORT"], [745, "COAL_POWER"], [761, "FIRE_STATION"], [770, "POLICE_STATION"],
    [779, "STADIUM"], [811, "NUCLEAR_POWER"], [828, "DRAWBRIDGE"], [832, "RADAR"], [840, "FOUNTAIN"],
    [844, "INDUSTRIAL"], [932, "FOOTBALL_GAME"], [948, "DRAWBRIDGE"], [952, "URANIUM"],
];

describe("a tile's category", () => {

    it.each(ORIGINAL_CATEGORIES)("starts at tile %i with %s, as in the original's table", (first, category) => {
        expect(zoneCategory(first)).toBe(category);
    });

    // The tile before the football game is the coal plant's smoke, which the next test covers
    it.each(ORIGINAL_CATEGORIES.slice(1).filter(([first]) => first !== 932))(
        "ends the category before it at the tile before %i", (first) => {
            const before = ORIGINAL_CATEGORIES[ORIGINAL_CATEGORIES.findIndex(([tile]) => tile === first) - 1][1];
            expect(zoneCategory(first - 1)).toBe(before);
        });

    it("takes the coal plant's smoke, among the industrial tiles, for the coal plant", () => {
        expect(zoneCategory(TileValues.COALSMOKE1)).toBe("COAL_POWER");
        expect(zoneCategory(TileValues.FOOTBALLGAME1 - 1)).toBe("COAL_POWER");
        expect(zoneCategory(TileValues.COALSMOKE1 - 1)).toBe("INDUSTRIAL");
    });

    it("is the last category for the tiles past the original's table, which the port never builds", () => {
        expect(zoneCategory(TileValues.CHURCH1BASE)).toBe("URANIUM");
        expect(zoneCategory(TileValues.TILE_COUNT - 1)).toBe("URANIUM");
    });

    it("names every category the protocol lists", () => {
        expect(new Set(ORIGINAL_CATEGORIES.map(([, category]) => category))).toEqual(new Set(ZONE_CATEGORIES));
    });
});

describe("a simulation answering a tile report query", () => {

    let city: SimulationInstance;
    let reports: TileReportAnswer[];

    // The town fixture, with a fire and a police station east of its zones, a few years on, so that each block map
    // holds more than its starting values
    beforeAll(() => {
        const town = startCity({fixture: "town", speed: "fast"});
        const builder = new CityBuilder(town);
        builder.fireStation(47, 14);
        builder.policeStation(47, 18);

        // The headless interface leaves out the block maps this suite reads: the cast simulationFromSeed in
        // helpers/simulations.ts makes, kept here since it is the only one in this file
        city = town as unknown as SimulationInstance;
        for (let i = 0; i < 4 * YEAR; i++) {
            city.step();
        }

        reports = [];
        for (let y = 0; y < HEIGHT; y++) {
            for (let x = 0; x < WIDTH; x++) {
                reports.push(tileReport(city, x, y));
            }
        }
    });

    function tileReport(simulation: SimulationInstance, x: number, y: number): TileReportAnswer {
        const answer: QueryAnswer = simulation.answerQuery({type: "tileReport", x, y});
        if (answer.type !== "tileReport") {
            throw new Error(`The report of (${x}, ${y}) was not answered: ${JSON.stringify(answer)}`);
        }

        return answer;
    }

    it("answers each tile with what the simulation holds there", () => {
        const map = city.getMap();
        const blockMaps = city.blockMaps;

        for (const report of reports) {
            const {x, y} = report;
            const tile = map.getTile(x, y);
            expect(report).toEqual({
                type: "tileReport", x, y, tile: tile.getValue(), category: zoneCategory(tile.getValue()),
                populationDensity: blockMaps.populationDensityMap.worldGet(x, y),
                landValue: blockMaps.landValueMap.worldGet(x, y),
                crime: blockMaps.crimeRateMap.worldGet(x, y),
                pollution: blockMaps.pollutionDensityMap.worldGet(x, y),
                rateOfGrowth: blockMaps.rateOfGrowthMap.worldGet(x, y),
                burnable: tile.isCombustible(),
                bulldozable: tile.isBulldozable(),
                conductive: tile.isConductive(),
                animated: tile.isAnimated(),
                powered: tile.isPowered(),
                zoneCentre: tile.isZone(),
                fireStationMap: blockMaps.fireStationMap.worldGet(x, y),
                fireCoverage: blockMaps.fireStationEffectMap.worldGet(x, y),
                policeStationMap: blockMaps.policeStationMap.worldGet(x, y),
                policeCoverage: blockMaps.policeStationEffectMap.worldGet(x, y),
                terrainDensity: blockMaps.terrainDensityMap.worldGet(x, y),
                trafficDensity: blockMaps.trafficDensityMap.worldGet(x, y),
                cityCentreScore: blockMaps.cityCentreDistScoreMap.worldGet(x, y),
            });
        }
    });

    // The comparison above holds as well for a report read from the wrong map, when both maps are all zeros: each field
    // here takes more than one value over the town, so a report read from the wrong map would differ somewhere
    it("answers with values that differ from tile to tile", () => {
        const fields = Object.keys(reports[0]).filter((field) => field !== "type") as (keyof TileReportAnswer)[];
        const varying = fields.filter((field) => new Set(reports.map((report) => report[field])).size > 1);

        expect(varying).toEqual(fields);
    });

    it("answers with the town's zones in their categories", () => {
        const categories = new Set(reports.map((report) => report.category));

        for (const category of ["CLEAR", "WATER", "TREES", "ROAD", "RAIL", "RESIDENTIAL", "COMMERCIAL", "INDUSTRIAL",
                                "COAL_POWER"] as const) {
            expect(categories).toContain(category);
        }
    });

    it("changes nothing in the city", async () => {
        const before = await stateHash(city);
        tileReport(city, 27, 13);
        tileReport(city, 0, 0);

        expect(await stateHash(city)).toBe(before);
    });

    it("answers a tile off the map with the reason", () => {
        expect(city.answerQuery({type: "tileReport", x: WIDTH, y: 0})).toEqual({
            type: "rejected", reason: queryRejection({type: "tileReport", x: WIDTH, y: 0}, WIDTH, HEIGHT),
        });
    });
});

describe("a replay with queries interleaved", () => {

    // Replays a log as headless/runner.ts does, through a command queue, but asks every overlay and a few tile
    // reports, and a few queries the simulation rejects, before each command, after it, and before each step. Returns
    // the state hash at each of the log's checkpoints, and how many queries of each type were answered.
    function replayAsking(log: CommandLog): {hashes: Promise<string[]>, answered: Record<string, number>} {
        if (!("seed" in log)) {
            throw new Error("The replay starts from a seed");
        }

        const city = cityFromSeed(log.seed, log.level, Speed.medium);
        const queries: unknown[] = [
            ...OVERLAY_LAYERS.map((layer) => ({type: "overlay", layer})), {type: "overlay"}, {type: "weather"}, null,
            {type: "tileReport", x: 0, y: 0}, {type: "tileReport", x: 27, y: 13},
            {type: "tileReport", x: WIDTH - 1, y: HEIGHT - 1}, {type: "tileReport", x: WIDTH, y: 0},
        ];
        const answered: Record<string, number> = {overlay: 0, tileReport: 0, rejected: 0};
        const askAll = () => {
            for (const query of queries) {
                answered[city.answerQuery(query).type]++;
            }
        };

        const hashes: Promise<string>[] = [];
        const checkpointSteps = log.checkpoints.map((checkpoint) => checkpoint.step);
        const queue = new CommandQueue(city, {
            applied: askAll,
            beforeStep: (step) => {
                if (checkpointSteps.includes(step)) {
                    hashes.push(stateHash(city));
                }
                askAll();
            },
        });

        const lastStep = checkpointSteps[checkpointSteps.length - 1];
        let e = 0;
        for (let step = 0; ; step++) {
            for (; e < log.entries.length && log.entries[e].step === step; e++) {
                queue.send(log.entries[e].player, log.entries[e].command);
                queue.applyCommands();
                askAll();
            }

            if (step === lastStep) {
                hashes.push(stateHash(city));
                break;
            }
            queue.step();
        }

        return {hashes: Promise.all(hashes), answered};
    }

    it("reaches every checkpoint of the town fixture's log", async () => {
        const log = fixtureLog("town");
        const {hashes, answered} = replayAsking(log);

        const steps = log.checkpoints[log.checkpoints.length - 1].step;
        expect(answered.overlay).toBeGreaterThan(steps * OVERLAY_LAYERS.length);
        expect(answered.tileReport).toBeGreaterThan(steps * 3);
        expect(answered.rejected).toBeGreaterThan(steps * 4);
        expect(await hashes).toEqual(log.checkpoints.map((checkpoint) => checkpoint.hash));
    });
});
