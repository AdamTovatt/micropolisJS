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
import type { CityDriver, CitySource, CityStart, StartedCity } from "../../src/citySource";
import { trackingHold } from "../../src/citySource";
import { errorMessage } from "../../src/errorMessage";
import type { Command, Query, QueryAnswer, SessionLog, StateMessage } from "../../src/protocol";
import { asJson, CallEntry, CallName, Entry, isCall, QueryEntry, Recording } from "../helpers/recordings";

// How the recording script (record.ts) records a city source, apart from the server it records

// A city source that records every call made of the source it wraps (recordings.ts). The state messages delivered
// during a call are the call's: a source answers each call after the state it changed. A message delivered outside any
// call fails the recording, since a test could never receive it at the same point.
export class RecordingSource implements CitySource {
    readonly driver: CityDriver;
    // The id of the city the source last started, or null before it started one
    city: string | null = null;

    private entries: Entry[] = [];
    // Messages delivered outside any call
    private readonly strays: StateMessage[] = [];
    private calling: CallEntry | null = null;

    constructor(private readonly recorded: CitySource) {
        recorded.subscribe((message) => {
            if (this.calling === null) {
                this.strays.push(message);
            } else {
                this.calling.messages.push(message);
            }
        });

        this.driver = trackingHold({
            hold: () => this.record("hold", [], () => recorded.driver.hold()),
            release: () => this.record("release", [], () => recorded.driver.release()),
            flush: () => this.record("flush", [], () => recorded.driver.flush()),
            advance: (steps) => this.record("advance", [steps], () => recorded.driver.advance(steps)),
            cityTime: () => this.record("cityTime", [], () => recorded.driver.cityTime()),
        });
    }

    get player(): string {
        return this.recorded.player;
    }

    subscribe(listener: (message: StateMessage) => void): void {
        this.recorded.subscribe(listener);
    }

    async start(start: CityStart): Promise<StartedCity> {
        const started = await this.record("start", [start], () => this.recorded.start(start));
        this.city = started.city;
        return started;
    }

    send(command: Command): void {
        this.entries.push({call: "send", arguments: asJson([command]), messages: []});
        this.recorded.send(command);
    }

    // A query asked again before the next call, which changes nothing, is recorded once
    ask(query: Query, reply: (answer: QueryAnswer) => void): void {
        this.recorded.ask(query, (answer) => {
            const asked = asJson(query);
            let before: QueryEntry | undefined;
            for (let i = this.entries.length - 1; i >= 0; i--) {
                const entry = this.entries[i];
                if (isCall(entry)) {
                    break;
                }

                if (isDeepStrictEqual(entry.query, asked)) {
                    before = entry;
                }
            }

            if (before === undefined) {
                this.entries.push({query: asked, answer});
            } else if (!isDeepStrictEqual(before.answer, answer)) {
                throw new Error(`The query ${JSON.stringify(query)} was answered twice, differently, between two calls`);
            }

            reply(answer);
        });
    }

    setViewerVisible(visible: boolean): void {
        this.entries.push({call: "setViewerVisible", arguments: [visible], messages: []});
        this.recorded.setViewerVisible(visible);
    }

    save(): Promise<string> {
        return this.record("save", [], () => this.recorded.save());
    }

    commandLog(): Promise<SessionLog> {
        return this.record("commandLog", [], () => this.recorded.commandLog());
    }

    // The entries recorded since the last call of this, the opening's or a branch's
    take(): Entry[] {
        if (this.strays.length > 0) {
            throw new Error(`The source delivered state outside any call: ${JSON.stringify(this.strays).slice(0, 500)}`);
        }

        const taken = this.entries;
        this.entries = [];
        return taken;
    }

    private async record<T>(call: CallName, args: unknown[], run: () => Promise<T>): Promise<T> {
        const entry: CallEntry = {call, arguments: asJson(args), messages: []};
        this.entries.push(entry);
        this.calling = entry;
        try {
            const value = await run();
            if (value !== undefined) {
                entry.returns = value;
            }

            return value;
        } catch (e) {
            entry.throws = errorMessage(e);
            throw e;
        } finally {
            this.calling = null;
        }
    }
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
