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

// Exports every fixture's command log for other runners, such as the browser's: `npm run fixtures` writes
// <name>.log.json. The files are ignored by git and never read back: the runner and the tests replay each fixture's
// log. Each fixture's saved state at its checkpoints is in conformance/saves/, which `npm run conformance` writes.

import * as fs from "fs";
import * as path from "path";
import { fixtureLog, fixtureNames } from "./fixtures/index";

// Relative to the repository root, where npm runs scripts
const EXPORT_DIRECTORY = path.join("headless", "fixtures", "export");

fs.mkdirSync(EXPORT_DIRECTORY, {recursive: true});

for (const name of fixtureNames()) {
  const file = path.join(EXPORT_DIRECTORY, `${name}.log.json`);
  fs.writeFileSync(file, JSON.stringify(fixtureLog(name), null, 2));
  console.log(`wrote ${file}`);
}
