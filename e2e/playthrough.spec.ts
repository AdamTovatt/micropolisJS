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

import { blockOtherHosts, collectPageProblems } from "./page";
import { Player } from "./player";
import { Checkpoint, DriverRun, Report } from "./report";
import { CITY_NAME, letTheDriverRun, SEED, STAGES } from "./stages";

// Plays the city through every stage, taking a checkpoint after each: the stage's step count, a screenshot of the whole
// game and the save. A stage that fails ends the run there, and the report shows every stage up to it. After the last
// stage the browser's own driver runs the city, and the report shows a screenshot of it.

test("the playthrough", async ({page}) => {
  await blockOtherHosts(page);
  const problems = collectPageProblems(page);

  const report = new Report(join(test.info().config.rootDir, "..", "e2e-report"), SEED);
  const player = new Player(page);
  let totalSteps = 0;
  let failure: string | null = null;

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
    await player.startNewGame(SEED, CITY_NAME, "Med");
    report.buildId = await player.buildId();

    for (let index = 0; index < STAGES.length; index++) {
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
      checkpoint.save = `${stem}.json`;
      writeFileSync(join(report.directory, checkpoint.save), JSON.stringify(await player.save()));

      if (checkpoint.error) {
        failure = `Stage ${index + 1}, "${stage.name}", failed: ${checkpoint.error}`;
        break;
      }
    }

    if (failure === null) {
      const driverRun: DriverRun = {};
      report.driverRun = driverRun;
      driverRun.error = await errorOf(() => letTheDriverRun(player));
      await player.holdDriver();
      driverRun.screenshot = await screenshot(report.fileStem(STAGES.length, "the browser's own driver"));

      if (driverRun.error) {
        failure = `The browser's own driver failed: ${driverRun.error}`;
      }
    }
  } finally {
    report.write();
  }

  if (failure !== null) {
    throw new Error(failure);
  }
});
