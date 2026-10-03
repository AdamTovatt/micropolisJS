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

import { commandRejection, CommandResult, LOCAL_PLAYER } from "../src/commands";
import { budgetCommand, settingsCommands, toolOutcome } from "../src/windowCommands";

describe("the settings window's commands", () => {

    const shown = {autoBudget: true, disasters: false};

    it("are none when the player changed nothing", () => {
        expect(settingsCommands(shown, shown)).toEqual([]);
    });

    it("set each setting the player changed", () => {
        expect(settingsCommands(shown, {autoBudget: false, disasters: true})).toEqual([
            {type: "setAutoBudget", on: false},
            {type: "setDisasters", on: true},
        ]);
    });
});

describe("the budget window's command", () => {

    it("sets the tax and the funding of the sliders the player moved, and only those", () => {
        const command = budgetCommand({fire: 40}, 9);

        expect(command).toEqual({type: "setBudget", tax: 9, fire: 40});
        expect(commandRejection(command, 120, 100)).toBeNull();
    });

    it("sets the tax alone when no slider moved", () => {
        expect(budgetCommand({}, 7)).toEqual({type: "setBudget", tax: 7});
    });
});

describe("the outcome the tool output shows", () => {

    const result = (player: string, command: unknown): CommandResult =>
        ({player, command, outcome: "noMoney", reason: null});
    const tool = {type: "tool", tool: "road", path: [{x: 1, y: 1}], autoBulldoze: true};

    it("is that of the local player's tool command", () => {
        expect(toolOutcome(result(LOCAL_PLAYER, tool))).toBe("noMoney");
    });

    it.each([
        ["another player's tool command", result("someone else", tool)],
        ["the local player's other commands", result(LOCAL_PLAYER, {type: "addFunds"})],
        ["a command that isn't an object", result(LOCAL_PLAYER, "tool")],
        ["a command that is nothing", result(LOCAL_PLAYER, null)],
    ])("is none for %s", (_, other) => {
        expect(toolOutcome(other)).toBeNull();
    });
});
