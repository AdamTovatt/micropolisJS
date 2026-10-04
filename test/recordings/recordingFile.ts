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

import { writeFileSync } from "fs";
import { isDeepStrictEqual } from "util";
import { Entry, Recording, recordingPath } from "../helpers/recordings";

// How the recording script (record.ts) puts a scenario's recording together and writes it (test/helpers/recordings.ts)

// The value with each string that is one of the ids replaced by its name, throwing if an id is left anywhere else, such
// as inside a longer string. The recording script names the ids the server makes up, of the players and the cities, so
// a recording made again is the same file unless what the server sends changed.
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

// A scenario's recording, as its branches are recorded one after another, each with the opening it started with
export class RecordingBuilder {
    private opening: Entry[] | null = null;
    private readonly branches: Record<string, Entry[]> = {};

    constructor(private readonly scenario: string, private readonly player: string) {}

    // Fails unless the branch's opening recorded the same as every branch's before it
    add(branch: string, recorded: {opening: Entry[], branch: Entry[]}): void {
        if (this.opening !== null && !isDeepStrictEqual(recorded.opening, this.opening)) {
            throw new Error(`The opening of ${this.scenario} recorded differently for branch "${branch}"`);
        }

        this.opening = recorded.opening;
        this.branches[branch] = recorded.branch;
    }

    build(): Recording {
        return {player: this.player, opening: this.opening ?? [], branches: this.branches};
    }
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
