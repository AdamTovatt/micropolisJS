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
// --steps <n>`. Prints the state hash, then the year, population and funds.

import { parseCommandLine } from "./commandLine";
import { advance, startCity, summarise } from "./runner";

async function main() {
  const run = parseCommandLine(process.argv.slice(2));
  const city = startCity(run.start);
  advance(city, run.steps);

  const summary = await summarise(city);
  console.log(summary.hash);
  console.log(`year ${summary.year}, population ${summary.population}, funds ${summary.funds}`);
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
