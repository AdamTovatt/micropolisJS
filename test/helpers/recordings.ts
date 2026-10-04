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

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { PlayerId, Query, QueryAnswer, StateMessage } from "../../src/protocol";
import { repositoryPath } from "./repository";

// A recording of a city source, which the fake city source plays back (fakeCitySource.ts) and the recording script
// writes (test/recordings/record.ts): every call made of the source, in order, with the state messages delivered
// during it and what it returned or threw, and every query asked between two calls, with its answer. A recording
// holds an opening, the calls each of its branches starts with, and the branches, one for each way a test goes on
// from there, each played on a city of its own.

// The calls of a city source and its driver that are recorded: every one but a query, and isHeld, which the source
// answers from its own last hold or release
export type CallName = "start" | "send" | "setViewerVisible" | "save" | "commandLog" | "hold" | "release" | "flush" |
    "advance" | "cityTime";

export interface CallEntry {
    call: CallName;
    // As JSON has them
    arguments: unknown[];
    messages: StateMessage[];
    // What the call returned, absent for a call that returns nothing or threw
    returns?: unknown;
    // What the call threw, in words, absent for one that returned
    throws?: string;
}

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

// The value with each string that is one of the ids replaced by its name, throwing if an id is left anywhere else, such
// as inside a longer string. The recording script names the ids the server makes up, of the players and the city, so a
// recording made again is the same file unless what the server sends changed.
export function withNames<T>(value: T, names: Map<string, string>): T {
    const named = JSON.parse(JSON.stringify(value), (_, item: unknown) => {
        return typeof item === "string" ? names.get(item) ?? item : item;
    }) as T;

    const text = JSON.stringify(named);
    names.forEach((name, id) => {
        if (text.includes(id)) {
            throw new Error(`The server's id ${id} for ${name} is in the recording where it can't be named`);
        }
    });

    return named;
}

// The file the recording of the name is kept in, under the repository's root. The recording script runs as an ES
// module, which has no __dirname for repositoryPath, so it names the root.
function recordingPath(name: string, root: string): string {
    return join(root, "test/recordings", `${name}.json`);
}

export function readRecording(name: string, root = repositoryPath(".")): Recording {
    return JSON.parse(readFileSync(recordingPath(name, root), "utf8")) as Recording;
}

// Writes the recording one entry to a line, so a recording made again differs from the last by the entries that did
export function writeRecording(name: string, recording: Recording, root: string): void {
    const entries = (list: Entry[]) => list.map((entry) => JSON.stringify(entry)).join(",\n");
    const branches = Object.entries(recording.branches)
        .map(([branch, list]) => `${JSON.stringify(branch)}: [\n${entries(list)}\n]`)
        .join(",\n");

    writeFileSync(recordingPath(name, root), `{\n"player": ${JSON.stringify(recording.player)},\n` +
                                             `"opening": [\n${entries(recording.opening)}\n],\n` +
                                             `"branches": {\n${branches}\n}\n}\n`);
}
