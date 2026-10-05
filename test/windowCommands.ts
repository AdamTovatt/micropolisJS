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

import { CommandResult, SPEEDS } from "../src/protocol";
import { budgetCommand, settingsCommands, toolOutcome } from "../src/windowCommands";
import { LOCAL_PLAYER } from "./helpers/commandLog";
import { repositoryJson } from "./helpers/repository";

// A command as the server reads it: its example under protocol/examples/commands, which the server's tests read too
function commandExample(name: string): unknown {
    return repositoryJson(`protocol/examples/commands/${name}.json`);
}

describe("the settings window's commands", () => {

    const shown = {autoBudget: true, disasters: false, speed: SPEEDS.medium};

    it("are none when the player changed nothing", () => {
        expect(settingsCommands(shown, shown)).toEqual([]);
    });

    it("set each setting the player changed, as the server reads the commands", () => {
        expect(settingsCommands(shown, {autoBudget: false, disasters: true, speed: SPEEDS.paused})).toEqual(
            [commandExample("set-auto-budget"), commandExample("set-disasters"), commandExample("set-speed")]);
    });

    it.each([
        ["pause a running city", SPEEDS.medium, SPEEDS.paused],
        ["run a paused city at the speed chosen", SPEEDS.paused, SPEEDS.slow],
    ])("%s", (_, shownSpeed, speed) => {
        expect(settingsCommands({...shown, speed: shownSpeed}, {...shown, speed})).toEqual([{type: "setSpeed", speed}]);
    });
});

describe("the budget window's command", () => {

    it("sets the tax and the funding of the sliders the player moved, and only those", () => {
        const command = budgetCommand({fire: 40}, 9);

        expect(command).toEqual({type: "setBudget", tax: 9, fire: 40});
    });

    it.each([
        ["sets the tax and every service's funding when every slider moved", {road: 100, fire: 75, police: 50}, 7,
         "set-budget"],
        ["sets the tax alone when no slider moved", {}, 9, "set-budget-tax-only"],
    ])("%s, as the server reads the command", (_, funding, tax, example) => {
        expect(budgetCommand(funding, tax)).toEqual(commandExample(example));
    });
});

describe("the outcome the player is told of", () => {

    const result = (player: string, command: unknown): CommandResult =>
        ({player, command, outcome: "noMoney", reason: null});
    const tool = {type: "tool", tool: "road", path: [{x: 1, y: 1}], autoBulldoze: true};

    it("is that of the player's own tool command", () => {
        expect(toolOutcome(result(LOCAL_PLAYER, tool), LOCAL_PLAYER)).toBe("noMoney");
        expect(toolOutcome(result("a server's player", tool), "a server's player")).toBe("noMoney");
    });

    it.each([
        ["another player's tool command", result("someone else", tool)],
        ["the player's other commands", result(LOCAL_PLAYER, {type: "addFunds"})],
        ["a command that isn't an object", result(LOCAL_PLAYER, "tool")],
        ["a command that is nothing", result(LOCAL_PLAYER, null)],
    ])("is none for %s", (_, other) => {
        expect(toolOutcome(other, LOCAL_PLAYER)).toBeNull();
    });
});
