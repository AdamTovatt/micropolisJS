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

import { join } from "path";

import { goldenFile, GoldenRun, NO_GOLDEN_PLAYTHROUGH, readGoldenRun } from "../e2e/goldenPlaythrough";
import { replay } from "../headless/runner";
import { CommandLog, LogStart } from "../src/commandLog";
import { plainSavedState, stateHash } from "../src/stateHash";

// The end-to-end playthrough's command log, as the browser recorded it, replayed headless: it must reach the hash the
// browser reached at every checkpoint, the game's own and each stage's. The e2e run checks that its log is this one,
// so every run's log replays as this one does.

function goldenRun(): GoldenRun {
    const run = readGoldenRun(goldenFile(join(__dirname, "..", "e2e")));
    if (run === null) {
        throw new Error(NO_GOLDEN_PLAYTHROUGH);
    }

    return run;
}

const golden = goldenRun();

describe("the playthrough's command log, replayed headless", () => {

    it("reaches every checkpoint the game took", async () => {
        expect(golden.log.checkpoints.length).toBeGreaterThan(0);

        await expect(replay(golden.log).verified).resolves.toBe(golden.log.checkpoints.length);
    });

    // In one pass, stage after stage: each is replayed at its step and commands (StageCheckpoint), from the city the
    // stage before it reached, saved and loaded, as a load is transparent
    it("reaches every stage's checkpoint", async () => {
        expect(golden.checkpoints.length).toBeGreaterThan(0);
        const {formatVersion, entries} = golden.log;
        let start: LogStart = "seed" in golden.log ? {seed: golden.log.seed, level: golden.log.level} :
            {save: golden.log.save};
        let reached = {step: 0, commands: 0};

        for (const {stage, step, commands, hash} of golden.checkpoints) {
            const fromLastStage: CommandLog = {
                formatVersion, ...start,
                entries: entries.slice(reached.commands, commands)
                    .map((entry) => ({...entry, step: entry.step - reached.step})),
                checkpoints: [],
            };

            const {city} = replay(fromLastStage, {to: step - reached.step, verify: false});

            expect({stage, hash: await stateHash(city)}).toEqual({stage, hash});
            start = {save: plainSavedState(city)};
            reached = {step, commands};
        }
    });
});
