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

import { ActivityEntry, ActivityFeed, activityEntry, LINE_LIFETIME_MS, MOST_LINES } from "../src/playerActivity";
import { PlayerRoster } from "../src/playerRoster";
import { Command, CommandResult, Outcome } from "../src/protocol";
import { LOCAL_PLAYER } from "./helpers/commandLog";

const ANA = "id-ana";
const BO = "id-bo";
const YOU = "id-you";

function rosterOnline(): PlayerRoster {
    const roster = new PlayerRoster();
    roster.update({online: true, you: YOU, players: [{id: YOU, name: "Cy"}, {id: ANA, name: "Ana"}, {id: BO, name: "Bo"}]});
    return roster;
}

function result(player: string, command: unknown, outcome: Outcome = "ok"): CommandResult {
    return {player, command, outcome, reason: outcome === "rejected" ? "no" : null};
}

function entry(player: string, key: string): ActivityEntry {
    return {player, key, text: `${player} ${key}`};
}

const AT = [{x: 1, y: 1}];

describe("the activity list's naming", () => {

    it.each<[Command, string]>([
        [{type: "tool", tool: "road", path: AT, autoBulldoze: true}, "Ana built a road"],
        [{type: "tool", tool: "residential", path: AT, autoBulldoze: false}, "Ana zoned residential land"],
        [{type: "tool", tool: "bulldozer", path: AT, autoBulldoze: false}, "Ana bulldozed"],
        [{type: "setBudget", tax: 9}, "Ana set taxes to 9%"],
        [{type: "setBudget", road: 80, police: 100, tax: 7}, "Ana set taxes to 7%, road funding to 80%, police funding to 100%"],
        [{type: "setSpeed", speed: 0}, "Ana paused the city"],
        [{type: "setSpeed", speed: 1}, "Ana set the speed to slow"],
        [{type: "setSpeed", speed: 3}, "Ana set the speed to fast"],
        [{type: "setAutoBudget", on: false}, "Ana turned auto-budget off"],
        [{type: "setDisasters", on: true}, "Ana turned disasters on"],
        [{type: "triggerDisaster", kind: "monster"}, "Ana set a monster loose"],
        [{type: "addFunds"}, "Ana added funds"],
    ])("names another player's %j as %j", (command, text) => {
        expect(activityEntry(result(ANA, command), rosterOnline())?.text).toBe(text);
    });

    it.each<Outcome>(["failed", "noMoney", "needsBulldoze", "rejected"])(
        "tells nothing of a command whose outcome is %s, which only its sender learns of", (outcome) => {
            const road = {type: "tool", tool: "road", path: AT, autoBulldoze: true};
            expect(activityEntry(result(ANA, road, outcome), rosterOnline())).toBeNull();
        });

    it("tells nothing of the player's own commands", () => {
        expect(activityEntry(result(YOU, {type: "setSpeed", speed: 1}), rosterOnline())).toBeNull();
    });

    it("tells nothing with no server, where the one player sends every command", () => {
        const roster = new PlayerRoster();
        roster.update({online: false});

        expect(activityEntry(result(LOCAL_PLAYER, {type: "setSpeed", speed: 1}), roster)).toBeNull();
        expect(activityEntry(result(ANA, {type: "setSpeed", speed: 1}), roster)).toBeNull();
    });

    it("tells nothing of a player the server never listed", () => {
        expect(activityEntry(result("id-stranger", {type: "setSpeed", speed: 1}), rosterOnline())).toBeNull();
    });

    it("still names a player whose command the city applied after they left", () => {
        const roster = rosterOnline();
        roster.update({online: true, you: YOU, players: [{id: YOU, name: "Cy"}]});

        expect(activityEntry(result(ANA, {type: "setSpeed", speed: 2}), roster)?.text).toBe("Ana set the speed to medium");
    });

    it("tells two players with one name apart only by id, naming each the same", () => {
        const roster = new PlayerRoster();
        roster.update({online: true, you: YOU, players: [{id: ANA, name: "Ana"}, {id: BO, name: "Ana"}]});

        expect(activityEntry(result(BO, {type: "addFunds"}), roster)).toEqual(
            {player: BO, key: "addFunds", text: "Ana added funds"});
    });

    it.each<[Command, string]>([
        [{type: "tool", tool: "road", path: AT, autoBulldoze: true}, "tool:road"],
        [{type: "tool", tool: "wire", path: AT, autoBulldoze: true}, "tool:wire"],
        [{type: "triggerDisaster", kind: "fire"}, "triggerDisaster:fire"],
        [{type: "setBudget", tax: 5}, "setBudget"],
    ])("keys %j as %j, so a tool or a disaster makes a line of its own", (command, key) => {
        expect(activityEntry(result(ANA, command), rosterOnline())?.key).toBe(key);
    });
});

describe("the activity feed", () => {

    it("makes one line of a player's commands that do the same, brought back to the top by each", () => {
        const feed = new ActivityFeed();
        feed.add(entry(ANA, "tool:road"), 0);
        feed.add(entry(BO, "tool:road"), 10);
        feed.add(entry(ANA, "tool:road"), 20);
        feed.add(entry(ANA, "tool:road"), 30);

        expect(feed.showing(30)).toEqual([{...entry(ANA, "tool:road"), at: 30}, {...entry(BO, "tool:road"), at: 10}]);
    });

    it("keeps a line for each different thing a player did", () => {
        const feed = new ActivityFeed();
        feed.add(entry(ANA, "tool:road"), 0);
        feed.add(entry(ANA, "tool:wire"), 10);

        expect(feed.showing(10).map((line) => line.key)).toEqual(["tool:wire", "tool:road"]);
    });

    it("updates a line's text to the latest command it tells of", () => {
        const feed = new ActivityFeed();
        feed.add({player: ANA, key: "setBudget", text: "Ana set taxes to 7%"}, 0);
        feed.add({player: ANA, key: "setBudget", text: "Ana set taxes to 9%"}, 5);

        expect(feed.showing(5).map((line) => line.text)).toEqual(["Ana set taxes to 9%"]);
    });

    it("drops a line once its time is up since the last command it told of", () => {
        const feed = new ActivityFeed();
        feed.add(entry(ANA, "tool:road"), 0);
        feed.add(entry(BO, "tool:road"), 100);

        expect(feed.showing(LINE_LIFETIME_MS - 1)).toHaveLength(2);
        expect(feed.showing(LINE_LIFETIME_MS).map((line) => line.player)).toEqual([BO]);
        expect(feed.showing(LINE_LIFETIME_MS + 100)).toEqual([]);
    });

    it("shows at most its most lines, dropping the oldest", () => {
        const feed = new ActivityFeed();
        for (let i = 0; i <= MOST_LINES; i++) {
            feed.add(entry(ANA, `key${i}`), i);
        }

        const keys = feed.showing(MOST_LINES).map((line) => line.key);
        expect(keys).toHaveLength(MOST_LINES);
        expect(keys).not.toContain("key0");
        expect(keys[0]).toBe(`key${MOST_LINES}`);
    });
});
