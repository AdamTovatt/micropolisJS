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

import type { CityStatus } from "../src/cityClient";
import {
    CURSOR_TIMEOUT_MS, CursorReporter, OtherCursors, otherOutlines, PLAYER_COLOURS, playerColour, REPORT_INTERVAL_MS,
    reportedCursor, RESEND_MS,
} from "../src/playerCursors";
import { PlayerRoster } from "../src/playerRoster";
import type { Cursor, CursorMessage } from "../src/protocol";

const ROAD: Cursor = {tool: "road", x: 10, y: 20, size: 1};
const MOVED: Cursor = {tool: "road", x: 11, y: 20, size: 1};
const ZONE: Cursor = {tool: "residential", x: 11, y: 20, size: 3};

const ONLINE: CityStatus = {online: true, you: "id-you", players: [
    {id: "id-you", name: "Cy"}, {id: "id-ana", name: "Ana"}, {id: "id-bo", name: "Bo"},
]};

function move(player: string, cursor: Cursor | null): CursorMessage {
    return {type: "cursor", player, cursor};
}

describe("this player's hover box as the others see it", () => {

    const onMap = (x: number, y: number) => x >= 0 && x < 120 && y >= 0 && y < 100;

    it("is the tool held at the map tile under the pointer", () => {
        expect(reportedCursor("residential", 3, {x: 11, y: 20}, onMap)).toEqual(ZONE);
        expect(reportedCursor("query", 1, {x: 0, y: 99}, onMap)).toEqual({tool: "query", x: 0, y: 99, size: 1});
    });

    it("is nothing with no tool held, or one no box shows", () => {
        expect(reportedCursor(null, 0, {x: 11, y: 20}, onMap)).toBeNull();
        expect(reportedCursor("crane", 1, {x: 11, y: 20}, onMap)).toBeNull();
    });

    it("is nothing with the pointer off the view, or over the margin around the map", () => {
        expect(reportedCursor("road", 1, null, onMap)).toBeNull();
        expect(reportedCursor("road", 1, {x: 120, y: 20}, onMap)).toBeNull();
        expect(reportedCursor("road", 1, {x: 10, y: -1}, onMap)).toBeNull();
    });
});

describe("reporting this player's hover box", () => {

    function reporter(): {reported: (Cursor | null)[], update: (cursor: Cursor | null, now: number) => void} {
        const reported: (Cursor | null)[] = [];
        const reporting = new CursorReporter((cursor) => reported.push(cursor));
        return {reported, update: (cursor, now) => reporting.update(cursor, now)};
    }

    it("reports the first box at once", () => {
        const {reported, update} = reporter();
        update(ROAD, 1000);

        expect(reported).toEqual([ROAD]);
    });

    it("reports nothing before there is a box", () => {
        const {reported, update} = reporter();
        update(null, 1000);
        update(null, 1000 + RESEND_MS);

        expect(reported).toEqual([]);
    });

    it("reports a change no sooner than the interval after the last report, then the latest place", () => {
        const {reported, update} = reporter();
        update(ROAD, 1000);
        update(MOVED, 1000 + REPORT_INTERVAL_MS - 1);
        update(ZONE, 1000 + REPORT_INTERVAL_MS - 1);

        expect(reported).toEqual([ROAD]);

        update(ZONE, 1000 + REPORT_INTERVAL_MS);
        expect(reported).toEqual([ROAD, ZONE]);
    });

    it("counts a change of tool or size as a move", () => {
        const {reported, update} = reporter();
        update(MOVED, 0);
        update(ZONE, REPORT_INTERVAL_MS);

        expect(reported).toEqual([MOVED, ZONE]);
    });

    it("reports a box that holds still again every resend interval, so the others keep it", () => {
        const {reported, update} = reporter();
        update(ROAD, 0);
        update({...ROAD}, RESEND_MS - 1);
        expect(reported).toEqual([ROAD]);

        update({...ROAD}, RESEND_MS);
        update({...ROAD}, RESEND_MS + REPORT_INTERVAL_MS);
        expect(reported).toEqual([ROAD, ROAD]);
    });

    it("reports a box leaving the map once, and nothing while it stays off", () => {
        const {reported, update} = reporter();
        update(ROAD, 0);
        update(null, REPORT_INTERVAL_MS);
        update(null, REPORT_INTERVAL_MS + RESEND_MS * 3);

        expect(reported).toEqual([ROAD, null]);
    });
});

describe("the other players' hover boxes", () => {

    function cursors(status: CityStatus = ONLINE): {roster: PlayerRoster, others: OtherCursors} {
        const roster = new PlayerRoster();
        roster.update(status);
        return {roster, others: new OtherCursors(roster)};
    }

    it("shows each named in their colour, in the order they came online", () => {
        const {others} = cursors();
        others.receive(move("id-bo", ZONE), 0);
        others.receive(move("id-ana", ROAD), 0);

        expect(others.showing(0)).toEqual([
            {player: "id-ana", name: "Ana", colour: playerColour("id-ana"), cursor: ROAD},
            {player: "id-bo", name: "Bo", colour: playerColour("id-bo"), cursor: ZONE},
        ]);
    });

    it("moves a box to its latest place", () => {
        const {others} = cursors();
        others.receive(move("id-ana", ROAD), 0);
        others.receive(move("id-ana", MOVED), 10);

        expect(others.showing(10).map((view) => view.cursor)).toEqual([MOVED]);
    });

    it("drops a box that left the map", () => {
        const {others} = cursors();
        others.receive(move("id-ana", ROAD), 0);
        others.receive(move("id-ana", null), 10);

        expect(others.showing(10)).toEqual([]);
    });

    it("drops a box once its time is up after the last word of it", () => {
        const {others} = cursors();
        others.receive(move("id-ana", ROAD), 0);
        others.receive(move("id-bo", ROAD), 1000);

        expect(others.showing(CURSOR_TIMEOUT_MS - 1)).toHaveLength(2);
        expect(others.showing(CURSOR_TIMEOUT_MS).map((view) => view.player)).toEqual(["id-bo"]);
    });

    it("drops the box of a player who leaves, so it doesn't come back with them", () => {
        const {roster, others} = cursors();
        others.receive(move("id-ana", ROAD), 0);
        roster.update({online: true, you: "id-you", players: [{id: "id-you", name: "Cy"}, {id: "id-bo", name: "Bo"}]});
        expect(others.showing(0)).toEqual([]);

        roster.update(ONLINE);
        expect(others.showing(0)).toEqual([]);
    });

    it("drops a box from a player not online", () => {
        const {others} = cursors({online: true, you: "id-you", players: [{id: "id-you", name: "Cy"}]});
        others.receive(move("id-ana", ROAD), 0);

        expect(others.showing(0)).toEqual([]);
    });

    it("shows none while offline, and keeps none for after", () => {
        const {roster, others} = cursors();
        others.receive(move("id-ana", ROAD), 0);
        roster.update({online: false});
        expect(others.showing(0)).toEqual([]);

        roster.update(ONLINE);
        expect(others.showing(0)).toEqual([]);
    });

    it("never shows this player's own box", () => {
        const {others} = cursors();
        others.receive(move("id-you", ROAD), 0);

        expect(others.showing(0)).toEqual([]);
    });

    it("gives a player the palette colour their id hashes to, so every browser shows them alike", () => {
        expect(playerColour("id-ana")).toBe("#f032e6");
        expect(playerColour("id-bo")).toBe("#e6194b");

        Array.from({length: 64}, (_, i) => playerColour(`player-${i}`)).forEach((colour) => {
            expect(PLAYER_COLOURS).toContain(colour);
        });
    });

    it("are drawn at their map tiles, in their tools' colours, named in their players'", () => {
        const views = [{player: "id-ana", name: "Ana", colour: "#f032e6", cursor: ZONE}];
        const toolColour = (tool: string) => `colour of ${tool}`;

        expect(otherOutlines(views, toolColour)).toEqual([{
            x: ZONE.x, y: ZONE.y, width: 3, height: 3, colour: "colour of residential",
            label: {name: "Ana", colour: "#f032e6"},
        }]);
    });
});
