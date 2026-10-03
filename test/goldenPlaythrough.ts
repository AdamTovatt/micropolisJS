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

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { GoldenPlaythrough, GoldenRun, goldenText, readGoldenRun, StageCheckpoint } from "../e2e/goldenPlaythrough";
import { CommandLog } from "../src/commandLog";

const STAGES = ["Roads", "Zones", "Fire"];
const HASH = {a: "a".repeat(64), b: "b".repeat(64), c: "c".repeat(64), x: "e".repeat(64), y: "f".repeat(64)};

const LOG: CommandLog = {
    formatVersion: 1, seed: 23, level: 1,
    entries: [
        {step: 0, player: "local", command: {type: "tool", tool: "road", path: [{x: 1, y: 2}], autoBulldoze: true}},
        {step: 48, player: "local", command: {type: "setSpeed", speed: 0}},
    ],
    checkpoints: [{step: 0, hash: HASH.a}, {step: 96, hash: HASH.b}],
};

function checkpoint(index: number, hash: string): StageCheckpoint {
    return {stage: STAGES[index], step: 48 * index, commands: index, hash};
}

const PINNED: GoldenRun = {checkpoints: [checkpoint(0, HASH.a), checkpoint(1, HASH.b), checkpoint(2, HASH.c)], log: LOG};

// Checks each stage's hash in turn, as the playthrough does
function checkAll(golden: GoldenPlaythrough, hashes: string[], failedStage = -1) {
    return hashes.map((hash, index) => golden.check(index, checkpoint(index, hash), index === failedStage));
}

describe("the golden playthrough", () => {

    describe("checking a run", () => {

        it("passes a run whose every hash matches, and whose log is the golden one", () => {
            const golden = new GoldenPlaythrough(false, PINNED, STAGES);

            expect(checkAll(golden, [HASH.a, HASH.b, HASH.c])).toEqual(
                PINNED.checkpoints.map((expected) => ({expected, diverged: false})));
            golden.checkLog(JSON.parse(JSON.stringify(LOG)));
            expect(golden.failures()).toEqual([]);
        });

        it("names only the first stage that diverged, and marks every one", () => {
            const golden = new GoldenPlaythrough(false, PINNED, STAGES);

            expect(checkAll(golden, [HASH.a, HASH.x, HASH.y]).map((check) => check?.diverged))
                .toEqual([false, true, true]);
            expect(golden.failures()).toEqual([
                `First diverged at stage 2, "Zones": state hash ${HASH.x}, expected ${HASH.b}`,
            ]);
        });

        // A stage is replayed at its step and commands (StageCheckpoint), so a run must reach both
        it("fails a stage that took other steps or applied other commands, though its hash matches", () => {
            const golden = new GoldenPlaythrough(false, PINNED, STAGES);

            const check = golden.check(1, {...checkpoint(1, HASH.b), step: 50, commands: 3}, false);

            expect(check).toEqual({expected: PINNED.checkpoints[1], diverged: true});
            expect(golden.failures()).toEqual([
                "First diverged at stage 2, \"Zones\": step 50, expected 48; commands 3, expected 1",
            ]);
        });

        it("fails a stage with no golden checkpoint, saying how to pin it", () => {
            const golden = new GoldenPlaythrough(false, {...PINNED, checkpoints: [checkpoint(0, HASH.a)]}, STAGES);

            expect(checkAll(golden, [HASH.a, HASH.b])[1]).toEqual({expected: null, diverged: true});
            expect(golden.failures()).toEqual([
                `First diverged at stage 2, "Zones": state hash ${HASH.b}, expected none pinned: run npm run ` +
                "e2e:golden to pin it",
            ]);
        });

        it("marks a failed stage's hash, but leaves the failure to the stage", () => {
            const golden = new GoldenPlaythrough(false, PINNED, STAGES);

            expect(checkAll(golden, [HASH.a, HASH.x], 1)[1]).toEqual({expected: PINNED.checkpoints[1], diverged: true});
            expect(golden.failures()).toEqual([]);
        });

        it("fails on golden checkpoints for stages the playthrough doesn't have", () => {
            const gone = [{...checkpoint(0, HASH.a), stage: "Gone"}, {...checkpoint(0, HASH.a), stage: "Older"}];
            const golden = new GoldenPlaythrough(false, {...PINNED, checkpoints: [...PINNED.checkpoints, ...gone]},
                                                 STAGES);

            checkAll(golden, [HASH.a, HASH.b, HASH.c]);
            expect(golden.failures()).toEqual(["Golden checkpoints for stages the playthrough doesn't have: Gone, Older"]);
        });

        it.each([
            ["where it starts", {...LOG, seed: 24}, "in where it starts"],
            ["an entry", {...LOG, entries: [LOG.entries[0], {...LOG.entries[1], step: 49}]},
             `at entry 1: ${JSON.stringify({...LOG.entries[1], step: 49})}, expected ${JSON.stringify(LOG.entries[1])}`],
            ["an extra entry", {...LOG, entries: [...LOG.entries, LOG.entries[1]]},
             `at entry 2: ${JSON.stringify(LOG.entries[1])}, expected none`],
            ["a checkpoint", {...LOG, checkpoints: [LOG.checkpoints[0]]},
             `at checkpoint 1: none, expected ${JSON.stringify(LOG.checkpoints[1])}`],
        ])("fails a run whose log differs from the golden one in %s, though every hash matches", (_what, log, where) => {
            const golden = new GoldenPlaythrough(false, PINNED, STAGES);
            checkAll(golden, [HASH.a, HASH.b, HASH.c]);

            golden.checkLog(log as CommandLog);

            expect(golden.failures()).toEqual([`The run's command log differs from the golden one ${where}`]);
        });

        it("fails once, saying how to write it, when there is none", () => {
            const golden = new GoldenPlaythrough(false, null, STAGES);

            expect(checkAll(golden, [HASH.a, HASH.b])).toEqual([
                {expected: null, diverged: true}, {expected: null, diverged: true},
            ]);
            golden.checkLog(LOG);
            expect(golden.failures()).toEqual([
                "There is no golden playthrough: run npm run e2e:golden to write e2e/goldenPlaythrough.json",
            ]);
        });

        it("refuses to write it", () => {
            expect(() => new GoldenPlaythrough(false, PINNED, STAGES).write(tmpdir()))
                .toThrow("Only a run writing the golden playthrough writes it");
        });
    });

    describe("writing it", () => {

        let directory: string;

        beforeEach(() => {
            directory = mkdtempSync(join(tmpdir(), "golden-"));
        });

        afterEach(() => {
            rmSync(directory, {recursive: true, force: true});
        });

        it("takes every checkpoint down in stage order, and the log, never comparing", () => {
            const golden = new GoldenPlaythrough(true, null, STAGES);

            expect(checkAll(golden, [HASH.x, HASH.y, HASH.c])).toEqual([undefined, undefined, undefined]);
            golden.checkLog(LOG);
            expect(golden.failures()).toEqual([]);

            golden.write(directory);
            expect(readGoldenRun(join(directory, "goldenPlaythrough.json"))).toEqual({
                checkpoints: [checkpoint(0, HASH.x), checkpoint(1, HASH.y), checkpoint(2, HASH.c)], log: LOG,
            });
        });

        it("writes nothing without the run's log", () => {
            const golden = new GoldenPlaythrough(true, null, STAGES);
            checkAll(golden, [HASH.a]);

            expect(() => golden.write(directory)).toThrow("The run's command log was never taken");
        });

        // So that a change to it reads as a diff of the lines that changed
        it("writes one checkpoint and one log entry to a line", () => {
            const lines = goldenText(PINNED).split("\n");

            for (const item of [...PINNED.checkpoints, ...LOG.entries, ...LOG.checkpoints]) {
                expect(lines.filter((line) => line.includes(JSON.stringify(item)))).toHaveLength(1);
            }
            expect(JSON.parse(goldenText(PINNED))).toEqual(PINNED);
        });
    });

    describe("for a run", () => {

        let directory: string;
        const writeGolden = process.env.E2E_WRITE_GOLDEN;

        beforeEach(() => {
            directory = mkdtempSync(join(tmpdir(), "golden-"));
            delete process.env.E2E_WRITE_GOLDEN;
        });

        afterEach(() => {
            rmSync(directory, {recursive: true, force: true});
            if (writeGolden === undefined) {
                delete process.env.E2E_WRITE_GOLDEN;
            } else {
                process.env.E2E_WRITE_GOLDEN = writeGolden;
            }
        });

        it("checks against the golden file", () => {
            writeFileSync(join(directory, "goldenPlaythrough.json"), goldenText(PINNED));
            const golden = GoldenPlaythrough.forRun(directory, STAGES);

            expect(golden.writing).toBe(false);
            expect(checkAll(golden, [HASH.a, HASH.x]).map((check) => check?.diverged)).toEqual([false, true]);
        });

        it("refuses a golden file whose log isn't one", () => {
            writeFileSync(join(directory, "goldenPlaythrough.json"),
                          JSON.stringify({checkpoints: [], log: {...LOG, formatVersion: 2}}));

            expect(() => GoldenPlaythrough.forRun(directory, STAGES)).toThrow("This is a version 2 command log");
        });

        it("fails when there is no golden file", () => {
            expect(GoldenPlaythrough.forRun(directory, STAGES).failures()).toEqual([
                "There is no golden playthrough: run npm run e2e:golden to write e2e/goldenPlaythrough.json",
            ]);
        });

        it("writes it when E2E_WRITE_GOLDEN is 1, without reading the file", () => {
            process.env.E2E_WRITE_GOLDEN = "1";
            writeFileSync(join(directory, "goldenPlaythrough.json"), "not JSON");

            expect(GoldenPlaythrough.forRun(directory, STAGES).writing).toBe(true);
            expect(readFileSync(join(directory, "goldenPlaythrough.json"), "utf8")).toBe("not JSON");
        });
    });
});
