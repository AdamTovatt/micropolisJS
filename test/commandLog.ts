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

import { CommandLog, joinSessions, LOCAL_PLAYER, LOG_FORMAT_VERSION, parseLog } from "./helpers/commandLog";

const HASH = "0".repeat(64);
const valid = {formatVersion: LOG_FORMAT_VERSION, seed: 8, level: 0, entries: [], checkpoints: []};
const fromSave = {formatVersion: LOG_FORMAT_VERSION, saveVersion: 10, save: {}, entries: [], checkpoints: []};

describe("a command log read from a file", () => {

    it.each([
        ["a list", [], "A command log is a JSON object"],
        ["another format version", {...valid, formatVersion: 1}, "This is a version 1 command log"],
        ["no start", {formatVersion: 2, entries: [], checkpoints: []}, "exactly one of seed or save"],
        ["two starts", {...valid, save: {}}, "exactly one of seed or save"],
        ["a seed without a level", {...valid, level: undefined}, "gives the seed, a uint32, and the level"],
        ["a seed past a uint32", {...valid, seed: 2 ** 32}, "gives the seed, a uint32, and the level"],
        ["a negative seed", {...valid, seed: -1}, "gives the seed, a uint32, and the level"],
        ["a level past 2", {...valid, level: 3}, "gives the seed, a uint32, and the level"],
        ["a save that isn't an object", {...fromSave, save: "town"}, "save is an object"],
        ["a save that is a list", {...fromSave, save: []}, "save is an object"],
        ["a save without its version", {...fromSave, saveVersion: undefined}, "save has a saveVersion"],
        ["a save version between versions", {...fromSave, saveVersion: 9.5}, "save has a saveVersion"],
        ["a description that isn't text", {...valid, description: 3}, "description is a string"],
        ["entries that aren't a list", {...valid, entries: {}}, "entries are a list"],
        ["an entry without a player", {...valid, entries: [{step: 0, command: {}}]},
            "Entry 0 of the command log is not a {step, player, command}"],
        ["an entry without a command", {...valid, entries: [{step: 0, player: "p"}]},
            "Entry 0 of the command log is not a {step, player, command}"],
        ["an entry at a step between steps", {...valid, entries: [{step: 0.5, player: "p", command: {}}]},
            "Entry 0 of the command log is not a {step, player, command}"],
        ["entries out of order", {...valid, entries: [{step: 5, player: "p", command: {}},
                                                      {step: 4, player: "p", command: {}}]},
            "Entry 1 of the command log, at step 4, comes before the entry above it"],
        ["checkpoints that aren't a list", {...valid, checkpoints: null}, "checkpoints are a list"],
        ["a checkpoint with a short hash", {...valid, checkpoints: [{step: 0, hash: "abc"}]},
            "Checkpoint 0 of the command log is not a {step, hash}"],
        ["a checkpoint at a step between steps", {...valid, checkpoints: [{step: 0.5, hash: HASH}]},
            "Checkpoint 0 of the command log is not a {step, hash}"],
        ["a checkpoint past 2^53 - 1", {...valid, checkpoints: [{step: 2 ** 53, hash: HASH}]},
            "Checkpoint 0 of the command log is not a {step, hash}"],
        ["an entry past 2^53 - 1", {...valid, entries: [{step: 2 ** 53, player: "p", command: {}}]},
            "Entry 0 of the command log is not a {step, player, command}"],
        ["two checkpoints at one step", {...valid, checkpoints: [{step: 3, hash: HASH}, {step: 3, hash: HASH}]},
            "Checkpoint 1 of the command log, at step 3, is not after the one above it"],
    ])("is refused for %s", (_, value, message) => {
        expect(() => parseLog(value)).toThrow(message);
    });

    // The city validates the commands as it applies them, as it does a player's
    it("is read with commands of any shape", () => {
        const log = {...valid, description: "anything", entries: [{step: 0, player: "p", command: "not a command"}]};

        expect(parseLog(log)).toEqual(log);
    });

    it("is read from a save with its version", () => {
        expect(parseLog(fromSave)).toEqual(fromSave);
    });

    // A log holds no other key, and a saveVersion beside a seed is one
    it("is read from a seed whatever saveVersion it gives", () => {
        const log = {...valid, saveVersion: "anything"};

        expect(parseLog(log)).toEqual(log);
    });

    it("is read at the last step a log holds, 2^53 - 1", () => {
        const log = {...valid, checkpoints: [{step: Number.MAX_SAFE_INTEGER, hash: HASH}]};

        expect(parseLog(log)).toEqual(log);
    });
});

describe("joining sessions", () => {

    const HASHES = {start: "a".repeat(64), later: "b".repeat(64)};

    const command = (step: number) =>
        ({step, player: LOCAL_PLAYER, command: {type: "setAutoBudget", on: step % 2 === 0}});

    // The saved states the sessions end on. Joining never reads them, so they need not be a city's.
    const SAVES = {first: {city: "after 100 steps"}, second: {city: "after 150 steps"}};

    // Three sessions, each after the first loading the city the one before it ended on, which its first checkpoint
    // hashes: a session from seed 23 that ended at step 100, one that took 50 steps more, and one that took 20
    function sessions(): [CommandLog, CommandLog, CommandLog] {
        const firstEnd = "c".repeat(64);
        const secondEnd = "d".repeat(64);

        const first: CommandLog = {formatVersion: LOG_FORMAT_VERSION, seed: 23, level: 1,
                                   entries: [command(0), command(40)],
                                   checkpoints: [{step: 0, hash: HASHES.start}, {step: 100, hash: firstEnd}]};
        const second: CommandLog = {formatVersion: LOG_FORMAT_VERSION, saveVersion: 10, save: SAVES.first,
                                    entries: [command(5)],
                                    checkpoints: [{step: 0, hash: firstEnd}, {step: 50, hash: secondEnd}]};
        const third: CommandLog = {formatVersion: LOG_FORMAT_VERSION, saveVersion: 10, save: SAVES.second,
                                   entries: [command(7)],
                                   checkpoints: [{step: 0, hash: secondEnd}, {step: 20, hash: HASHES.later}]};
        return [first, second, third];
    }

    it("carries each loaded session on from the step the one before ended at, with no entry for the load", () => {
        const [first, second, third] = sessions();

        expect(joinSessions([first, second, third])).toEqual({
            formatVersion: LOG_FORMAT_VERSION, seed: 23, level: 1,
            entries: [command(0), command(40), {...command(5), step: 105}, {...command(7), step: 157}],
            checkpoints: [...first.checkpoints, {step: 150, hash: second.checkpoints[1].hash},
                          {step: 170, hash: HASHES.later}],
        });
    });

    it("starts where the first session started, from a save", () => {
        const [first, second] = sessions();
        const save = {city: "new"};
        const fromSave: CommandLog = {formatVersion: LOG_FORMAT_VERSION, saveVersion: 7, save, entries: first.entries,
                                      checkpoints: first.checkpoints};

        const joined = joinSessions([fromSave, second]);

        expect(joined).toEqual(expect.objectContaining({saveVersion: 7, save}));
        expect(joined).not.toHaveProperty("seed");
    });

    it("leaves one session as it was", () => {
        const [first] = sessions();

        expect(joinSessions([first])).toEqual(first);
    });

    it("refuses a later session that loads another city than the one before it ended on", () => {
        const [first, second] = sessions();
        const other = "e".repeat(64);

        expect(() => joinSessions([first, {...second, checkpoints: [{step: 0, hash: other}, second.checkpoints[1]]}]))
            .toThrow(`Session 2 loads a city whose state hash is ${other}, but the session before it ended on ` +
                     first.checkpoints[1].hash);
    });

    it.each([
        ["no checkpoints", []],
        ["no checkpoint at its first step", [{step: 50, hash: "d".repeat(64)}]],
    ])("refuses a later session with %s", (_, checkpoints) => {
        const [first, second] = sessions();

        expect(() => joinSessions([first, {...second, checkpoints}])).toThrow(
            "Session 2 has no checkpoint of the city it loaded, at its first step");
    });

    it("refuses a later session that starts from a seed", () => {
        const [first] = sessions();

        expect(() => joinSessions([first, first])).toThrow("Session 2 starts from a seed");
    });

    // Its checkpoint at its first step comes after those commands, where the joined log has the city as loaded
    it("refuses a later session that applies a command before its first step", () => {
        const [first, second] = sessions();

        expect(() => joinSessions([first, {...second, entries: [command(0)]}])).toThrow(
            "Session 2 applies a command before its first step");
    });

    it("refuses a session after one without checkpoints", () => {
        const [first, second] = sessions();

        expect(() => joinSessions([{...first, checkpoints: []}, second])).toThrow(
            "The session before session 2 has no checkpoints");
    });

    it("refuses no sessions at all", () => {
        expect(() => joinSessions([])).toThrow("No session to join");
    });
});
