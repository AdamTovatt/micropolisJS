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

import type { PlayerId } from "../../src/protocol";
import { hashSavedState } from "./stateHash";

// A command log: where a city starts, every command it was sent, stamped with the step it preceded, and the state
// hashes it reached along the way. Replaying the log reproduces the city, and its checkpoints check that it does.
// docs/command-log.md specifies the format, which the game server writes a session's log in and CommandLog in the C#
// rules reads. The runner reads the log of each of its sessions from the debug window and joins them into the run's.

export const LOG_FORMAT_VERSION = 1;

// The one player a single-player command log names, such as a fixture's, as PlayerIds.Local in the C# protocol does
export const LOCAL_PLAYER: PlayerId = "local";

// The city's state hash at a step: after that many steps, and after every command stamped with that step
export interface Checkpoint {
  step: number;
  hash: string;
}

// A command as the city applied it: the player who sent it, the command, which the city validated as it applied it,
// and the step it preceded
export interface StampedCommand {
  step: number;
  player: PlayerId;
  command: unknown;
}

// Where a log's city starts: a new city on the map a game seed generates, at the given level and at medium speed, as
// a new game starts; or a saved state, as the simulation saves it
export type LogStart = {seed: number, level: number} | {save: object};

export type CommandLog = LogStart & {
  formatVersion: number;
  // What the log is for, in words. Replay ignores it.
  description?: string;
  entries: StampedCommand[];
  checkpoints: Checkpoint[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// A whole number from 0 to 2^53 - 1, past which two whole numbers can parse to the same one
function isStep(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

const START_KEYS = ["seed", "save"];

// A log read from a file, checked to be one: it throws, naming the first thing wrong. The commands themselves are not
// checked here: the city validates each one as it applies it, as it does a command from a player.
export function parseLog(value: unknown): CommandLog {
  if (!isRecord(value)) {
    throw new Error("A command log is a JSON object");
  }

  if (value.formatVersion !== LOG_FORMAT_VERSION) {
    throw new Error(`This is a version ${String(value.formatVersion)} command log: only version ` +
                    `${LOG_FORMAT_VERSION} can be replayed`);
  }

  const starts = START_KEYS.filter((key) => key in value);
  if (starts.length !== 1) {
    throw new Error("A command log starts from exactly one of seed or save");
  }

  if ("seed" in value && !(isStep(value.seed) && value.seed <= 0xffffffff && isStep(value.level) && value.level <= 2)) {
    throw new Error("A command log from a seed gives the seed, a uint32, and the level, 0 to 2");
  }

  if ("save" in value && !isRecord(value.save)) {
    throw new Error("A command log's save is an object");
  }

  if ("description" in value && typeof value.description !== "string") {
    throw new Error("A command log's description is a string");
  }

  if (!Array.isArray(value.entries)) {
    throw new Error("A command log's entries are a list");
  }

  let lastEntryStep = 0;
  value.entries.forEach((entry: unknown, i: number) => {
    if (!isRecord(entry) || !isStep(entry.step) || typeof entry.player !== "string" || !("command" in entry)) {
      throw new Error(`Entry ${i} of the command log is not a {step, player, command}`);
    }

    if (entry.step < lastEntryStep) {
      throw new Error(`Entry ${i} of the command log, at step ${entry.step}, comes before the entry above it`);
    }
    lastEntryStep = entry.step;
  });

  if (!Array.isArray(value.checkpoints)) {
    throw new Error("A command log's checkpoints are a list");
  }

  let lastCheckpointStep = -1;
  value.checkpoints.forEach((checkpoint: unknown, i: number) => {
    if (!isRecord(checkpoint) || !isStep(checkpoint.step) || typeof checkpoint.hash !== "string" ||
        !/^[0-9a-f]{64}$/.test(checkpoint.hash)) {
      throw new Error(`Checkpoint ${i} of the command log is not a {step, hash}`);
    }

    if (checkpoint.step <= lastCheckpointStep) {
      throw new Error(`Checkpoint ${i} of the command log, at step ${checkpoint.step}, is not after the one above it`);
    }
    lastCheckpointStep = checkpoint.step;
  });

  return value as CommandLog;
}

// Sessions played one after another as one log, from where the first one started. Each later session started from a
// save of the city the one before it ended on, so it carries on where that one stopped: its entries and checkpoints
// follow, their steps counted on from the step the one before ended at. The log needs no entry for the load, because
// a load is transparent: the city it loads hashes as the city that was saved. It fails when one isn't, and on a
// session that applied a command before its first step, whose state there the joined log can't check, since a
// checkpoint is taken after its step's commands.
export function joinSessions(sessions: CommandLog[]): CommandLog {
  if (sessions.length === 0) {
    throw new Error("No session to join");
  }

  const first = sessions[0];
  const entries = [...first.entries];
  const checkpoints = [...first.checkpoints];

  for (let i = 1; i < sessions.length; i++) {
    const session = sessions[i];
    const number = i + 1;
    if (!("save" in session)) {
      throw new Error(`Session ${number} starts from a seed, not from the city the session before it saved`);
    }

    // A recorded log ends with a checkpoint of the city at the step it ended at
    const ended = checkpoints[checkpoints.length - 1];
    if (ended === undefined) {
      throw new Error(`The session before session ${number} has no checkpoints`);
    }

    const loaded = hashSavedState(session.save);
    if (loaded !== ended.hash) {
      throw new Error(`Session ${number} loads a city whose state hash is ${loaded}, but the session before it ended ` +
                      `on ${ended.hash}`);
    }

    if (session.entries.some((entry) => entry.step === 0)) {
      throw new Error(`Session ${number} applies a command before its first step`);
    }

    entries.push(...session.entries.map((entry) => ({...entry, step: entry.step + ended.step})));
    // Its checkpoint at its first step is of the city as loaded: the one the session before ended on
    checkpoints.push(...session.checkpoints.filter((checkpoint) => checkpoint.step > 0)
      .map((checkpoint) => ({...checkpoint, step: checkpoint.step + ended.step})));
  }

  const {formatVersion} = first;
  const start = "seed" in first ? {seed: first.seed, level: first.level} : {save: first.save};
  return {formatVersion, ...start, entries, checkpoints};
}
