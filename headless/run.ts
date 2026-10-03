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

import { parseLog } from "../src/commandLog";
import { CommandResult } from "../src/commands";
import { parseCommandLine } from "./commandLine";
import { advance, replay, startCity, summarise } from "./runner";

// What the headless command line does, apart from printing: runs a city, or replays a log, and says what came of it

export interface Report {
  // The lines to print
  lines: string[];
  // Why the run fails although it ran to its end, or null when it passes
  failure: string | null;
}

// The outcomes of a log's commands, counted in the order each first came up, such as "12 commands: 11 ok, 1 rejected"
export function outcomeCounts(results: CommandResult[]): string {
  const counts = new Map<string, number>();
  for (const result of results) {
    counts.set(result.outcome, (counts.get(result.outcome) ?? 0) + 1);
  }

  const parts = Array.from(counts, ([outcome, count]) => `${count} ${outcome}`);
  return `${results.length} commands` + (parts.length === 0 ? "" : `: ${parts.join(", ")}`);
}

// Runs the command line's arguments, reading a log's file with readFile. A replay throws at a checkpoint that doesn't
// match. One whose log has no checkpoints runs to its end but fails, since it verified nothing.
export async function run(args: string[], readFile: (path: string) => string): Promise<Report> {
  const parsed = parseCommandLine(args);
  const lines: string[] = [];
  let failure: string | null = null;
  let city;

  if ("log" in parsed) {
    const replayed = replay(parseLog(JSON.parse(readFile(parsed.log))));
    const matched = await replayed.verified;
    lines.push(outcomeCounts(replayed.results));

    if (matched === 0) {
      failure = "The log has no checkpoints, so its replay verified nothing";
    } else {
      lines.push(`${matched} checkpoints match`);
    }

    city = replayed.city;
  } else {
    city = startCity(parsed.start);
    advance(city, parsed.steps);
  }

  const summary = await summarise(city);
  lines.push(summary.hash, `year ${summary.year}, population ${summary.population}, funds ${summary.funds}`);
  return {lines, failure};
}
