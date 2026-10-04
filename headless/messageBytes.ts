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

import { CityHost } from "../src/cityHost";
import { StateMessage } from "../src/protocol";
import { SaveFormat } from "../src/savedGame";
import { hashSavedState, plainSavedState } from "../src/stateHash";
import { cityFromSeed, Level, LevelName, nameOf, RunningSpeed, Speed } from "./city";

// The state-message bytes per step a client would receive, measured on the TypeScript city host for the cases the C#
// benchmark (server/Micropolis.Benchmarks) lists. The host is held and advanced one step at a time, so it publishes
// one batch after each step, as its loop does at 60 steps a second; each message counts as the UTF-8 bytes of its JSON
// text, the payload of one WebSocket text frame. Each case also gives the state hash its city ends at, which the C#
// benchmark checks its timed city against, so both figures are of one city.

// A case as the benchmark's case list writes it: a fixture's save, or a new city on a seed's map
export type BenchmarkCase = {name: string, speed: RunningSpeed} &
  ({save: string, disastersEnabled: boolean} | {seed: number, level: LevelName});

export interface CaseList {
  warmup: number;
  steps: number;
  cases: BenchmarkCase[];
}

// One case's bytes per step after the warmup, and the state hash its city ends at
export interface CaseBytes {
  bytesPerStep: number;
  hash: string;
}

// What the benchmark's report reads: each case's bytes, over the steps the case list gives
export interface MeasuredBytes {
  warmup: number;
  steps: number;
  cases: ({name: string, speed: RunningSpeed} & CaseBytes)[];
}

const encoder = new TextEncoder();

export function messageBytes(messages: StateMessage[]): number {
  return messages.reduce((total, message) => total + encoder.encode(JSON.stringify(message)).length, 0);
}

// The saved state a case starts from, with the disasters set as the C# benchmark sets them. A save's path is read with
// readFile, and a save at another speed than its case's fails.
export function caseSave(benchmarkCase: BenchmarkCase, readFile: (path: string) => string): object {
  if ("seed" in benchmarkCase) {
    return plainSavedState(cityFromSeed(benchmarkCase.seed, Level[benchmarkCase.level], Speed[benchmarkCase.speed]));
  }

  const save = JSON.parse(readFile(benchmarkCase.save));
  const savedSpeed = nameOf(Speed, save.simulation.speed);
  if (savedSpeed !== benchmarkCase.speed) {
    throw new Error(`${benchmarkCase.save} is saved at ${savedSpeed}, but its case runs it at ${benchmarkCase.speed}`);
  }

  save.disasters.disastersEnabled = benchmarkCase.disastersEnabled;
  return save;
}

// The mean bytes of the batches the host publishes for each of the steps after the warmup, and the state hash the city
// ends at
export async function bytesPerStep(save: object, warmup: number, steps: number): Promise<CaseBytes> {
  let counting = false;
  let bytes = 0;
  const host = new CityHost((messages) => {
    if (counting) {
      bytes += messageBytes(messages);
    }
  }, {now: () => 0, later: () => {}});

  // Held, the host's loop never steps the city: only advance does
  host.hold();
  host.start({save: SaveFormat.serialise({name: "Benchmark", ...save})});

  const advance = (count: number) => {
    const result = host.advance(count);
    if (result.error !== null) {
      throw new Error(`The city stopped after ${result.steps} of ${count} steps: ${result.error}`);
    }
  };

  if (warmup > 0) {
    advance(warmup);
  }

  counting = true;
  for (let step = 0; step < steps; step++) {
    advance(1);
  }

  // The host's save is the simulation's beside the game's own name and version, which the state hash leaves out
  const saved = SaveFormat.parse(host.save());
  delete saved.name;
  delete saved.version;
  return {bytesPerStep: bytes / steps, hash: await hashSavedState(saved)};
}

// Every case's bytes, naming each on progress as it starts
export async function measureMessageBytes(caseList: CaseList, readFile: (path: string) => string,
                                          progress: (line: string) => void = () => {}): Promise<MeasuredBytes> {
  const {warmup, steps} = caseList;
  const cases = [];
  for (const benchmarkCase of caseList.cases) {
    progress(`Measuring the message bytes of ${benchmarkCase.name} at ${benchmarkCase.speed}`);
    const measured = await bytesPerStep(caseSave(benchmarkCase, readFile), warmup, steps);
    cases.push({name: benchmarkCase.name, speed: benchmarkCase.speed, ...measured});
  }

  return {warmup, steps, cases};
}
