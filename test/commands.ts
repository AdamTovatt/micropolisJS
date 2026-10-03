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

import { canonicalJson } from "../src/canonicalJson";
import { commandRejection } from "../src/commands";
import { GameMap } from "../src/gameMap.js";
import * as Messages from "../src/messages";
import { Command, CommandResult, LOCAL_PLAYER, TOOL_NAMES } from "../src/protocol";
import { Simulation } from "../src/simulation.js";
import { SPRITE_MONSTER, SPRITE_TORNADO } from "../src/spriteConstants";
import { savedState } from "../src/stateHash";
import { BULLBIT, BURNBIT } from "../src/tileFlags";
import { DIRT, LASTTINYEXP, TINYEXP, WOODS } from "../src/tileValues";
import { applyCommand, newSimulation, SimulationInstance } from "./helpers/simulations";

const SEED = 2026;

// The funds a new city starts with, at any level
const STARTING_FUNDS = 20000;

// What the debug menu's grant adds
const GRANT = 20000;

// A city on an empty map: dirt everywhere
function emptyCity(speed = Simulation.SPEED_MED): SimulationInstance {
    return newSimulation(new GameMap(120, 100), SEED, speed);
}

function stateOf(simulation: SimulationInstance): string {
    return canonicalJson(savedState(simulation));
}

const road = (path: {x: number, y: number}[], autoBulldoze = true): Command =>
    ({type: "tool", tool: "road", path, autoBulldoze});

// Lists nested this many deep, around a number
function nested(levels: number): unknown {
    let value: unknown = 0;
    for (let i = 0; i < levels; i++) {
        value = [value];
    }

    return value;
}

describe("a rejected command", () => {

    const validTool = {type: "tool", tool: "road", path: [{x: 10, y: 10}], autoBulldoze: true};
    const validBudget = {type: "setBudget", road: 100, fire: 100, police: 100, tax: 7};

    it.each([
        ["nothing", undefined, "not a command"],
        ["null", null, "not a command"],
        // Longer than a tool command over every tile of the 120x100 map can be, which is rejected before it is read
        ["a command longer than any valid one", {...validTool, padding: "x".repeat(32 * 12000 + 1024)},
            "a command is at most 385024 characters of JSON"],
        // The command is the first level, so its field holds the other 63, and the command is read on
        ["a field nested as deep as a command may nest", {type: "addFunds", padding: nested(63)},
            "the addFunds command has exactly the fields type"],
        ["a command nested deeper than it may be", {type: "addFunds", padding: nested(64)},
            "a command nests objects and lists at most 64 deep"],
        // Deeper than JSON.stringify, which measures a command's length, can walk on the call stack
        ["a command nested deeper than a call stack", {type: "addFunds", padding: nested(100000)},
            "a command nests objects and lists at most 64 deep"],
        ["a field named as one every object inherits", {type: "addFunds", toString: 1},
            "the addFunds command has exactly the fields type"],
        ["a list", [], "not a command"],
        ["a string", "tool", "not a command"],
        ["a command of no type", {tool: "road"}, "not a command"],
        ["an unknown type", {type: "teleport"}, "not a command"],
        ["a missing field", {type: "tool", tool: "road", path: [{x: 10, y: 10}]},
            "the tool command has exactly the fields type, autoBulldoze, path, tool"],
        ["an extra field", {...validTool, player: "someone else"},
            "the tool command has exactly the fields type, autoBulldoze, path, tool"],
        ["an unknown tool", {...validTool, tool: "teleporter"}, `the tool is one of ${TOOL_NAMES.join(", ")}`],
        ["the query tool, which changes nothing", {...validTool, tool: "query"},
            `the tool is one of ${TOOL_NAMES.join(", ")}`],
        ["auto-bulldoze that isn't true or false", {...validTool, autoBulldoze: "yes"}, "autoBulldoze is true or false"],
        ["a path that isn't a list", {...validTool, path: {x: 10, y: 10}}, "a tool's path is a list of 1 to 12000 tiles"],
        ["an empty path", {...validTool, path: []}, "a tool's path is a list of 1 to 12000 tiles"],
        ["a path longer than the map has tiles", {...validTool, path: new Array(12001).fill({x: 1, y: 1})},
            "a tool's path is a list of 1 to 12000 tiles"],
        ["a tile with a missing coordinate", {...validTool, path: [{x: 10}]},
            "tile 0 of the path is not an {x, y} of whole numbers"],
        ["a tile with an extra field", {...validTool, path: [{x: 10, y: 10, z: 0}]},
            "tile 0 of the path is not an {x, y} of whole numbers"],
        ["a tile between tiles", {...validTool, path: [{x: 10.5, y: 10}]},
            "tile 0 of the path is not an {x, y} of whole numbers"],
        ["a coordinate given as text", {...validTool, path: [{x: "10", y: 10}]},
            "tile 0 of the path is not an {x, y} of whole numbers"],
        ["a tile left of the map", {...validTool, path: [{x: -1, y: 10}]},
            "tile 0 of the path, (-1, 10), is off the 120x100 map"],
        ["a tile right of the map", {...validTool, path: [{x: 120, y: 10}]},
            "tile 0 of the path, (120, 10), is off the 120x100 map"],
        ["a tile above the map", {...validTool, path: [{x: 10, y: -1}]},
            "tile 0 of the path, (10, -1), is off the 120x100 map"],
        ["a tile below the map", {...validTool, path: [{x: 10, y: 100}]},
            "tile 0 of the path, (10, 100), is off the 120x100 map"],
        ["a path that leaves the map partway", {...validTool, path: [{x: 0, y: 0}, {x: -1, y: 0}]},
            "tile 1 of the path, (-1, 0), is off the 120x100 map"],
        ["a path that skips a tile", {...validTool, path: [{x: 10, y: 10}, {x: 12, y: 10}]},
            "tile 1 of the path, (12, 10), is not next to the tile before it, (10, 10)"],
        ["a path that moves diagonally", {...validTool, path: [{x: 10, y: 10}, {x: 11, y: 11}]},
            "tile 1 of the path, (11, 11), is not next to the tile before it, (10, 10)"],
        ["a path that stays on a tile", {...validTool, path: [{x: 10, y: 10}, {x: 10, y: 10}]},
            "tile 1 of the path, (10, 10), is not next to the tile before it, (10, 10)"],
        ["road funding below 0", {...validBudget, road: -1}, "road funding is a whole percent from 0 to 100"],
        ["fire funding above 100", {...validBudget, fire: 101}, "fire funding is a whole percent from 0 to 100"],
        ["police funding in part percent", {...validBudget, police: 50.5},
            "police funding is a whole percent from 0 to 100"],
        ["funding given as text", {...validBudget, road: "50"}, "road funding is a whole percent from 0 to 100"],
        ["funding given as nothing", {...validBudget, fire: null}, "fire funding is a whole percent from 0 to 100"],
        ["a budget without a tax rate", {type: "setBudget", road: 50},
            "the setBudget command has exactly the fields type, tax, and may have fire, police, road"],
        ["funding for a service there isn't", {...validBudget, parks: 50},
            "the setBudget command has exactly the fields type, tax, and may have fire, police, road"],
        ["a tax rate above 20", {...validBudget, tax: 21}, "the tax rate is a whole percent from 0 to 20"],
        ["a negative tax rate", {...validBudget, tax: -1}, "the tax rate is a whole percent from 0 to 20"],
        ["a speed above fast", {type: "setSpeed", speed: 4}, "the speed is a whole number from 0 to 3"],
        ["a speed between speeds", {type: "setSpeed", speed: 1.5}, "the speed is a whole number from 0 to 3"],
        ["auto-budget that isn't true or false", {type: "setAutoBudget", on: 1}, "setAutoBudget takes on, true or false"],
        ["disasters that aren't true or false", {type: "setDisasters", on: null},
            "setDisasters takes on, true or false"],
        ["an unknown disaster", {type: "triggerDisaster", kind: "volcano"},
            "the disaster is one of monster, fire, flood, crash, meltdown, tornado, earthquake"],
        ["funds of a chosen amount", {type: "addFunds", amount: 1000000},
            "the addFunds command has exactly the fields type"],
    ])("is %s", (_, command, reason) => {
        const city = emptyCity();
        const before = stateOf(city);

        const result = applyCommand(city, command as Command);

        expect(result).toEqual({player: LOCAL_PLAYER, command, outcome: "rejected", reason});
        expect(stateOf(city)).toBe(before);
    });

    // A path is validated whole before any of it applies
    it("leaves the tiles before the bad one unbuilt", () => {
        const city = emptyCity();

        applyCommand(city, road([{x: 10, y: 10}, {x: 11, y: 10}, {x: 13, y: 10}]));

        expect(city._map.getTileValue(10, 10)).toBe(DIRT);
        expect(city.budget.totalFunds).toBe(STARTING_FUNDS);
    });
});

describe("a command at the edge of a range", () => {

    // Every tile of the 120x100 map, row by row, turning at each end: a path as long as a path may be
    const wholeMap: {x: number, y: number}[] = [];
    for (let y = 0; y < 100; y++) {
        for (let i = 0; i < 120; i++) {
            wholeMap.push({x: y % 2 === 0 ? i : 119 - i, y});
        }
    }

    it.each([
        ["the top left tile", road([{x: 0, y: 0}])],
        ["the bottom right tile", road([{x: 119, y: 99}])],
        ["a path through every tile of the map", road(wholeMap)],
        ["no funding and no tax", {type: "setBudget", road: 0, fire: 0, police: 0, tax: 0}],
        ["full funding and the highest tax", {type: "setBudget", road: 100, fire: 100, police: 100, tax: 20}],
        ["a tax rate and no service", {type: "setBudget", tax: 7}],
        ["paused", {type: "setSpeed", speed: 0}],
        ["fast", {type: "setSpeed", speed: 3}],
    ] as [string, Command][])("is valid: %s", (_, command) => {
        expect(commandRejection(command, 120, 100)).toBeNull();
    });
});

describe("a command's result", () => {

    it("is emitted with the player who sent it", () => {
        const city = emptyCity();
        const results: CommandResult[] = [];
        city.addEventListener(Messages.COMMAND_RESULT, (result: CommandResult) => results.push(result));

        const command = road([{x: 10, y: 10}]);
        city.applyCommands([{player: "another player", command}, {player: LOCAL_PLAYER, command: {type: "nothing"}}]);

        expect(results).toEqual([
            {player: "another player", command, outcome: "ok", reason: null},
            {player: LOCAL_PLAYER, command: {type: "nothing"}, outcome: "rejected", reason: "not a command"},
        ]);
    });
});

describe("a tool command", () => {

    const corner = [{x: 10, y: 10}, {x: 11, y: 10}, {x: 11, y: 11}];

    it("builds as clicks on its path's tiles one after another do, at the tool's cost for each", () => {
        const dragged = emptyCity();
        const clicked = emptyCity();

        expect(applyCommand(dragged, road(corner)).outcome).toBe("ok");
        for (const tile of corner) {
            applyCommand(clicked, road([tile]));
        }

        expect(stateOf(dragged)).toBe(stateOf(clicked));
        expect(dragged.budget.totalFunds).toBe(STARTING_FUNDS - 3 * 10);
    });

    // With funds for two tiles, the path's order decides which two are built
    it("applies its path's tiles in order", () => {
        const city = emptyCity();
        city.budget.setFunds(20);

        expect(applyCommand(city, road([...corner].reverse())).outcome).toBe("noMoney");

        expect(corner.map(({x, y}) => city._map.getTileValue(x, y) === DIRT)).toEqual([true, false, false]);
    });

    it("fails where the tool can't build", () => {
        const city = emptyCity();

        // A zone centred on the corner tile would hang off the map
        expect(applyCommand(city, {type: "tool", tool: "residential", path: [{x: 0, y: 0}], autoBulldoze: true}))
            .toMatchObject({outcome: "failed", reason: null});
    });

    describe("over woods", () => {

        function wooded() {
            const city = emptyCity();
            for (let y = 9; y <= 11; y++) {
                for (let x = 9; x <= 11; x++) {
                    city._map.setTile(x, y, WOODS, BULLBIT | BURNBIT);
                }
            }
            return city;
        }

        const zone = (autoBulldoze: boolean): Command =>
            ({type: "tool", tool: "residential", path: [{x: 10, y: 10}], autoBulldoze});

        it("needs a bulldozer first without auto-bulldoze", () => {
            const city = wooded();

            expect(applyCommand(city, zone(false)).outcome).toBe("needsBulldoze");
            expect(city._map.getTileValue(10, 10)).toBe(WOODS);
        });

        it("clears them itself with auto-bulldoze, at the bulldozer's cost for each tile", () => {
            const city = wooded();

            expect(applyCommand(city, zone(true)).outcome).toBe("ok");
            expect(city.budget.totalFunds).toBe(STARTING_FUNDS - 100 - 9);
        });

        // As connectTile in the original: road, rail and wire clear the tile first only with auto-bulldoze
        it.each(["road", "rail", "wire"] as const)("leaves them standing for %s without auto-bulldoze", (tool) => {
            const city = wooded();

            expect(applyCommand(city, {type: "tool", tool, path: [{x: 10, y: 10}], autoBulldoze: false}).outcome)
                .toBe("failed");
            expect(city._map.getTileValue(10, 10)).toBe(WOODS);
        });

        it.each([
            ["road", 10],
            ["rail", 20],
            ["wire", 5],
        ] as const)("clears them for %s with auto-bulldoze, at a cost of 1", (tool, cost) => {
            const city = wooded();

            expect(applyCommand(city, {type: "tool", tool, path: [{x: 10, y: 10}], autoBulldoze: true}).outcome)
                .toBe("ok");
            expect(city.budget.totalFunds).toBe(STARTING_FUNDS - cost - 1);
        });
    });

    describe("in a city that can't pay", () => {

        function broke() {
            const city = emptyCity();
            city.budget.setFunds(0);
            return city;
        }

        it("leaves the map and funds as they were", () => {
            const city = broke();

            expect(applyCommand(city, road([{x: 10, y: 10}])).outcome).toBe("noMoney");
            expect(city._map.getTileValue(10, 10)).toBe(DIRT);
            expect(city.budget.totalFunds).toBe(0);
        });

        // As in the original, the tool draws before the city is charged, so a refused command moves the stream and must
        // be logged and replayed like any other
        it("still draws from the stream", () => {
            const city = broke();
            const before = city.random.getState();

            expect(applyCommand(city, {type: "tool", tool: "park", path: [{x: 10, y: 10}], autoBulldoze: true}).outcome)
                .toBe("noMoney");
            expect(city.random.getState()).not.toEqual(before);
        });
    });

    // The outcome shows where the drag first went wrong. Here the first tile is built, which spends the last of the
    // funds, the second can't be paid for, and the third is the plant's, where no road can go.
    it("takes the first failed tile's outcome", () => {
        const city = emptyCity();
        applyCommand(city, {type: "tool", tool: "coal", path: [{x: 2, y: 2}], autoBulldoze: true});
        city.budget.setFunds(10);

        expect(applyCommand(city, road([{x: 0, y: 2}, {x: 0, y: 1}, {x: 1, y: 1}])).outcome).toBe("noMoney");
        expect([city._map.getTileValue(0, 2) === DIRT, city._map.getTileValue(0, 1) === DIRT]).toEqual([false, true]);
    });

    // The rest of the path is still applied after a tile fails
    it("builds past a failed tile", () => {
        const city = emptyCity();
        applyCommand(city, {type: "tool", tool: "coal", path: [{x: 2, y: 2}], autoBulldoze: true});

        expect(applyCommand(city, road([{x: 1, y: 1}, {x: 0, y: 1}])).outcome).toBe("failed");
        expect(city._map.getTileValue(0, 1)).not.toBe(DIRT);
    });

    // The bulldozer is given the simulation's stream, which picks each tile's explosion frame
    it("bulldozes a zone to explosions drawn from the stream", () => {
        const city = emptyCity();
        applyCommand(city, {type: "tool", tool: "residential", path: [{x: 10, y: 10}], autoBulldoze: true});
        const before = city.random.getState();

        expect(applyCommand(city, {type: "tool", tool: "bulldozer", path: [{x: 10, y: 10}], autoBulldoze: true})
            .outcome).toBe("ok");

        for (let y = 9; y <= 11; y++) {
            for (let x = 9; x <= 11; x++) {
                const tile = city._map.getTileValue(x, y);
                expect(tile >= TINYEXP && tile <= LASTTINYEXP).toBe(true);
            }
        }
        expect(city.random.getState()).not.toEqual(before);
    });

    it("applies while the city is paused", () => {
        const city = emptyCity(Simulation.SPEED_PAUSED);

        expect(applyCommand(city, road([{x: 10, y: 10}])).outcome).toBe("ok");
        expect(city._map.getTileValue(10, 10)).not.toBe(DIRT);
    });
});

describe("a setting command", () => {

    it("sets the budget at once, in percent", () => {
        const city = emptyCity();
        city.budget.roadMaintenanceBudget = 100;

        expect(applyCommand(city, {type: "setBudget", road: 50, fire: 0, police: 100, tax: 12}).outcome).toBe("ok");

        expect([city.budget.roadPercent, city.budget.firePercent, city.budget.policePercent, city.budget.cityTax])
            .toEqual([0.5, 0, 1, 12]);

        // Half the road budget is spent, for half the road effect
        expect([city.budget.roadSpend, city.budget.roadEffect]).toEqual([50, city.budget.MAX_ROAD_EFFECT / 2]);
    });

    // As the original's budget window sends only the sliders the player moved
    it("leaves the services a budget doesn't name at their funding, fraction of a percent included", () => {
        const city = emptyCity();
        city.budget.fireMaintenanceBudget = 300;
        city.budget.firePercent = Math.fround(94 / 300);
        city.budget.fireSpend = 94;

        applyCommand(city, {type: "setBudget", road: 50, tax: 7});

        expect([city.budget.roadPercent, city.budget.firePercent, city.budget.fireSpend])
            .toEqual([0.5, Math.fround(94 / 300), 94]);
    });

    it.each([0, 1, 2, 3])("sets the speed to %i", (speed) => {
        const city = emptyCity((speed + 1) % 4);

        applyCommand(city, {type: "setSpeed", speed});

        expect(city.getSpeed()).toBe(speed);
    });

    it.each([true, false])("sets auto-budget %s", (on) => {
        const city = emptyCity();
        city.budget.autoBudget = !on;

        applyCommand(city, {type: "setAutoBudget", on});

        expect(city.budget.autoBudget).toBe(on);
    });

    it.each([true, false])("sets disasters %s", (on) => {
        const city = emptyCity();
        city.disasterManager.disastersEnabled = !on;

        applyCommand(city, {type: "setDisasters", on});

        expect(city.disasterManager.disastersEnabled).toBe(on);
    });

    it("adds funds", () => {
        const city = emptyCity();

        applyCommand(city, {type: "addFunds"});

        expect(city.budget.totalFunds).toBe(STARTING_FUNDS + GRANT);
    });
});

describe("a disaster command", () => {

    it.each([
        ["monster", SPRITE_MONSTER],
        ["tornado", SPRITE_TORNADO],
    ] as const)("lets loose a %s", (kind, spriteType) => {
        const city = emptyCity();

        expect(applyCommand(city, {type: "triggerDisaster", kind}).outcome).toBe("ok");
        expect(city.spriteManager.spriteList.map((sprite: {type: number}) => sprite.type)).toEqual([spriteType]);
    });

    // Fire, flood, crash, meltdown and earthquake each need something on the map to strike, and are tested with their
    // manager: this checks the command reaches the right one
    it.each([
        ["fire", "makeFire"],
        ["flood", "makeFlood"],
        ["crash", "makeCrash"],
        ["meltdown", "makeMeltdown"],
        ["earthquake", "makeEarthquake"],
    ] as const)("triggers a %s", (kind, method) => {
        const city = emptyCity();
        const calls = ["makeFire", "makeFlood", "makeCrash", "makeMeltdown", "makeEarthquake"].map((name) =>
            ({name, spy: jest.spyOn(city.disasterManager, name as typeof method)}));

        expect(applyCommand(city, {type: "triggerDisaster", kind}).outcome).toBe("ok");
        expect(calls.filter(({spy}) => spy.mock.calls.length > 0).map(({name}) => name)).toEqual([method]);
    });
});
