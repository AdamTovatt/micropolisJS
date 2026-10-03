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

import { Checkpoint, CommandLog, LOG_FORMAT_VERSION } from "../../src/commandLog";
import { Command, LOCAL_PLAYER } from "../../src/protocol";
import { Level } from "../city";

// The step of a fixture's run checkpoint: about three city years at medium speed, the speed a new city starts at
export const RUN_STEPS = 6912;

// A fixture's log: a city on seed 8's map at the easy level, built before its first step by commands the one player
// sends, with its golden hashes as its checkpoints. Seed 8's map has open land and woods from (10, 10) to (53, 33).
export function builtFixture(description: string, commands: Command[], checkpoints: Checkpoint[]): CommandLog {
  return {
    formatVersion: LOG_FORMAT_VERSION,
    description,
    seed: 8,
    level: Level.easy,
    entries: commands.map((command) => ({step: 0, player: LOCAL_PLAYER, command})),
    checkpoints,
  };
}
