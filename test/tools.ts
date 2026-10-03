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

import { BulldozerTool } from "../src/bulldozerTool.js";
import { cityTools } from "../src/cityTools";
import { GameMap } from "../src/gameMap.js";
import { ParkTool } from "../src/parkTool.js";
import { BLBNBIT, BULLBIT, BNCNBIT, ZONEBIT } from "../src/tileFlags";
import {
    DIRT, FOUNTAIN, FREEZ, LHPOWER, LVPOWER, LVPOWER2, LVPOWER4, LVPOWER5, REDGE, RIVER, ROADS, ROADS2, RZB, TINYEXP,
    WOODS, WOODS2,
} from "../src/tileValues";
import { streamDrawing } from "./helpers/streams";

// A tool's random choices change the city, so they come from the simulation's stream, passed to doTool

const budget = {totalFunds: 20000, spend: () => {}};

// A budget that notes what it is charged
function chargedBudget() {
    return {
        totalFunds: 20000,
        charged: 0,
        spend(amount: number) {
            this.charged += amount;
        },
    };
}

describe("the park tool", () => {

    it.each([
        ["woods", 2, WOODS2 + 2],
        ["a fountain", 4, FOUNTAIN],
    ])("should plant %s as the stream's one draw picks", (_, draw, tileValue) => {
        const map = new GameMap(120, 100);
        const tool = new ParkTool(map);

        tool.doTool(10, 10, streamDrawing([draw]));
        tool.modifyIfEnoughFunding(budget);

        expect(map.getTileValue(10, 10)).toBe(tileValue);
    });

    // As putDownPark in the original, which picks what to plant before it looks at the tile
    it("should draw once where the tile isn't clear, and plant nothing", () => {
        const map = new GameMap(120, 100);
        map.setTile(10, 10, WOODS2, BULLBIT);
        const tool = new ParkTool(map);

        expect(() => tool.doTool(10, 10, streamDrawing([]))).toThrow("The test stream ran out after 0 draws");

        tool.doTool(10, 10, streamDrawing([2]));
        expect(tool.result).toBe(tool.TOOLRESULT_NEEDS_BULLDOZE);
    });

    // As putDownPark in the original, which compares the tile with its flags to plain dirt
    it("should plant nothing on dirt that carries flags", () => {
        const map = new GameMap(120, 100);
        map.setTile(10, 10, DIRT, BULLBIT);
        const tool = new ParkTool(map);

        tool.doTool(10, 10, streamDrawing([2]));
        tool.modifyIfEnoughFunding(budget);

        expect(tool.result).toBe(tool.TOOLRESULT_NEEDS_BULLDOZE);
        expect(map.getTile(10, 10).getRawValue()).toBe(DIRT | BULLBIT);
    });
});

describe("the bulldozer", () => {

    // As bulldozerTool in the original. Commands never reach it there, as the simulation rejects them first.
    it.each([[-1, 50], [120, 50], [50, -1], [50, 100]])("should fail off the map, at (%i, %i)", (x, y) => {
        const tool = new BulldozerTool(new GameMap(120, 100));

        tool.doTool(x, y, streamDrawing([]));

        expect(tool.result).toBe(tool.TOOLRESULT_FAILED);
    });

    it("should blow up each tile of a zone with the explosion frame the stream draws for it", () => {
        const map = new GameMap(120, 100);
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const isCentre = dx === 0 && dy === 0;
                map.setTile(50 + dx, 50 + dy, RZB + dx + 3 * dy, BNCNBIT | BULLBIT | (isCentre ? ZONEBIT : 0));
            }
        }
        const tool = new BulldozerTool(map);

        // Column by column, top to bottom
        tool.doTool(50, 50, streamDrawing([0, 1, 2, 2, 1, 0, 1, 1, 1]));
        tool.modifyIfEnoughFunding(budget);

        const frames = [];
        for (let x = 49; x <= 51; x++) {
            for (let y = 49; y <= 51; y++) {
                frames.push(map.getTileValue(x, y) - TINYEXP);
            }
        }
        expect(frames).toEqual([0, 1, 2, 2, 1, 0, 1, 1, 1]);
    });

    // As bulldozerTool in the original, whose connectTile fixes the connections around every tile it dozes, water or
    // land: the road beside the river edge, still drawn as running up into a tile long gone, is fixed to run across
    it("should fix the connections around river it dozes", () => {
        const map = new GameMap(120, 100);
        map.setTile(51, 50, REDGE, BULLBIT);
        map.setTile(50, 50, ROADS2, BLBNBIT);
        const tool = new BulldozerTool(map);

        tool.doTool(51, 50, streamDrawing([]));
        tool.modifyIfEnoughFunding(budget);

        expect(tool.result).toBe(tool.TOOLRESULT_OK);
        expect(map.getTileValue(51, 50)).toBe(DIRT);
        expect(map.getTileValue(50, 50)).toBe(ROADS);
    });

    // As the original's doTool, which applies what a tool staged only when it succeeds: the fix around the river is
    // staged, and dropped with the rest when the river, which can't be bulldozed, stays
    it("should change nothing where it can't doze the river", () => {
        const map = new GameMap(120, 100);
        map.setTile(51, 50, RIVER, 0);
        map.setTile(50, 50, ROADS2, BLBNBIT);
        const tool = new BulldozerTool(map);

        tool.doTool(51, 50, streamDrawing([]));
        tool.modifyIfEnoughFunding(budget);

        expect(tool.result).toBe(tool.TOOLRESULT_FAILED);
        expect(map.getTile(51, 50).getRawValue()).toBe(RIVER);
        expect(map.getTile(50, 50).getRawValue()).toBe(ROADS2 | BLBNBIT);
    });

    // Dozing costs 1, and water 5 more where the doze changes the tile
    it.each([
        ["a river edge", REDGE, 6],
        ["woods", WOODS, 1],
    ])("should charge for dozing %s what the original does", (_, tileValue, cost) => {
        const map = new GameMap(120, 100);
        map.setTile(51, 50, tileValue, BULLBIT);
        const tool = new BulldozerTool(map);
        const charged = chargedBudget();

        tool.doTool(51, 50, streamDrawing([]));
        tool.modifyIfEnoughFunding(charged);

        expect(tool.result).toBe(tool.TOOLRESULT_OK);
        expect(charged.charged).toBe(cost);
    });
});

describe("the building tools", () => {

    // Lays wire along the path given, one tile at a time, as a drag does
    function layWire(map: InstanceType<typeof GameMap>, path: [number, number][]): void {
        const tool = cityTools(map).wire;
        for (const [x, y] of path) {
            tool.doTool(x, y, streamDrawing([]), false);
            tool.modifyIfEnoughFunding(budget);
        }
    }

    // As checkBorder in the original, which fixes the connections around every tile bordering the building: a wire
    // that ends beside the residential zone on (51, 49) to (53, 51) turns into it, since a building conducts. Each
    // side is checked, not each tile of it: a border tile also fixes its neighbours.
    it.each([
        ["above", [[49, 48], [50, 48], [51, 48]], [51, 48], LHPOWER, LVPOWER4],
        ["left of", [[50, 47], [50, 48], [50, 49]], [50, 49], LVPOWER, LVPOWER2],
        ["below", [[49, 52], [50, 52], [51, 52]], [51, 52], LHPOWER, LVPOWER5],
        ["right of", [[54, 47], [54, 48], [54, 49]], [54, 49], LVPOWER, LVPOWER5],
    ])("should fix the connections of a wire that ends %s the building", (_, wire, [endX, endY], before, after) => {
        const map = new GameMap(120, 100);
        layWire(map, wire as [number, number][]);
        expect(map.getTileValue(endX, endY)).toBe(before);

        const tool = cityTools(map).residential;
        tool.doTool(52, 50, streamDrawing([]), false);
        tool.modifyIfEnoughFunding(budget);

        expect(tool.result).toBe(tool.TOOLRESULT_OK);
        expect(map.getTileValue(endX, endY)).toBe(after);
    });

    it.each([[1, 1], [118, 1], [1, 98], [118, 98]])(
        "should build in the corner at (%i, %i) without reading off the map", (x, y) => {
            // The map warns of a read off it, which fixing the border off the map would make
            const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
            const map = new GameMap(120, 100);
            const tool = cityTools(map).residential;
            let warnings: unknown[][];

            try {
                tool.doTool(x, y, streamDrawing([]), false);
                tool.modifyIfEnoughFunding(budget);
            } finally {
                // Restoring the spy clears its calls, so they are read first
                warnings = [...warn.mock.calls];
                warn.mockRestore();
            }

            expect(warnings).toEqual([]);
            expect(tool.result).toBe(tool.TOOLRESULT_OK);
            expect(map.getTileValue(x, y)).toBe(FREEZ);
        });
});
