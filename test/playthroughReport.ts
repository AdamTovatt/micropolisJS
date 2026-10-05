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

import { mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { basename, join } from "path";

import { StageCheckpoint } from "../e2e/goldenPlaythrough";
import { Report, StageResult } from "../e2e/report";

const HASH = {a: "a".repeat(64), b: "b".repeat(64)};

const GOLDEN: StageCheckpoint = {stage: "Roads", step: 48, commands: 2, hash: HASH.a};

// A stage that took its checkpoint, checked against GOLDEN, with what differs from it given
function result(differs: Partial<StageResult> = {}): StageResult {
    const taken = {stage: "Roads", steps: 48, totalSteps: 48, commands: 2, hash: HASH.a, ...differs};
    const diverged = taken.totalSteps !== GOLDEN.step || taken.commands !== GOLDEN.commands || taken.hash !== GOLDEN.hash;

    return {...taken, goldenCheck: {expected: GOLDEN, diverged}};
}

describe("the playthrough's report", () => {

    let directory: string;

    beforeEach(() => {
        directory = join(mkdtempSync(join(tmpdir(), "report-")), "e2e-report");
    });

    afterEach(() => {
        rmSync(join(directory, ".."), {recursive: true, force: true});
    });

    // The page's sections, one a stage
    function sections(report: Report): string[] {
        report.write();
        return readFileSync(join(directory, "index.html"), "utf8").split("<section").slice(1);
    }

    it("marks only a stage that failed or diverged", () => {
        const report = new Report(directory, 23);
        report.stages.push(result(), result({error: "The road is not there"}), result({hash: HASH.b}));

        expect(sections(report).map((section) => section.startsWith(" class=\"stage failed\"")))
            .toEqual([false, true, true]);
    });

    it("shows the golden figure beside each figure that differs, and only those", () => {
        const report = new Report(directory, 23);
        report.stages.push(result({totalSteps: 50, hash: HASH.b}));

        const [section] = sections(report);

        expect(section).toContain("<dt>Steps in all</dt><dd>50 (expected 48)</dd>");
        expect(section).toContain("<dt>Commands in all</dt><dd>2</dd>");
        expect(section).toContain(`<dt>State hash</dt><dd>${HASH.b} (differs)</dd>`);
        expect(section).toContain(`<dt>Expected hash</dt><dd>${HASH.a}</dd>`);
    });

    it("says when a stage has no golden checkpoint", () => {
        const report = new Report(directory, 23);
        report.stages.push({...result(), goldenCheck: {expected: null, diverged: true}});

        const [section] = sections(report);

        expect(section).toContain("<dt>Expected hash</dt><dd>none pinned</dd>");
        expect(section).not.toContain("(differs)");
    });

    it("gives the command that replays the run's log, from the repository root", () => {
        const report = new Report(directory, 23);
        report.log = "command-log.json";
        report.write();

        expect(readFileSync(join(directory, "index.html"), "utf8"))
            .toContain(`dotnet run --project server/Micropolis.Headless -- --log ${basename(directory)}/command-log.json`);
    });
});
