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

import { isDeepStrictEqual } from "util";
import { Subscribers, trackingHold } from "../../src/citySource";
import type { CityDriver, CitySource, CityStart, StartedCity } from "../../src/citySource";
import type {
    AdvanceResult, Command, PlayerId, Query, QueryAnswer, SessionLog, StateMessage,
} from "../../src/protocol";
import { asJson, CallEntry, CallName, Entry, isCall, QueryEntry, readRecording, Recording } from "./recordings";

// A city source that plays back a recording of the real one (recordings.ts), so the client's tests run a city without
// one. The calls made of it must be the recording's, in its order and with its arguments: each delivers the state
// messages recorded with it, then returns what it returned, or throws what it threw. A query is answered at once with
// the answer recorded for it since the last call, as often as it is asked, since a query changes nothing. A call or a
// query the recording doesn't have fails, naming what the recording expected.

export class FakeCitySource implements CitySource {
    readonly player: PlayerId;
    readonly driver: CityDriver;

    private readonly subscribers = new Subscribers();
    private readonly entries: Entry[];
    // The index of the next entry to play
    private next = 0;
    // The queries recorded since the last call played, which the source answers until the next
    private answers: QueryEntry[] = [];

    // where names the recording and branch, for the failures
    constructor(recording: Recording, branch: string, private readonly where: string) {
        const calls = recording.branches[branch];
        if (calls === undefined) {
            throw new Error(`${where} has no such branch`);
        }

        this.player = recording.player;
        this.entries = [...recording.opening, ...calls];
        this.takeAnswers();

        this.driver = trackingHold({
            hold: async () => {
                this.play("hold", []);
            },
            release: async () => {
                this.play("release", []);
            },
            flush: async () => {
                this.play("flush", []);
            },
            advance: async (steps) => this.play("advance", [steps]) as AdvanceResult,
            cityTime: async () => this.play("cityTime", []) as number,
        });
    }

    subscribe(listener: (message: StateMessage) => void): void {
        this.subscribers.subscribe(listener);
    }

    async start(start: CityStart): Promise<StartedCity> {
        return this.play("start", [start]) as StartedCity;
    }

    send(command: Command): void {
        this.play("send", [command]);
    }

    ask(query: Query, reply: (answer: QueryAnswer) => void): void {
        const asked = asJson(query);
        const recorded = this.answers.find((entry) => isDeepStrictEqual(entry.query, asked));
        if (recorded === undefined) {
            throw new Error(`${this.where} has no answer to the query ${JSON.stringify(query)} ${this.position()}`);
        }

        reply(recorded.answer);
    }

    setViewerVisible(visible: boolean): void {
        this.play("setViewerVisible", [visible]);
    }

    async save(): Promise<string> {
        return this.play("save", []) as string;
    }

    async commandLog(): Promise<SessionLog> {
        return this.play("commandLog", []) as SessionLog;
    }

    // The calls of the recording not yet made
    unplayed(): CallEntry[] {
        return this.entries.slice(this.next).filter(isCall);
    }

    private play(call: CallName, args: unknown[]): unknown {
        const entry = this.entries[this.next];
        const made = callText(call, args);
        if (entry === undefined || !isCall(entry)) {
            throw new Error(`${this.where} has no more calls, but ${made} was made ${this.position()}`);
        }

        if (entry.call !== call || !isDeepStrictEqual(entry.arguments, asJson(args))) {
            throw new Error(`${this.where} has ${describeCall(entry)} next, but ${made} was made ${this.position()}`);
        }

        this.next++;
        // Before the messages, whose listeners may ask about the city as it is after the call
        this.takeAnswers();
        this.subscribers.deliver(entry.messages);

        if (entry.throws !== undefined) {
            throw new Error(entry.throws);
        }

        return entry.returns;
    }

    // Takes the queries recorded before the next call as those the source answers now
    private takeAnswers(): void {
        this.answers = [];
        let entry = this.entries[this.next];
        while (entry !== undefined && !isCall(entry)) {
            this.answers.push(entry);
            this.next++;
            entry = this.entries[this.next];
        }
    }

    private position(): string {
        const played = this.entries.slice(0, this.next).filter(isCall).length;
        return played === 0 ? "before any call" : `after call ${played}`;
    }
}

// A call as the failures name it
function callText(call: CallName, args: unknown[]): string {
    return `${call}(${args.map((arg) => JSON.stringify(arg)).join(", ")})`;
}

function describeCall(entry: CallEntry): string {
    return callText(entry.call, entry.arguments);
}

// The recordings each read once, by name
const recordings = new Map<string, Recording>();
// The fakes made since the last check that they were played through
let made: FakeCitySource[] = [];

// A fake source playing back the branch of the recording of the name, in test/recordings/
export function playback(name: string, branch: string): FakeCitySource {
    let recording = recordings.get(name);
    if (recording === undefined) {
        recording = readRecording(name);
        recordings.set(name, recording);
    }

    const source = new FakeCitySource(recording, branch, `The recording ${name}, branch "${branch}",`);
    made.push(source);
    return source;
}

// Fails unless every fake made since the last check made every call its branch recorded: a test that stops short of
// its branch no longer does what the recording was made for
export function expectPlayedThrough(): void {
    const sources = made;
    made = [];
    sources.forEach((source) => expect(source.unplayed().map(describeCall)).toEqual([]));
}
