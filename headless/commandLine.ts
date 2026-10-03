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

import { parseArgs } from "util";
import { RUNNING_SPEEDS, RunningSpeed } from "./city";
import { Start } from "./runner";

// The headless runner's arguments: (--seed <n> | --fixture <name> [--reseed <n>]) [--speed <speed>] --steps <n>, or
// --log <file> alone

export type Run = {start: Start, steps: number} | {log: string};

function wholeNumber(name: string, value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!/^\d+$/.test(value)) {
    throw new Error(`--${name} takes a whole number, got ${value}`);
  }

  return Number(value);
}

export function parseCommandLine(args: string[]): Run {
  const {values} = parseArgs({
    args,
    options: {
      seed: {type: "string"},
      fixture: {type: "string"},
      reseed: {type: "string"},
      speed: {type: "string"},
      steps: {type: "string"},
      log: {type: "string"},
    },
    strict: true,
  });

  if (values.log !== undefined) {
    const others = Object.keys(values).filter((name) => name !== "log");
    if (others.length > 0) {
      throw new Error(`--log replays a log as it stands, and takes no other option, got --${others.join(", --")}`);
    }

    return {log: values.log};
  }

  if (values.speed !== undefined && !(RUNNING_SPEEDS as string[]).includes(values.speed)) {
    throw new Error(`--speed is one of ${RUNNING_SPEEDS.join(", ")}, got ${values.speed}`);
  }

  const steps = wholeNumber("steps", values.steps);
  if (steps === undefined) {
    throw new Error("--steps is required");
  }

  return {
    start: {
      seed: wholeNumber("seed", values.seed),
      fixture: values.fixture,
      reseed: wholeNumber("reseed", values.reseed),
      speed: values.speed as RunningSpeed | undefined,
    },
    steps,
  };
}
