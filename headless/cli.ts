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

// The headless runner: `npm run simulate -- (--seed <n> | --fixture <name> [--reseed <n>]) [--speed <speed>]
// --steps <n>`, or `npm run simulate -- --log <file>`, which replays a command log, counts its commands' outcomes and
// verifies its checkpoints, printing how many match, and fails when it has none to verify. Prints the state hash, then
// the year, population and funds.

import * as fs from "fs";
import { run } from "./run";

run(process.argv.slice(2), (path) => fs.readFileSync(path, "utf8")).then((report) => {
  report.lines.forEach((line) => console.log(line));

  if (report.failure !== null) {
    console.error(report.failure);
    process.exitCode = 1;
  }
}, (error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
