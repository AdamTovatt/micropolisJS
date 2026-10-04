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

// `npm run benchmark`: rewrites docs/benchmarks.md. Builds the C# benchmark in Release, takes its case list, measures
// each case's state-message bytes on the TypeScript city host, then has the benchmark time the C# simulation on the
// same cases and write the report with those bytes. Run from the repository root, as npm runs it.

import { execFileSync } from "child_process";
import * as fs from "fs";
import { CaseList, measureMessageBytes } from "./messageBytes";

const PROJECT = "server/Micropolis.Benchmarks";
const REPORT = "docs/benchmarks.md";

// The benchmark's output, run as built, with no build output of its own on standard output
function benchmark(args: string[], input?: string): string {
  return execFileSync("dotnet", ["run", "--no-build", "-c", "Release", "--project", PROJECT, "--", ...args],
                      {encoding: "utf8", input, stdio: ["pipe", "pipe", "inherit"], maxBuffer: 16 * 1024 * 1024});
}

execFileSync("dotnet", ["build", PROJECT, "-c", "Release", "--nologo", "-v", "quiet"], {stdio: ["ignore", 2, 2]});

const caseList = JSON.parse(benchmark(["cases"])) as CaseList;
measureMessageBytes(caseList, (path) => fs.readFileSync(path, "utf8"), (line) => console.error(line)).then((measured) => {
  benchmark(["report", "--message-bytes", "-", "--output", REPORT], JSON.stringify(measured));
  console.error(`Wrote ${REPORT}`);
}).catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
