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


import { onlineListView } from "../src/onlineList";

describe("the online list", () => {

    it("says so when not connected", () => {
        expect(onlineListView({online: false}))
            .toEqual({notConnected: "Not connected", title: "Not connected to a server", players: []});
    });

    it("lists everyone online in the order they came online, marking this player", () => {
        const view = onlineListView({
            online: true,
            you: "id-2",
            players: [{id: "id-1", name: "Grace"}, {id: "id-2", name: "Ada"}, {id: "id-3", name: "Ada"}],
        });

        expect(view).toEqual({notConnected: "", title: "", players: ["Grace", "Ada (you)", "Ada"]});
    });
});
