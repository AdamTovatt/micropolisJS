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
import { GameServer } from "./gameServer";
import { GoldenPlaythrough, goldenPlaythroughFor, namedByAppearance } from "./goldenPlaythrough";
import { collectPageProblems } from "./page";
import { Player } from "./player";
import { DriverRun, Report, StageResult } from "./report";
import { CITY_NAME, letTheDriverRun, PLAYER_NAME, SEED, STAGES } from "./stages";

// Plays the city through every stage, taking a checkpoint after each: the stage's step count, the commands applied so
// far, its state hash, a screenshot of the whole game and the save. The checkpoint is the pass or fail
// (goldenPlaythrough.ts): one that differs from its golden checkpoint fails the run, which carries on so the report is
// complete, and the failure names the first stage that diverged. A stage that fails ends the run there. After the last
// stage, the run's command log must be the golden one, and the server's own driver runs the city, which the report
// shows a screenshot of. What goes wrong in the page fails the stage or the step it went wrong in.
//
// The city runs on the game server (gameServer.ts), whose debug channel the test hook drives: its cities run on the
// server's clock, so that once the runner lets go of the city after the stages, the server steps it in real time.

// The page's date, fixed: the tiles the client animates, and the unpowered zones' blink, take their frame from it. With
// the view scrolled to the same place on every run (Player.showTiles), and whatever on screen closes on wall time left
// to close before each screenshot, a stage's screenshot shows the same frame on every run, and two runs' screenshots
// can be compared pixel for pixel. The screenshot after the server's own driver ran is left out of such a comparison:
// how far the city got depends on wall time.
const FIXED_DATE = "2026-01-01T00:00:00Z";

let server: GameServer;

test.beforeAll(async () => {
  server = await GameServer.start("server");
});

test.afterAll(async () => {
  await server?.stop();
});

test.afterEach(async () => {
  await server.stopForwarding();
});

test("the playthrough", async ({page}) => {
  await server.forward(page);
  await page.clock.setFixedTime(FIXED_DATE);
  const problems = collectPageProblems(page);

  const e2eDirectory = test.info().config.rootDir;
  const report = new Report(join(e2eDirectory, "..", "e2e-report"), SEED);
  const player = new Player(page, {signInAs: PLAYER_NAME, server});
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

  // The notification bar closes on wall time, so each screenshot dismisses it first. The disaster view closes on wall
  // time too, once the sprite it follows is gone, so a stage must not end while it counts down.
  const screenshot = async (stem: string) => {
    await player.dismissNotification();
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
      // The run's log, which replays to every stage's checkpoint (GoldenPlaythroughTests in Micropolis.Headless.Tests),
      // its players named so that it is the same on every run
      const {value: log, error} = await outcomeOf(async () => {
        const runLog = namedByAppearance(await player.runLog());
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
      driverRun.screenshot = await screenshot(report.fileStem(STAGES.length, "the server's own driver"));
      driverRun.error = withPageProblems(driverError);

      if (driverRun.error) {
        failures.push(`The server's own driver failed: ${driverRun.error}`);
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
