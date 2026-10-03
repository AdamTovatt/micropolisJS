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

import { takeSteps } from "../src/cityTimeModel";
import { CommandLog, lastStep, LOG_FORMAT_VERSION } from "../src/commandLog";
import { CommandQueue } from "../src/commandQueue";
import { CommandResult } from "../src/protocol";
import { Random } from "../src/random";
import { plainSavedState, stateHash } from "../src/stateHash";
import { cityFromSave, cityFromSeed, Level, RunningSpeed, SaveData, Simulation, Speed } from "./city";
import { DerivedFixture, namedFixture } from "./fixtures/index";

// Starts a city from a seed, a fixture or a command log and advances it step by step, as fast as the CPU allows. A
// run never stalls silently: it fails when the simulation is paused, or doesn't advance city time as far as the step
// count implies.

export interface Start {
  // A map generated from this seed, or the named fixture: exactly one
  seed?: number;
  fixture?: string;
  // Replaces a fixture's stream with the simulation stream of this seed. A fixture's saved stream is otherwise
  // authoritative.
  reseed?: number;
  // Overrides the saved speed. A new city from a seed starts at medium, as in the browser.
  speed?: RunningSpeed;
}

export interface Summary {
  hash: string;
  year: number;
  population: number;
  funds: number;
}

export function startCity(start: Start): Simulation {
  if ((start.seed === undefined) === (start.fixture === undefined)) {
    throw new Error("A run starts from either a seed or a fixture");
  }

  if (start.seed !== undefined) {
    if (start.reseed !== undefined) {
      throw new Error("Reseeding replaces a fixture's stream: a city from a seed already has the stream of its seed");
    }

    return cityFromSeed(start.seed, Level.easy, Speed[start.speed ?? "medium"]);
  }

  // Loaded from its saved state, so a fixture always goes through the load path
  return startFromSave(fixtureSave(start.fixture!), start);
}

// A city from a saved state, with a fixture's reseed and speed options
export function startFromSave(saved: SaveData, options: {reseed?: number, speed?: RunningSpeed}): Simulation {
  const simulation = {...saved.simulation};

  if (options.reseed !== undefined) {
    simulation.seed = options.reseed;
    simulation.randomState = Random.simulationStream(options.reseed).getState();
  }

  if (options.speed !== undefined) {
    simulation.speed = Speed[options.speed];
  } else if (simulation.speed === Speed.paused) {
    throw new Error("The city is saved paused: give a speed to run it");
  }

  return cityFromSave({...saved, simulation});
}

const derivedLogs = new Map<DerivedFixture, CommandLog>();

// A fixture's command log. A derived fixture's is built on first use, from the city the fixture it derives from builds.
export function fixtureLog(name: string): CommandLog {
  const fixture = namedFixture(name);
  if (!("from" in fixture)) {
    return fixture;
  }

  let log = derivedLogs.get(fixture);
  if (log === undefined) {
    const {description, entries, checkpoints} = fixture;
    const save = fixture.save(replay(fixture.from, {to: 0, verify: false}).city);
    log = {formatVersion: LOG_FORMAT_VERSION, description, save, entries, checkpoints};
    derivedLogs.set(fixture, log);
  }

  return log;
}

// The saved state a fixture's log builds, before its first step, as plain data shared with nothing
export function fixtureSave(name: string): SaveData {
  return plainSavedState(replay(fixtureLog(name), {to: 0, verify: false}).city) as SaveData;
}

export interface Replay {
  city: Simulation;
  // What came of each entry's command, in the log's order
  results: CommandResult[];
  // Settles with the number of checkpoints, once each has been hashed and matched, or fails naming the earliest that
  // didn't match
  verified: Promise<number>;
}

// The city a log starts from: a new city from a seed starts at medium speed, as in the browser
function logStartCity(log: CommandLog): Simulation {
  if ("seed" in log) {
    return cityFromSeed(log.seed, log.level, Speed.medium);
  }

  return cityFromSave(log.save as SaveData);
}

// Replays a log as the browser played it: before each step, the commands stamped with it, in the order listed, then
// the step. A checkpoint is taken where the log has one: after its step's commands, before the step itself. The replay
// ends at step to, after that step's commands, or at the log's last step. A paused city takes commands but never
// steps, so a log that steps one is not a log the game wrote, and fails. With verify off, no hash is worked out.
export function replay(log: CommandLog, options: {to?: number, verify?: boolean} = {}): Replay {
  const to = options.to ?? lastStep(log);
  const verify = options.verify ?? true;
  const city = logStartCity(log);
  const {entries, checkpoints} = log;
  const results: CommandResult[] = [];
  const hashes: Promise<string>[] = [];
  let c = 0;

  // The log's checkpoints at a step, taken as the recorder took them: after the step's commands, before the step
  const checkpointAt = (step: number) => {
    while (c < checkpoints.length && checkpoints[c].step === step) {
      if (verify) {
        hashes.push(stateHash(city));
      }
      c++;
    }
  };

  // Driven through a command queue, as the browser drove the city, so that the order of commands, checkpoints and
  // steps is the queue's
  const queue = new CommandQueue(city, {applied: () => {}, beforeStep: checkpointAt});
  let e = 0;

  for (;;) {
    const step = queue.stepIndex;
    while (e < entries.length && entries[e].step === step) {
      queue.send(entries[e].player, entries[e].command);
      e++;
    }
    results.push(...queue.applyCommands());

    if (step >= to) {
      checkpointAt(step);
      break;
    }

    const next = Math.min(entries[e]?.step ?? Infinity, to);
    if (city.isPaused()) {
      throw new Error(`The log steps a paused city, from step ${step} to step ${next}`);
    }

    advance(city, next - step, () => queue.step());
  }

  // Hashes can finish in any order, so they are matched in the log's once all are in
  const verified = Promise.all(hashes).then((replayed) => {
    replayed.forEach((hash, i) => {
      const expected = checkpoints[i];
      if (hash !== expected.hash) {
        throw new Error(`At step ${expected.step} the replay's state hash is ${hash}, but the log's checkpoint is ` +
                        expected.hash);
      }
    });

    return replayed.length;
  });

  return {city, results, verified};
}

export async function summarise(city: Simulation): Promise<Summary> {
  return {
    hash: await stateHash(city),
    year: city.getDate().year,
    population: city.evaluation.cityPop,
    funds: city.budget.totalFunds,
  };
}

// Never steps a paused simulation, and fails rather than stalling: when city time doesn't advance as far as the step
// count implies, as cityTimeModel.ts models it. Each step is the city's own, or one a command queue takes.
export function advance(city: Simulation, steps: number, step = () => city.step()): void {
  if (city.isPaused()) {
    throw new Error("The simulation is paused: a run never steps a paused simulation");
  }

  takeSteps(city, steps, step);
}
