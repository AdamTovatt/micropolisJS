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

import { test } from "@playwright/test";
import { writeFileSync } from "fs";
import { join } from "path";

import { gameSaveHash } from "../src/gameSaveHash";
import { GoldenPlaythrough, goldenPlaythroughFor } from "./goldenPlaythrough";
import { blockNetwork, collectPageProblems } from "./page";
import { Player } from "./player";
import { DriverRun, Report, StageResult } from "./report";
import { CITY_NAME, letTheDriverRun, SEED, STAGES } from "./stages";

// Plays the city through every stage, taking a checkpoint after each: the stage's step count, the commands applied so
// far, its state hash, a screenshot of the whole game and the save. The checkpoint is the pass or fail
// (goldenPlaythrough.ts): one that differs from its golden checkpoint fails the run, which carries on so the report is
// complete, and the failure names the first stage that diverged. A stage that fails ends the run there. After the last
// stage, the run's command log must be the golden one, and the browser's own driver runs the city, which the report
// shows a screenshot of. What goes wrong in the page fails the stage or the step it went wrong in.

test("the playthrough", async ({page}) => {
  await blockNetwork(page);
  const problems = collectPageProblems(page);

  const e2eDirectory = test.info().config.rootDir;
  const report = new Report(join(e2eDirectory, "..", "e2e-report"), SEED);
  const player = new Player(page);
  let golden: GoldenPlaythrough | null = null;
  let totalSteps = 0;
  const failures: string[] = [];

  // What a step came to: its value, unless it failed, and its error
  const outcomeOf = async <T>(play: () => Promise<T>): Promise<{value?: T, error?: string}> => {
    try {
      return {value: await play()};
    } catch (e) {
      return {error: (e as Error).message};
    }
  };

  // An error, joined by what went wrong in the page since this was last asked
  const withPageProblems = (error: string | undefined) => {
    const all = [error, ...problems.splice(0)].filter(Boolean);
    return all.length > 0 ? all.join("\n") : undefined;
  };

  const screenshot = async (stem: string) => {
    await player.settle();
    await page.screenshot({path: join(report.directory, `${stem}.png`), fullPage: true});
    return `${stem}.png`;
  };

  // The stage's checkpoint, taken whether it passed or not, to show where it went wrong, and checked against its golden
  // checkpoint
  const takeCheckpoint = async (index: number, result: StageResult, runGolden: GoldenPlaythrough) => {
    await player.holdDriver();
    result.steps = player.takeStepCount();
    totalSteps += result.steps;
    result.totalSteps = totalSteps;

    const stem = report.fileStem(index, result.stage);
    result.screenshot = await screenshot(stem);
    const commands = await player.commandsApplied();
    result.commands = commands;
    const save = await player.save();
    result.save = `${stem}.json`;
    writeFileSync(join(report.directory, result.save), JSON.stringify(save));
    const hash = await gameSaveHash(save);
    result.hash = hash;

    result.error = withPageProblems(result.error);
    result.goldenCheck = runGolden.recordStage(index, {stage: result.stage, step: totalSteps, commands, hash},
                                               result.error !== undefined);
  };

  try {
    golden = goldenPlaythroughFor(e2eDirectory, STAGES.map((stage) => stage.name));
    await player.startNewGame(SEED, CITY_NAME, "Med");
    report.buildId = await player.buildId();
    let stageFailed = false;

    for (let index = 0; index < STAGES.length && !stageFailed; index++) {
      const stage = STAGES[index];
      const result: StageResult = {stage: stage.name, steps: 0, totalSteps};
      report.stages.push(result);

      result.error = (await outcomeOf(() => stage.play(player))).error;
      await takeCheckpoint(index, result, golden);

      if (result.error) {
        failures.push(`Stage ${index + 1}, "${stage.name}", failed: ${result.error}`);
        stageFailed = true;
      }
    }

    if (!stageFailed) {
      // The run's log, which replays to every stage's checkpoint (test/playthroughReplay.ts)
      const {value: log, error} = await outcomeOf(async () => {
        const runLog = await player.runLog();
        report.log = "command-log.json";
        writeFileSync(join(report.directory, report.log), JSON.stringify(runLog));
        return runLog;
      });

      if (log !== undefined) {
        golden.recordLog(log);
      }

      const logError = withPageProblems(error);
      if (logError) {
        failures.push(`The run's command log: ${logError}`);
      }

      const driverRun: DriverRun = {};
      report.driverRun = driverRun;
      const driverError = (await outcomeOf(() => letTheDriverRun(player))).error;
      await player.holdDriver();
      driverRun.screenshot = await screenshot(report.fileStem(STAGES.length, "the browser's own driver"));
      driverRun.error = withPageProblems(driverError);

      if (driverRun.error) {
        failures.push(`The browser's own driver failed: ${driverRun.error}`);
      }
    }
  } finally {
    // What went wrong in the page after the last step that was asked, such as while a step was cut short
    const late = withPageProblems(undefined);
    if (late) {
      failures.push(`Went wrong in the page: ${late}`);
    }

    report.failures = [...(golden?.failures() ?? []), ...failures];
    report.write();
  }

  if (report.failures.length > 0) {
    throw new Error(report.failures.join("\n"));
  }

  golden.finish(e2eDirectory);
});
