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

import { CommandLog, parseLog } from "../src/commandLog";

// The golden playthrough, e2e/goldenPlaythrough.json: each stage's checkpoint, in stage order, and the run's command
// log. A run either checks itself against it, failing on the first stage that diverged but carrying on, and on a log
// that differs, or takes itself down to write the file afresh (`npm run e2e:golden`). test/playthroughReplay.ts replays
// the log headless to each stage's checkpoint.

// A stage's checkpoint: the steps the run had taken and the commands it had applied when the stage ended, which are
// the log's entries before it, and the state hash of the city then. Since the next stage may apply commands before its
// first step, a stage can end partway through a step's commands, where the log has no checkpoint of its own.
export interface StageCheckpoint {
  stage: string;
  step: number;
  commands: number;
  hash: string;
}

export interface GoldenRun {
  checkpoints: StageCheckpoint[];
  log: CommandLog;
}

// A stage's checkpoint against its golden checkpoint, which is null when the stage has none. It diverged when any of
// its step, commands or hash differs.
export interface CheckpointCheck {
  expected: StageCheckpoint | null;
  diverged: boolean;
}

const COMPARED: [keyof StageCheckpoint, string][] = [["step", "step"], ["commands", "commands"], ["hash", "state hash"]];

const GOLDEN_FILE = "goldenPlaythrough.json";

export const NO_GOLDEN_PLAYTHROUGH = `There is no golden playthrough: run npm run e2e:golden to write e2e/${GOLDEN_FILE}`;

export function goldenFile(e2eDirectory: string): string {
  return join(e2eDirectory, GOLDEN_FILE);
}

// What a run does with the golden playthrough: checks itself against it, or writes it afresh
export interface GoldenPlaythrough {
  // A stage's checkpoint, and how it compares with its golden one when the run checks against it
  recordStage(index: number, checkpoint: StageCheckpoint, stageFailed: boolean): CheckpointCheck | undefined;
  // The run's command log
  recordLog(log: CommandLog): void;
  // Why the golden playthrough fails the run, if it does
  failures(): string[];
  // Called once the run has passed: a run that writes the golden playthrough writes it
  finish(e2eDirectory: string): void;
}

// The run's golden playthrough: checked against the file, or written, as E2E_WRITE_GOLDEN says
export function goldenPlaythroughFor(e2eDirectory: string, stages: readonly string[]): GoldenPlaythrough {
  return process.env.E2E_WRITE_GOLDEN === "1" ?
    new GoldenWriter(stages) : new GoldenCheck(readGoldenRun(goldenFile(e2eDirectory)), stages);
}

// Golden checkpoints are found by their stage's name, so no two stages may share one
function repeatedStageNames(stages: readonly string[]): string[] {
  const repeated = stages.filter((name, i) => stages.indexOf(name) !== i)
    .filter((name, i, names) => names.indexOf(name) === i);
  return repeated.length === 0 ? [] : [`Stages that share a name: ${repeated.join(", ")}`];
}

// Checks the run against the golden run given, which is null when there is no golden file
export class GoldenCheck implements GoldenPlaythrough {
  private readonly problems: string[];
  private firstDivergence: string | null = null;
  private logDifference: string | null = null;

  constructor(private readonly pinned: GoldenRun | null, stages: readonly string[]) {
    this.problems = repeatedStageNames(stages);

    if (pinned === null) {
      this.problems.push(NO_GOLDEN_PLAYTHROUGH);
      return;
    }

    const unknown = pinned.checkpoints.map((checkpoint) => checkpoint.stage).filter((name) => !stages.includes(name));
    if (unknown.length > 0) {
      this.problems.push(`Golden checkpoints for stages the playthrough doesn't have: ${unknown.join(", ")}`);
    }
  }

  // A stage that failed is already failing the run, so its checkpoint, which differs for that reason alone, isn't named
  // as the first divergence
  recordStage(index: number, checkpoint: StageCheckpoint, stageFailed: boolean): CheckpointCheck {
    const {stage} = checkpoint;
    const expected = this.pinned?.checkpoints.find((pinned) => pinned.stage === stage) ?? null;
    const differences = expected === null ?
      [`state hash ${checkpoint.hash}, expected none pinned: run npm run e2e:golden to pin it`] :
      COMPARED.filter(([key]) => checkpoint[key] !== expected[key])
        .map(([key, name]) => `${name} ${checkpoint[key]}, expected ${expected[key]}`);
    const diverged = differences.length > 0;
    if (diverged && !stageFailed && this.pinned !== null && this.firstDivergence === null) {
      this.firstDivergence = `First diverged at stage ${index + 1}, "${stage}": ${differences.join("; ")}`;
    }

    return {expected, diverged};
  }

  // A log that differs fails the run even where every hash matches: the run sent other commands, such as one the
  // simulation rejected
  recordLog(log: CommandLog): void {
    if (this.pinned !== null) {
      const difference = firstDifference(this.pinned.log, log);
      this.logDifference = difference === null ? null : `The run's command log differs from the golden one ${difference}`;
    }
  }

  failures(): string[] {
    return [...this.problems, this.firstDivergence, this.logDifference].filter((failure) => failure !== null);
  }

  finish(): void {}
}

// Takes the run's checkpoints and log down, never comparing, and writes them as the golden playthrough
export class GoldenWriter implements GoldenPlaythrough {
  private readonly problems: string[];
  private readonly taken: StageCheckpoint[] = [];
  private takenLog: CommandLog | null = null;

  constructor(stages: readonly string[]) {
    this.problems = repeatedStageNames(stages);
  }

  recordStage(_index: number, checkpoint: StageCheckpoint): undefined {
    this.taken.push(checkpoint);
    return undefined;
  }

  recordLog(log: CommandLog): void {
    this.takenLog = log;
  }

  failures(): string[] {
    return [...this.problems];
  }

  finish(e2eDirectory: string): void {
    if (this.takenLog === null) {
      throw new Error("The run's command log was never taken");
    }

    writeFileSync(goldenFile(e2eDirectory), goldenText({checkpoints: this.taken, log: this.takenLog}));
  }
}

// Where the run's log first differs from the golden one, or null when it doesn't
function firstDifference(golden: CommandLog, run: CommandLog): string | null {
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const {entries: goldenEntries, checkpoints: goldenCheckpoints, ...goldenStart} = golden;
  const {entries: runEntries, checkpoints: runCheckpoints, ...runStart} = run;

  if (!same(goldenStart, runStart)) {
    return "in where it starts";
  }

  const lists: [string, unknown[], unknown[]][] = [
    ["entry", goldenEntries, runEntries], ["checkpoint", goldenCheckpoints, runCheckpoints],
  ];
  for (const [what, expected, actual] of lists) {
    for (let i = 0; i < Math.max(expected.length, actual.length); i++) {
      if (!same(expected[i], actual[i])) {
        const shown = (item: unknown) => JSON.stringify(item) ?? "none";
        return `at ${what} ${i}: ${shown(actual[i])}, expected ${shown(expected[i])}`;
      }
    }
  }

  return null;
}

// The golden run as text, one checkpoint and one log entry to a line, so that a change to it reads as a diff of the
// lines that changed
export function goldenText(run: GoldenRun): string {
  const {entries, checkpoints, ...start} = run.log;
  const list = (items: unknown[], indent: string) => {
    const lines = items.map((item) => `${indent}  ${JSON.stringify(item)}`);
    return items.length === 0 ? "[]" : `[\n${lines.join(",\n")}\n${indent}]`;
  };
  const startLines = Object.entries(start).map(([key, value]) => `    ${JSON.stringify(key)}: ${JSON.stringify(value)},`);

  return [
    "{",
    `  "checkpoints": ${list(run.checkpoints, "  ")},`,
    "  \"log\": {",
    ...startLines,
    `    "entries": ${list(entries, "    ")},`,
    `    "checkpoints": ${list(checkpoints, "    ")}`,
    "  }",
    "}",
    "",
  ].join("\n");
}

// The golden run in the file, or null when there is none
export function readGoldenRun(file: string): GoldenRun | null {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }

    throw e;
  }

  const run = JSON.parse(text) as GoldenRun;
  return {checkpoints: run.checkpoints, log: parseLog(run.log)};
}
