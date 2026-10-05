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

import { TileHistory } from "../src/tileHistory";

describe("a tile history", () => {

    it("has no tile at a position never painted", () => {
        expect(new TileHistory().getTile(3, 4)).toBeUndefined();
    });

    it("returns the tile painted at a position", () => {
        const history = new TileHistory();
        history.setTile(3, 4, 860);

        expect(history.getTile(3, 4)).toBe(860);
    });

    it("keeps the last tile painted at a position", () => {
        const history = new TileHistory();
        history.setTile(3, 4, 860);
        history.setTile(3, 4, 861);

        expect(history.getTile(3, 4)).toBe(861);
    });

    it("keeps positions apart whose coordinates share digits", () => {
        const history = new TileHistory();
        history.setTile(1, 23, 56);
        history.setTile(12, 3, 57);

        expect(history.getTile(1, 23)).toBe(56);
        expect(history.getTile(12, 3)).toBe(57);
        expect(history.getTile(3, 1)).toBeUndefined();
    });

    it("keeps tile 0 painted at (0, 0), though both are falsy", () => {
        const history = new TileHistory();
        history.setTile(0, 0, 0);

        expect(history.getTile(0, 0)).toBe(0);
    });

    it("forgets every tile when cleared", () => {
        const history = new TileHistory();
        history.setTile(3, 4, 860);
        history.setTile(5, 6, 861);

        history.clear();

        expect(history.getTile(3, 4)).toBeUndefined();
        expect(history.getTile(5, 6)).toBeUndefined();
    });
});
