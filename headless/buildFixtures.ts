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

// Exports every fixture for other runners, such as the C# port and the browser's: `npm run fixtures`. <name>.log.json
// is its command log, and <name>.json its saved state as built, before the first step, in canonical text, so the
// file's SHA-256 is the log's checkpoint at step 0. The files are ignored by git and never read back: the runner and
// the tests replay each fixture's log.

import * as fs from "fs";
import * as path from "path";
import { canonicalJson } from "../src/canonicalJson";
import { fixtureLog, fixtureNames } from "./fixtures/index";
import { fixtureSave } from "./runner";

// Relative to the repository root, where npm runs scripts
const EXPORT_DIRECTORY = path.join("headless", "fixtures", "export");

fs.mkdirSync(EXPORT_DIRECTORY, {recursive: true});

for (const name of fixtureNames()) {
  for (const [file, text] of [
    [`${name}.log.json`, JSON.stringify(fixtureLog(name), null, 2)],
    [`${name}.json`, canonicalJson(fixtureSave(name))],
  ]) {
    fs.writeFileSync(path.join(EXPORT_DIRECTORY, file), text);
    console.log(`wrote ${path.join(EXPORT_DIRECTORY, file)}`);
  }
}
