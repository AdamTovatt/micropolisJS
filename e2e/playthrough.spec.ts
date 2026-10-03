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

import { checkpointHash } from "./checkpointHash";
import { GoldenHashes } from "./goldenHashes";
import { blockOtherHosts, collectPageProblems } from "./page";
import { Player } from "./player";
import { Checkpoint, DriverRun, Report } from "./report";
import { CITY_NAME, letTheDriverRun, SEED, STAGES } from "./stages";

// Plays the city through every stage, taking a checkpoint after each: the stage's step count, its state hash, a
// screenshot of the whole game and the save. The hash is the pass or fail (goldenHashes.ts): a checkpoint whose hash
// differs from its golden hash fails the run, which carries on so the report is complete, and the failure names the
// first stage that diverged. A stage that fails ends the run there. After the last stage the browser's own driver runs
// the city, and the report shows a screenshot of it.

test("the playthrough", async ({page}) => {
  await blockOtherHosts(page);
  const problems = collectPageProblems(page);

  const e2eDirectory = test.info().config.rootDir;
  const report = new Report(join(e2eDirectory, "..", "e2e-report"), SEED);
  const player = new Player(page);
  let golden: GoldenHashes | null = null;
  let totalSteps = 0;
  const failures: string[] = [];

  // A step's error, joined by what went wrong in the page meanwhile
  const errorOf = async (play: () => Promise<void>) => {
    let error: string | undefined;
    try {
      await play();
    } catch (e) {
      error = (e as Error).message;
    }

    const all = [error, ...problems.splice(0)].filter(Boolean);
    return all.length > 0 ? all.join("\n") : undefined;
  };

  const screenshot = async (stem: string) => {
    await player.settle();
    await page.screenshot({path: join(report.directory, `${stem}.png`), fullPage: true});
    return `${stem}.png`;
  };

  try {
    golden = GoldenHashes.forRun(e2eDirectory, STAGES.map((stage) => stage.name));
    await player.startNewGame(SEED, CITY_NAME, "Med");
    report.buildId = await player.buildId();
    let stageFailed = false;

    for (let index = 0; index < STAGES.length && !stageFailed; index++) {
      const stage = STAGES[index];
      const checkpoint: Checkpoint = {stage: stage.name, steps: 0, totalSteps};
      report.checkpoints.push(checkpoint);

      checkpoint.error = await errorOf(() => stage.play(player));

      // The checkpoint, taken whether the stage passed or not, to show where it went wrong
      await player.holdDriver();
      checkpoint.steps = player.takeStepCount();
      totalSteps += checkpoint.steps;
      checkpoint.totalSteps = totalSteps;

      const stem = report.fileStem(index, stage.name);
      checkpoint.screenshot = await screenshot(stem);
      const save = await player.save();
      checkpoint.save = `${stem}.json`;
      writeFileSync(join(report.directory, checkpoint.save), JSON.stringify(save));
      checkpoint.hash = await checkpointHash(save);
      checkpoint.hashCheck = golden.check(index, stage.name, checkpoint.hash, checkpoint.error !== undefined);

      if (checkpoint.error) {
        failures.push(`Stage ${index + 1}, "${stage.name}", failed: ${checkpoint.error}`);
        stageFailed = true;
      }
    }

    if (!stageFailed) {
      const driverRun: DriverRun = {};
      report.driverRun = driverRun;
      driverRun.error = await errorOf(() => letTheDriverRun(player));
      await player.holdDriver();
      driverRun.screenshot = await screenshot(report.fileStem(STAGES.length, "the browser's own driver"));

      if (driverRun.error) {
        failures.push(`The browser's own driver failed: ${driverRun.error}`);
      }
    }
  } finally {
    report.failures = [...(golden?.failures() ?? []), ...failures];
    report.write();
  }

  if (report.failures.length > 0) {
    throw new Error(report.failures.join("\n"));
  }

  if (golden.writing) {
    golden.write(e2eDirectory);
  }
});
