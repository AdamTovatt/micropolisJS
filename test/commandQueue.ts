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

import { CommandQueue, CommandTarget, QueueRecorder, StampedCommand } from "../src/commandQueue";
import { CommandResult, ReceivedCommand } from "../src/commands";

// A simulation that records what reaches it, in order
class Recorder implements CommandTarget {
    readonly calls: (ReceivedCommand[] | "step")[] = [];

    applyCommands(received: ReceivedCommand[]): CommandResult[] {
        this.calls.push(received);
        return received.map(({player, command}) => ({player, command, outcome: "ok", reason: null}));
    }

    step(): void {
        this.calls.push("step");
    }
}

const ignore: QueueRecorder = {applied: () => {}, beforeStep: () => {}};

describe("a command queue", () => {

    it("holds commands until they are applied, then applies them in the order they arrived", () => {
        const simulation = new Recorder();
        const queue = new CommandQueue(simulation, ignore);

        queue.send("first", {type: "addFunds"});
        queue.send("second", {type: "setSpeed", speed: 0});
        expect(simulation.calls).toEqual([]);

        const results = queue.applyCommands();

        expect(simulation.calls).toEqual([
            [{player: "first", command: {type: "addFunds"}}],
            [{player: "second", command: {type: "setSpeed", speed: 0}}],
        ]);
        expect(results.map((result) => result.player)).toEqual(["first", "second"]);
    });

    it("applies each command once", () => {
        const simulation = new Recorder();
        const queue = new CommandQueue(simulation, ignore);

        queue.send("player", {type: "addFunds"});
        queue.applyCommands();
        queue.applyCommands();

        expect(simulation.calls).toEqual([[{player: "player", command: {type: "addFunds"}}]]);
    });

    // A command that throws may have changed the city before it did, so it is recorded, and a replay throws there too
    it("records a command that throws, and keeps the commands after it to apply next time", () => {
        const simulation = new Recorder();
        const applyCommands = simulation.applyCommands.bind(simulation);
        simulation.applyCommands = (received) => {
            if (received[0].player === "thrower") {
                throw new Error("thrown");
            }
            return applyCommands(received);
        };
        const recorded: StampedCommand[] = [];
        const queue = new CommandQueue(simulation, {applied: (stamped) => recorded.push(stamped), beforeStep: () => {}});

        queue.send("thrower", {type: "addFunds"});
        queue.send("player", {type: "addFunds"});
        expect(() => queue.applyCommands()).toThrow("thrown");

        queue.applyCommands();

        expect(simulation.calls).toEqual([[{player: "player", command: {type: "addFunds"}}]]);
        expect(recorded).toEqual([
            {step: 0, player: "thrower", command: {type: "addFunds"}},
            {step: 0, player: "player", command: {type: "addFunds"}},
        ]);
    });

    it("steps the simulation, counting the steps", () => {
        const simulation = new Recorder();
        const queue = new CommandQueue(simulation, ignore);

        queue.step();
        queue.step();

        expect(simulation.calls).toEqual(["step", "step"]);
        expect(queue.stepIndex).toBe(2);
    });

    it("tells its recorder each command, stamped with the index of the step it precedes, and each step before it", () => {
        const recorded: (StampedCommand | number)[] = [];
        const queue = new CommandQueue(new Recorder(), {
            applied: (stamped) => recorded.push(stamped),
            beforeStep: (step) => recorded.push(step),
        });

        queue.send("player", {type: "setSpeed", speed: 0});
        queue.applyCommands();
        queue.step();
        queue.step();
        queue.send("player", {type: "addFunds"});
        queue.send("player", {type: "setSpeed", speed: 2});
        queue.applyCommands();

        expect(recorded).toEqual([
            {step: 0, player: "player", command: {type: "setSpeed", speed: 0}},
            0,
            1,
            {step: 2, player: "player", command: {type: "addFunds"}},
            {step: 2, player: "player", command: {type: "setSpeed", speed: 2}},
        ]);
    });
});
