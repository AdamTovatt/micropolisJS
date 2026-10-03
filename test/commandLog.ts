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

import { cityFromSeed, Level, Simulation, Speed } from "../headless/city";
import { buildingAt, lineOf } from "../headless/fixtures/toolCommands";
import { advance, fixtureSave, replay, startCity } from "../headless/runner";
import {
    CommandLog, CommandRecorder, joinSessions, lastStep, LOG_FORMAT_VERSION, LogStart, parseLog,
} from "../src/commandLog";
import { CommandQueue } from "../src/commandQueue";
import { CommandResult, LOCAL_PLAYER } from "../src/commands";
import { hashSavedState, plainSavedState, stateHash } from "../src/stateHash";
import { InspectedSave } from "./helpers/savedState";

const HASH = "0".repeat(64);
const valid = {formatVersion: LOG_FORMAT_VERSION, seed: 8, level: 0, entries: [], checkpoints: []};

describe("a command log read from a file", () => {

    it.each([
        ["a list", [], "A command log is a JSON object"],
        ["another format version", {...valid, formatVersion: 2}, "This is a version 2 command log"],
        ["no start", {formatVersion: 1, entries: [], checkpoints: []}, "exactly one of seed or save"],
        ["two starts", {...valid, save: {}}, "exactly one of seed or save"],
        ["a seed without a level", {...valid, level: undefined}, "gives the seed, a uint32, and the level"],
        ["a seed past a uint32", {...valid, seed: 2 ** 32}, "gives the seed, a uint32, and the level"],
        ["a save that isn't an object", {formatVersion: 1, save: "town", entries: [], checkpoints: []},
            "save is an object"],
        ["a description that isn't text", {...valid, description: 3}, "description is a string"],
        ["entries that aren't a list", {...valid, entries: {}}, "entries are a list"],
        ["an entry without a player", {...valid, entries: [{step: 0, command: {}}]},
            "Entry 0 of the command log is not a {step, player, command}"],
        ["an entry at a step between steps", {...valid, entries: [{step: 0.5, player: "p", command: {}}]},
            "Entry 0 of the command log is not a {step, player, command}"],
        ["entries out of order", {...valid, entries: [{step: 5, player: "p", command: {}},
                                                      {step: 4, player: "p", command: {}}]},
            "Entry 1 of the command log, at step 4, comes before the entry above it"],
        ["checkpoints that aren't a list", {...valid, checkpoints: null}, "checkpoints are a list"],
        ["a checkpoint with a short hash", {...valid, checkpoints: [{step: 0, hash: "abc"}]},
            "Checkpoint 0 of the command log is not a {step, hash}"],
        ["two checkpoints at one step", {...valid, checkpoints: [{step: 3, hash: HASH}, {step: 3, hash: HASH}]},
            "Checkpoint 1 of the command log, at step 3, is not after the one above it"],
    ])("is refused for %s", (_, value, message) => {
        expect(() => parseLog(value)).toThrow(message);
    });

    // The simulation validates the commands as it applies them, as it does a player's
    it("is read with commands of any shape", () => {
        const log = {...valid, description: "anything", entries: [{step: 0, player: "p", command: "not a command"}]};

        expect(parseLog(log)).toEqual(log);
    });
});

// A session as the browser plays one: commands sent between runs of steps, through a queue that a recorder watches.
// The results of the commands are kept, in the order they applied.
function session(start: LogStart, city: Simulation, interval: number) {
    const recorder = new CommandRecorder(city, start, interval);
    const queue = new CommandQueue(city, recorder);
    const results: CommandResult[] = [];

    return {
        results,
        send: (command: unknown) => queue.send(LOCAL_PLAYER, command),
        steps: (count: number) => {
            results.push(...queue.applyCommands());
            for (let i = 0; i < count; i++) {
                queue.step();
            }
        },
        log: async () => {
            results.push(...queue.applyCommands());
            const recorded = await recorder.log();

            expect(recorded.unhashed).toBeNull();
            return recorded.log;
        },
    };
}

describe("a recorded session", () => {

    // Built on, paused and built on while paused, resumed at another speed, sent a command the simulation rejects,
    // and saved partway through a checkpoint interval
    async function playSession() {
        const city = cityFromSeed(8, Level.easy, Speed.medium);
        const played = session({seed: 8, level: Level.easy}, city, 100);

        played.send(buildingAt("coal", 11, 13));
        played.send(lineOf("road", 14, 15, 30, 15));
        played.steps(130);
        played.send({type: "setSpeed", speed: Speed.paused});
        played.steps(0);
        played.send(buildingAt("residential", 15, 13));
        played.send({type: "tool", tool: "road", path: [{x: -1, y: 0}], autoBulldoze: true});
        played.steps(0);
        played.send({type: "setSpeed", speed: Speed.fast});
        played.steps(250);
        played.send({type: "setBudget", road: 80, fire: 100, police: 100, tax: 9});
        played.steps(17);

        return {city, log: await played.log(), results: played.results};
    }

    it("is logged with every command it was sent, stamped with the step it preceded", async () => {
        const {log} = await playSession();

        expect(log.entries.map((entry) => [entry.step, (entry.command as {type: string}).type])).toEqual([
            [0, "tool"], [0, "tool"], [130, "setSpeed"], [130, "tool"], [130, "tool"], [130, "setSpeed"],
            [380, "setBudget"],
        ]);
    });

    it("is logged with a checkpoint each interval, from step 0, and one where it ended", async () => {
        const {log} = await playSession();

        expect(log.checkpoints.map((checkpoint) => checkpoint.step)).toEqual([0, 100, 200, 300, 397]);
    });

    it("replays to the city it ended as, matching every checkpoint", async () => {
        const {city, log} = await playSession();

        const replayed = replay(parseLog(JSON.parse(JSON.stringify(log))));

        await expect(replayed.verified).resolves.toBe(log.checkpoints.length);
        expect(await stateHash(replayed.city)).toBe(await stateHash(city));
    });

    // The off-map road changed nothing, and its replay rejects it again
    it("replays to the same result for each command, the rejected one included", async () => {
        const {log, results} = await playSession();

        expect(results.map((result) => result.outcome)).toEqual(["ok", "ok", "ok", "ok", "rejected", "ok", "ok"]);
        expect(replay(log, {verify: false}).results).toEqual(results);
    });

    it("fails to replay at a checkpoint that doesn't match", async () => {
        const {log} = await playSession();
        log.checkpoints[2] = {step: 200, hash: HASH};

        await expect(replay(log).verified).rejects.toThrow(`At step 200 the replay's state hash is `);
    });

    // Hashes can finish in any order: here the one at step 100 is held back until the one at step 200 has failed
    it("fails naming the earliest checkpoint that doesn't match, whichever hash finishes first", async () => {
        const {log} = await playSession();
        log.checkpoints[1] = {step: 100, hash: HASH};
        log.checkpoints[2] = {step: 200, hash: HASH};

        const digest = crypto.subtle.digest.bind(crypto.subtle);
        let calls = 0;
        const held = jest.spyOn(crypto.subtle, "digest").mockImplementation(async (algorithm, data) => {
            if (calls++ === 1) {
                await new Promise((resolve) => setTimeout(resolve, 50));
            }
            return digest(algorithm, data);
        });

        try {
            await expect(replay(log).verified).rejects.toThrow(`At step 100 the replay's state hash is `);
        } finally {
            held.mockRestore();
        }
    });

    // A loaded game's log starts from the state it loaded: here partway through a speed cycle, with sprites in flight
    it("replays from the save of a city that has run a while", async () => {
        const city = startCity({fixture: "town"});
        advance(city, 4001);
        const saved = plainSavedState(city) as InspectedSave;
        expect(saved.simulation.speedCycle % 3).not.toBe(0);
        expect(saved.sprites.list.length).toBeGreaterThan(0);

        const played = session({save: saved}, city, 100);
        played.send({type: "setSpeed", speed: Speed.fast});
        played.send(buildingAt("park", 20, 20));
        played.steps(150);
        played.send({type: "triggerDisaster", kind: "fire"});
        played.steps(60);
        const log = await played.log();

        const replayed = replay(parseLog(JSON.parse(JSON.stringify(log))));
        await expect(replayed.verified).resolves.toBe(log.checkpoints.length);
        expect(replayed.results).toEqual(played.results);
        expect(await stateHash(replayed.city)).toBe(await stateHash(city));
    });
});

describe("a recorder", () => {

    // The hash is worked out later, from the state as it was when the checkpoint was taken
    it("reads a checkpoint's state when it takes it", async () => {
        const city = cityFromSeed(8, Level.easy, Speed.medium);
        const recorder = new CommandRecorder(city, {seed: 8, level: Level.easy}, 100);
        const before = await stateHash(city);

        recorder.beforeStep(0);
        city.random.next();
        const {log} = await recorder.log();

        expect(log.checkpoints[0]).toEqual({step: 0, hash: before});
        expect(log.checkpoints[1]).toEqual({step: 1, hash: await stateHash(city)});
    });

    it("ends a log taken before any step with a checkpoint at step 0", async () => {
        const city = cityFromSeed(8, Level.easy, Speed.medium);
        const recorder = new CommandRecorder(city, {seed: 8, level: Level.easy}, 100);

        expect((await recorder.log()).log.checkpoints).toEqual([{step: 0, hash: await stateHash(city)}]);
    });

    // As in a browser that offers no Web Crypto to a page served over plain http. The checkpoint taken before the log
    // is asked for fails first, with nothing yet waiting on it.
    it("hands over a log without checkpoints when a hash can't be worked out, saying why", async () => {
        const failing = jest.spyOn(crypto.subtle, "digest").mockRejectedValue(new Error("no Web Crypto here"));

        try {
            const city = cityFromSeed(8, Level.easy, Speed.medium);
            const recorder = new CommandRecorder(city, {seed: 8, level: Level.easy}, 100);
            recorder.applied({step: 0, player: LOCAL_PLAYER, command: {type: "addFunds"}});
            recorder.beforeStep(0);
            await new Promise((resolve) => setTimeout(resolve, 10));

            const recorded = await recorder.log();

            expect(recorded.log.entries).toHaveLength(1);
            expect(recorded.log.checkpoints).toEqual([]);
            expect(recorded.unhashed?.message).toBe("no Web Crypto here");
        } finally {
            failing.mockRestore();
        }
    });
});

describe("a log's replay", () => {

    const logFrom = (start: LogStart, entries: CommandLog["entries"], checkpoints: CommandLog["checkpoints"] = []) =>
        ({formatVersion: LOG_FORMAT_VERSION, ...start, entries, checkpoints}) as CommandLog;

    // The browser never steps a paused city
    it("fails when the log steps a paused city", () => {
        const log = logFrom({seed: 8, level: Level.easy}, [
            {step: 0, player: LOCAL_PLAYER, command: {type: "setSpeed", speed: Speed.paused}},
            {step: 10, player: LOCAL_PLAYER, command: {type: "setSpeed", speed: Speed.medium}},
        ]);

        expect(() => replay(log)).toThrow("The log steps a paused city, from step 0 to step 10");
    });

    // The game always ends a log on a checkpoint, but a log written by hand needn't
    it("ends at the last entry when it comes after the last checkpoint", async () => {
        const city = cityFromSeed(8, Level.easy, Speed.medium);
        const log = logFrom({seed: 8, level: Level.easy},
                            [{step: 10, player: LOCAL_PLAYER, command: {type: "setSpeed", speed: Speed.fast}}],
                            [{step: 0, hash: await stateHash(city)}]);

        const replayed = replay(log);

        expect(lastStep(log)).toBe(10);
        await expect(replayed.verified).resolves.toBe(1);
        expect([replayed.city._speedCycle, replayed.city.getSpeed()]).toEqual([10, Speed.fast]);
    });

    it("starts from a save", () => {
        const saved = fixtureSave("town");

        expect(plainSavedState(replay(logFrom({save: saved}, [])).city)).toEqual(saved);
    });
});

describe("joining sessions", () => {

    const HASHES = {start: "a".repeat(64), later: "b".repeat(64)};

    const command = (step: number) =>
        ({step, player: LOCAL_PLAYER, command: {type: "setAutoBudget", on: step % 2 === 0}});

    // Three sessions, each after the first loading the city the one before it ended on: a session from seed 23 that
    // ended at step 100, one that took 50 steps more, and one that took 20
    async function sessions(): Promise<[CommandLog, CommandLog, CommandLog]> {
        const city = cityFromSeed(23, Level.medium, Speed.medium);
        advance(city, 100);
        const firstSave = plainSavedState(city);
        const firstEnd = await stateHash(city);
        advance(city, 50);
        const secondEnd = await stateHash(city);

        const first: CommandLog = {formatVersion: LOG_FORMAT_VERSION, seed: 23, level: Level.medium,
                                   entries: [command(0), command(40)],
                                   checkpoints: [{step: 0, hash: HASHES.start}, {step: 100, hash: firstEnd}]};
        const second: CommandLog = {formatVersion: LOG_FORMAT_VERSION, save: firstSave, entries: [command(5)],
                                    checkpoints: [{step: 0, hash: firstEnd}, {step: 50, hash: secondEnd}]};
        const third: CommandLog = {formatVersion: LOG_FORMAT_VERSION, save: plainSavedState(city),
                                   entries: [command(7)], checkpoints: [{step: 0, hash: secondEnd}, {step: 20, hash: HASHES.later}]};
        return [first, second, third];
    }

    it("carries each loaded session on from the step the one before ended at, with no entry for the load", async () => {
        const [first, second, third] = await sessions();

        expect(await joinSessions([first, second, third])).toEqual({
            formatVersion: LOG_FORMAT_VERSION, seed: 23, level: Level.medium,
            entries: [command(0), command(40), {...command(5), step: 105}, {...command(7), step: 157}],
            checkpoints: [...first.checkpoints, {step: 150, hash: second.checkpoints[1].hash},
                          {step: 170, hash: HASHES.later}],
        });
    });

    it("starts where the first session started, from a save", async () => {
        const [first, second] = await sessions();
        const save = plainSavedState(cityFromSeed(23, Level.medium, Speed.medium));
        const fromSave: CommandLog = {formatVersion: LOG_FORMAT_VERSION, save, entries: first.entries,
                                      checkpoints: first.checkpoints};

        const joined = await joinSessions([fromSave, second]);

        expect(joined).toEqual(expect.objectContaining({save}));
        expect(joined).not.toHaveProperty("seed");
    });

    it("leaves one session as it was", async () => {
        const [first] = await sessions();

        expect(await joinSessions([first])).toEqual(first);
    });

    it("refuses a later session that loads another city than the one before it ended on", async () => {
        const [first, second] = await sessions();
        const other = plainSavedState(cityFromSeed(24, Level.medium, Speed.medium));
        const loaded = await hashSavedState(other);

        await expect(joinSessions([first, {...second, save: other}])).rejects.toThrow(
            `Session 2 loads a city whose state hash is ${loaded}, but the session before it ended on ` +
            first.checkpoints[1].hash);
    });

    it("refuses a later session that starts from a seed", async () => {
        const [first] = await sessions();

        await expect(joinSessions([first, first])).rejects.toThrow("Session 2 starts from a seed");
    });

    // Its checkpoint at its first step comes after those commands, where the joined log has the city as loaded
    it("refuses a later session that applies a command before its first step", async () => {
        const [first, second] = await sessions();

        await expect(joinSessions([first, {...second, entries: [command(0)]}])).rejects.toThrow(
            "Session 2 applies a command before its first step");
    });

    it("refuses a session after one without checkpoints", async () => {
        const [first, second] = await sessions();

        await expect(joinSessions([{...first, checkpoints: []}, second])).rejects.toThrow(
            "The session before session 2 has no checkpoints");
    });

    it("refuses no sessions at all", async () => {
        await expect(joinSessions([])).rejects.toThrow("No session to join");
    });
});
