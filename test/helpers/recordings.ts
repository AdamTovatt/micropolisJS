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

import { readFileSync } from "fs";
import { join } from "path";
import type { PlayerId, Query, QueryAnswer, StateMessage } from "../../src/protocol";
import { repositoryPath } from "./repository";

// A recording of a city source, which the fake city source plays back (fakeCitySource.ts) and the recording script
// writes (test/recordings/record.ts): every call made of the source, in order, with the state messages delivered
// during it and what it returned or threw, and every query asked between two calls, with its answer. A recording
// holds an opening, the calls each of its branches starts with, and the branches, one for each way a test goes on
// from there, each played on a city of its own.

// The calls that return at once, which nothing comes back from: no state is delivered during them
export type SignalName = "send";

// The calls a source answers once it has made them, after the state they changed
export type RequestName = "start" | "save" | "download" | "commandLog" | "hold" | "release" | "flush" | "advance"
    | "cityTime" | "savedGame";

// The calls of a city source and its driver that are recorded: every one but a query, and isHeld, which the source
// answers from its own last hold or release
export type CallName = SignalName | RequestName;

export interface SignalEntry {
    call: SignalName;
    // As JSON has them
    arguments: unknown[];
}

export interface RequestEntry {
    call: RequestName;
    // As JSON has them
    arguments: unknown[];
    messages: StateMessage[];
    // What the call returned, absent for a call that returns nothing or threw
    returns?: unknown;
    // What the call threw, in words, absent for one that returned
    throws?: string;
}

export type CallEntry = SignalEntry | RequestEntry;

export interface QueryEntry {
    query: Query;
    answer: QueryAnswer;
}

export type Entry = CallEntry | QueryEntry;

export interface Recording {
    // The player the recorded source sent commands as
    player: PlayerId;
    opening: Entry[];
    branches: Record<string, Entry[]>;
}

export function isCall(entry: Entry): entry is CallEntry {
    return "call" in entry;
}

// The value as JSON carries it, which drops the fields left undefined: a recording holds every value so
export function asJson<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

// The file the recording of the name is kept in, under the repository's root. The recording script runs as an ES
// module, which has no __dirname for repositoryPath, so it names the root.
export function recordingPath(name: string, root: string): string {
    return join(root, "test/recordings", `${name}.json`);
}

export function readRecording(name: string, root = repositoryPath(".")): Recording {
    return JSON.parse(readFileSync(recordingPath(name, root), "utf8")) as Recording;
}
