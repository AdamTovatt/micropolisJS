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

import { BlockMap } from "../src/blockMap";
import { GameMap } from "../src/gameMap.js";
import { Road } from "../src/road.js";
import { ANIMBIT, BULLBIT } from "../src/tileFlags";
import { TileUtils } from "../src/tileUtils.js";
import {
    BRWH, BRWV, CHANNEL, HBRDG0, HBRDG1, HBRDG2, HBRDG3, HBRIDGE, LTRFBASE, RIVER, VBRDG0, VBRDG1, VBRDG2, VBRDG3,
    VBRIDGE,
} from "../src/tileValues";
import { registeredHandler } from "./helpers/handlers";
import { streamDrawing } from "./helpers/streams";

type GameMapInstance = InstanceType<typeof GameMap>;

// The drawbridge as doBridge in the original's simulate.cpp opens and closes it, with no ship near and roads funded in
// full, so a draw of 0 is the one chance in 8 that opens a bridge or in 4 that closes one
describe("a drawbridge", () => {

    const X = 10;
    const Y = 10;

    // The raw value of each tile, value and flags, by its offset from the bridge's tile the scan finds
    type Tiles = [number, number, number][];

    function makeMap(tiles: Tiles): GameMapInstance {
        const map = new GameMap(120, 100);
        for (const [dx, dy, raw] of tiles) {
            map.getTile(X + dx, Y + dy).setRawValue(raw);
        }

        return map;
    }

    function scan(map: GameMapInstance) {
        registeredHandler(Road.registerHandlers, TileUtils.isRoad)(map, X, Y, {
            blockMaps: {trafficDensityMap: new BlockMap(120, 100, 2)},
            budget: {shouldDegradeRoad: () => false},
            census: {roadTotal: 0},
            random: streamDrawing([0]),
            spriteManager: {getBoatDistance: () => 99999},
        });
    }

    function rawTiles(map: GameMapInstance, tiles: Tiles): Tiles {
        return tiles.map(([dx, dy]) => [dx, dy, map.getTile(X + dx, Y + dy).getRawValue()]);
    }

    // A road across a channel running north to south, wider than the bridge, its tiles showing light traffic
    const closedHorizontal: Tiles = [
        [-2, -1, CHANNEL], [-1, -1, CHANNEL], [0, -1, CHANNEL], [1, -1, CHANNEL], [2, -1, CHANNEL],
        [-2, 0, LTRFBASE | BULLBIT | ANIMBIT], [-1, 0, LTRFBASE | BULLBIT | ANIMBIT], [0, 0, LTRFBASE | BULLBIT | ANIMBIT],
        [1, 0, LTRFBASE | BULLBIT | ANIMBIT], [2, 0, LTRFBASE | BULLBIT | ANIMBIT],
    ];

    const openHorizontal: Tiles = [
        [-2, -1, HBRDG1 | BULLBIT], [-1, -1, CHANNEL], [0, -1, CHANNEL], [1, -1, CHANNEL], [2, -1, HBRDG3 | BULLBIT],
        [-2, 0, HBRDG0 | BULLBIT], [-1, 0, RIVER], [0, 0, BRWH | BULLBIT], [1, 0, RIVER], [2, 0, HBRDG2 | BULLBIT],
    ];

    // A plain bridge across a channel running east to west, and the same bridge open
    const closedVertical: Tiles = [
        [0, -2, VBRIDGE | BULLBIT], [1, -2, CHANNEL], [0, -1, VBRIDGE | BULLBIT], [0, 0, VBRIDGE | BULLBIT],
        [1, 0, CHANNEL], [0, 1, VBRIDGE | BULLBIT], [0, 2, VBRIDGE | BULLBIT], [1, 2, CHANNEL],
    ];

    const openVertical: Tiles = [
        [0, -2, VBRDG0 | BULLBIT], [1, -2, VBRDG1 | BULLBIT], [0, -1, RIVER], [0, 0, BRWV | BULLBIT],
        [1, 0, CHANNEL], [0, 1, RIVER], [0, 2, VBRDG2 | BULLBIT], [1, 2, VBRDG3 | BULLBIT],
    ];

    it("opens over the channel, traffic and all, leaving water with no flags", () => {
        const map = makeMap(closedHorizontal);

        scan(map);

        expect(rawTiles(map, openHorizontal)).toEqual(openHorizontal);
    });

    it("opens a vertical bridge over a channel running east to west", () => {
        const map = makeMap(closedVertical);

        scan(map);

        expect(rawTiles(map, openVertical)).toEqual(openVertical);
    });

    it("closes into a plain bridge between river banks", () => {
        const map = makeMap(openHorizontal);

        scan(map);

        expect(rawTiles(map, openHorizontal)).toEqual([
            [-2, -1, RIVER], [-1, -1, CHANNEL], [0, -1, CHANNEL], [1, -1, CHANNEL], [2, -1, RIVER],
            [-2, 0, HBRIDGE | BULLBIT], [-1, 0, HBRIDGE | BULLBIT], [0, 0, HBRIDGE | BULLBIT], [1, 0, HBRIDGE | BULLBIT],
            [2, 0, HBRIDGE | BULLBIT],
        ]);
    });

    it("closes a vertical bridge into a plain bridge between river banks", () => {
        const map = makeMap(openVertical);

        scan(map);

        expect(rawTiles(map, openVertical)).toEqual([
            [0, -2, VBRIDGE | BULLBIT], [1, -2, RIVER], [0, -1, VBRIDGE | BULLBIT], [0, 0, VBRIDGE | BULLBIT],
            [1, 0, CHANNEL], [0, 1, VBRIDGE | BULLBIT], [0, 2, VBRIDGE | BULLBIT], [1, 2, RIVER],
        ]);
    });

    it("closes over only the open bridge's own tiles", () => {
        const map = makeMap([...openHorizontal.slice(1), [-2, -1, CHANNEL]]);

        scan(map);

        expect(map.getTile(X - 2, Y - 1).getRawValue()).toBe(CHANNEL);
    });
});
