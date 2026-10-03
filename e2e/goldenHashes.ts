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

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

// The playthrough's golden hashes, e2e/goldenHashes.json: each stage's state hash, by stage name, in stage order. A
// run either checks its checkpoints against them, failing on the first stage that diverged but carrying on, or
// takes them down to write the file afresh (`npm run e2e:golden`).

type Hashes = Record<string, string>;

// A checkpoint's hash against its stage's golden hash, which is null when the stage has none
export interface HashCheck {
  expected: string | null;
  diverged: boolean;
}

function goldenFile(e2eDirectory: string): string {
  return join(e2eDirectory, "goldenHashes.json");
}

export class GoldenHashes {
  private readonly taken: Hashes = {};
  private readonly problems: string[] = [];
  private firstDivergence: string | null = null;

  // Writing, or checking against the hashes given, which are null when there is no golden file
  constructor(readonly writing: boolean, private readonly pinned: Hashes | null, stages: readonly string[]) {
    if (writing) {
      return;
    }

    if (pinned === null) {
      this.problems.push("There are no golden hashes: run npm run e2e:golden to write e2e/goldenHashes.json");
      return;
    }

    const unknown = Object.keys(pinned).filter((name) => !stages.includes(name));
    if (unknown.length > 0) {
      this.problems.push(`Golden hashes for stages the playthrough doesn't have: ${unknown.join(", ")}`);
    }
  }

  // The run's golden hashes: checked against the file, or written, as E2E_WRITE_GOLDEN says
  static forRun(e2eDirectory: string, stages: readonly string[]): GoldenHashes {
    const writing = process.env.E2E_WRITE_GOLDEN === "1";

    return new GoldenHashes(writing, writing ? null : readHashes(goldenFile(e2eDirectory)), stages);
  }

  // Checks a stage's checkpoint hash, or takes it down when writing. A stage that failed is already failing the run,
  // so its hash, which differs for that reason alone, isn't named as the first divergence.
  check(index: number, stage: string, hash: string, stageFailed: boolean): HashCheck | undefined {
    if (this.writing) {
      this.taken[stage] = hash;
      return undefined;
    }

    const expected = this.pinned?.[stage] ?? null;
    const diverged = hash !== expected;
    if (diverged && !stageFailed && this.pinned !== null && this.firstDivergence === null) {
      this.firstDivergence = `First diverged at stage ${index + 1}, "${stage}": state hash ${hash}, ` +
                             `expected ${expected ?? "none pinned: run npm run e2e:golden to pin it"}`;
    }

    return {expected, diverged};
  }

  // Why the hashes fail the run, if they do
  failures(): string[] {
    return this.firstDivergence === null ? [...this.problems] : [...this.problems, this.firstDivergence];
  }

  // Writes the hashes taken, which the playthrough does only after a run that passed
  write(e2eDirectory: string): void {
    if (!this.writing) {
      throw new Error("Only a run writing the golden hashes writes them");
    }

    writeFileSync(goldenFile(e2eDirectory), `${JSON.stringify(this.taken, null, 2)}\n`);
  }
}

// The hashes in the golden file, or null when there is none
function readHashes(file: string): Hashes | null {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }

    throw e;
  }

  return JSON.parse(text);
}
