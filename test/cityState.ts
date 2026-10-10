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

import { CityState, ClientMap } from "../src/cityState";
import { MapMessage, StateMessage } from "../src/protocol";
import { BURNBIT, POWERBIT } from "../src/tileFlags";
import { DIRT, RIVER, TILE_INVALID } from "../src/tileValues";

// A 3 by 2 map: a powered, burnable river in the top-left corner, dirt elsewhere
const MAP: MapMessage = {type: "map", width: 3, height: 2, tiles: [RIVER | POWERBIT | BURNBIT, DIRT, DIRT, DIRT, DIRT, DIRT]};

describe("the client's copy of the map", () => {

    it("tells a tile's value without its flags", () => {
        expect(new ClientMap(MAP).getTileValue(0, 0)).toBe(RIVER);
    });

    it.each([[-1, 0], [0, -1], [3, 0], [0, 2]])("has no tile at (%i, %i), off the map", (x, y) => {
        expect(() => new ClientMap(MAP).getTileValue(x, y)).toThrow(`Tile (${x}, ${y}) is off the map`);
    });

    // The canvas paints a margin around the map
    it("paints each tile's raw value, and an invalid tile off the map", () => {
        const values = new ClientMap(MAP).getTileValuesForPainting(-1, 1, 5, 2, []);

        expect(values).toEqual([TILE_INVALID, DIRT, DIRT, DIRT, TILE_INVALID,
                                TILE_INVALID, TILE_INVALID, TILE_INVALID, TILE_INVALID, TILE_INVALID]);
    });

    it("changes the tiles a tiles message names", () => {
        const map = new ClientMap(MAP);

        map.change([{x: 2, y: 1, value: RIVER}]);

        expect(map.getTileValuesForPainting(0, 0, 3, 2, [])).toEqual([...MAP.tiles.slice(0, 5), RIVER]);
    });
});

describe("the client's copy of the city", () => {

    function copyOf() {
        let deliver: (message: StateMessage) => void = () => {};
        const state = new CityState({subscribe: (listener) => {
            deliver = listener;
        }});

        return {state, deliver: (message: StateMessage) => deliver(message)};
    }

    // Each record of the new city comes after its map
    it("forgets what the city before sent, once a new city's map comes", () => {
        const {state, deliver} = copyOf();
        deliver(MAP);
        deliver({type: "demand", residential: 1, commercial: 2, industrial: 3});

        deliver({type: "map", width: 1, height: 1, tiles: [DIRT]});

        expect(state.latest("demand")).toBeNull();
        expect(state.map.width).toBe(1);
    });

    it("keeps each tile's walkway from the walkways messages, and none once a new city's map comes", () => {
        const {state, deliver} = copyOf();
        deliver(MAP);

        deliver({type: "walkways", changes: [{x: 2, y: 1, ninths: 21}, {x: 0, y: 0, ninths: 1}]});
        deliver({type: "walkways", changes: [{x: 0, y: 0, ninths: 0}]});

        expect([state.map.getWalkway(2, 1), state.map.getWalkway(0, 0), state.map.getWalkway(1, 0)]).toEqual([21, 0, 0]);
        deliver(MAP);
        expect(state.map.getWalkway(2, 1)).toBe(0);
    });

    // So a listener can read the copy, as the game reads the latest records when a message comes
    it("calls a listener once it has taken the message in", () => {
        const {state, deliver} = copyOf();
        deliver(MAP);
        const seen: unknown[] = [];
        state.on("demand", (message) => seen.push(state.current("demand") === message));
        state.on("tiles", () => seen.push(state.map.getTileValue(1, 0)));

        deliver({type: "demand", residential: 1, commercial: 2, industrial: 3});
        deliver({type: "tiles", changes: [{x: 1, y: 0, value: RIVER}]});

        expect(seen).toEqual([true, RIVER]);
    });
});
