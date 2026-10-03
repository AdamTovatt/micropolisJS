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
import { BULLBIT, BNCNBIT, ZONEBIT } from "../src/tileFlags";
import {
    FOUNTAIN, FREEZ, LHPOWER, LVPOWER, LVPOWER2, LVPOWER4, LVPOWER5, RZB, TINYEXP, WOODS2,
} from "../src/tileValues";
import { streamDrawing } from "./helpers/streams";

// A tool's random choices change the city, so they come from the simulation's stream, passed to doTool

const budget = {totalFunds: 20000, spend: () => {}};

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
        "should build in the corner at (%i, %i), whose border runs off the map", (x, y) => {
            const map = new GameMap(120, 100);
            const tool = cityTools(map).residential;

            tool.doTool(x, y, streamDrawing([]), false);
            tool.modifyIfEnoughFunding(budget);

            expect(tool.result).toBe(tool.TOOLRESULT_OK);
            expect(map.getTileValue(x, y)).toBe(FREEZ);
        });
});
