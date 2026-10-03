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

import { GoldenHashes } from "../e2e/goldenHashes";

const STAGES = ["Roads", "Zones", "Fire"];
const PINNED = {Roads: "a1", Zones: "b2", Fire: "c3"};

// Checks each stage's hash in turn, as the playthrough does
function checkAll(golden: GoldenHashes, hashes: string[], failedStage = -1) {
    return hashes.map((hash, index) => golden.check(index, STAGES[index], hash, index === failedStage));
}

describe("the playthrough's golden hashes", () => {

    describe("checking a run", () => {

        it("pass a run whose every hash matches", () => {
            const golden = new GoldenHashes(false, PINNED, STAGES);

            expect(checkAll(golden, ["a1", "b2", "c3"])).toEqual([
                {expected: "a1", diverged: false}, {expected: "b2", diverged: false}, {expected: "c3", diverged: false},
            ]);
            expect(golden.failures()).toEqual([]);
        });

        it("name only the first stage that diverged, and mark every one", () => {
            const golden = new GoldenHashes(false, PINNED, STAGES);

            expect(checkAll(golden, ["a1", "xx", "yy"]).map((check) => check?.diverged)).toEqual([false, true, true]);
            expect(golden.failures()).toEqual(['First diverged at stage 2, "Zones": state hash xx, expected b2']);
        });

        it("fail a stage with no golden hash, saying how to pin it", () => {
            const golden = new GoldenHashes(false, {Roads: "a1"}, STAGES);

            expect(checkAll(golden, ["a1", "b2"])[1]).toEqual({expected: null, diverged: true});
            expect(golden.failures()).toEqual([
                'First diverged at stage 2, "Zones": state hash b2, expected none pinned: run npm run e2e:golden to ' +
                "pin it",
            ]);
        });

        it("mark a failed stage's hash, but leave the failure to the stage", () => {
            const golden = new GoldenHashes(false, PINNED, STAGES);

            expect(checkAll(golden, ["a1", "xx"], 1)[1]).toEqual({expected: "b2", diverged: true});
            expect(golden.failures()).toEqual([]);
        });

        it("fail on golden hashes for stages the playthrough doesn't have", () => {
            const golden = new GoldenHashes(false, {...PINNED, Gone: "d4", Older: "e5"}, STAGES);

            checkAll(golden, ["a1", "b2", "c3"]);
            expect(golden.failures()).toEqual(["Golden hashes for stages the playthrough doesn't have: Gone, Older"]);
        });

        it("fail once, saying how to write them, when there are none", () => {
            const golden = new GoldenHashes(false, null, STAGES);

            expect(checkAll(golden, ["a1", "b2"])).toEqual([
                {expected: null, diverged: true}, {expected: null, diverged: true},
            ]);
            expect(golden.failures()).toEqual([
                "There are no golden hashes: run npm run e2e:golden to write e2e/goldenHashes.json",
            ]);
        });

        it("refuse to write them", () => {
            expect(() => new GoldenHashes(false, PINNED, STAGES).write(tmpdir()))
                .toThrow("Only a run writing the golden hashes writes them");
        });
    });

    describe("writing them", () => {

        let directory: string;

        beforeEach(() => {
            directory = mkdtempSync(join(tmpdir(), "golden-"));
        });

        afterEach(() => {
            rmSync(directory, {recursive: true, force: true});
        });

        it("take every hash down in stage order, never comparing", () => {
            const golden = new GoldenHashes(true, null, STAGES);

            expect(checkAll(golden, ["x1", "x2", "x3"])).toEqual([undefined, undefined, undefined]);
            expect(golden.failures()).toEqual([]);

            golden.write(directory);
            const text = readFileSync(join(directory, "goldenHashes.json"), "utf8");
            expect(Object.entries(JSON.parse(text))).toEqual([["Roads", "x1"], ["Zones", "x2"], ["Fire", "x3"]]);
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

        it("check against the golden file", () => {
            writeFileSync(join(directory, "goldenHashes.json"), JSON.stringify(PINNED));
            const golden = GoldenHashes.forRun(directory, STAGES);

            expect(golden.writing).toBe(false);
            expect(checkAll(golden, ["a1", "xx"]).map((check) => check?.diverged)).toEqual([false, true]);
        });

        it("fail when there is no golden file", () => {
            expect(GoldenHashes.forRun(directory, STAGES).failures()).toEqual([
                "There are no golden hashes: run npm run e2e:golden to write e2e/goldenHashes.json",
            ]);
        });

        it("write them when E2E_WRITE_GOLDEN is 1, without reading the file", () => {
            process.env.E2E_WRITE_GOLDEN = "1";
            writeFileSync(join(directory, "goldenHashes.json"), "not JSON");

            expect(GoldenHashes.forRun(directory, STAGES).writing).toBe(true);
        });
    });
});
