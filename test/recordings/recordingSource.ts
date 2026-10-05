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
import { asJson, CallEntry, Entry, RequestEntry, RequestName } from "../helpers/recordings";

// A city source that records every call made of the source it wraps (test/helpers/recordings.ts), for the recording
// script (record.ts). The state messages delivered during a call are the call's: a source answers each call after the
// state it changed. A query is recorded where it was asked, and its answer filled in as it comes. What would make a
// recording a test couldn't play back fails the recording, as the next take: a message delivered outside any call,
// which a test could never receive at the same point; a call made while another waits on its answer, whose messages
// no one could tell apart; a query answered twice, differently, between two calls; and a query never answered.
export class RecordingSource implements CitySource {
    readonly driver: CityDriver;
    // The ids of the cities the source started, in order
    readonly cities: string[] = [];

    private entries: (CallEntry | AskedQuery)[] = [];
    private problems: string[] = [];
    private calling: RequestEntry | null = null;

    constructor(private readonly recorded: CitySource) {
        recorded.subscribe((message) => {
            if (this.calling === null) {
                this.problems.push(`The source delivered state outside any call: ${JSON.stringify(message).slice(0, 500)}`);
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
            savedGame: () => this.record("savedGame", [], () => recorded.driver.savedGame()),
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
        this.cities.push(started.city);
        return started;
    }

    send(command: Command): void {
        this.entries.push({call: "send", arguments: asJson([command])});
        this.recorded.send(command);
    }

    // A query asked again before the next call, which changes nothing, is recorded once
    ask(query: Query, reply: (answer: QueryAnswer) => void): void {
        const asked = asJson(query);
        let entry = this.askedSinceLastCall().find((before) => isDeepStrictEqual(before.query, asked));
        if (entry === undefined) {
            entry = {query: asked, answer: null};
            this.entries.push(entry);
        }

        const recorded = entry;
        this.recorded.ask(query, (answer) => {
            if (recorded.answer === null) {
                recorded.answer = answer;
            } else if (!isDeepStrictEqual(recorded.answer, answer)) {
                this.problems.push(`The query ${JSON.stringify(query)} was answered twice, differently, between two calls`);
            }

            reply(answer);
        });
    }

    save(): Promise<void> {
        return this.record("save", [], () => this.recorded.save());
    }

    download(): Promise<string> {
        return this.record("download", [], () => this.recorded.download());
    }

    commandLog(): Promise<SessionLog> {
        return this.record("commandLog", [], () => this.recorded.commandLog());
    }

    // The entries recorded since the last call of this, the opening's or a branch's, or the first problem with them
    take(): Entry[] {
        const unanswered = this.entries.filter((entry) => !isCall(entry) && entry.answer === null);
        unanswered.forEach((entry) => this.problems.push(`The query ${JSON.stringify(entry)} was never answered`));
        if (this.problems.length > 0) {
            throw new Error(this.problems[0]);
        }

        const taken = this.entries as Entry[];
        this.entries = [];
        return taken;
    }

    // The queries asked since the last call
    private askedSinceLastCall(): AskedQuery[] {
        const asked: AskedQuery[] = [];
        for (let i = this.entries.length - 1; i >= 0; i--) {
            const entry = this.entries[i];
            if (isCall(entry)) {
                break;
            }

            asked.push(entry);
        }

        return asked;
    }

    private async record<T>(call: RequestName, args: unknown[], run: () => Promise<T>): Promise<T> {
        if (this.calling !== null) {
            const message = `${call} was made while ${this.calling.call} waited on its answer`;
            this.problems.push(message);
            throw new Error(message);
        }

        const entry: RequestEntry = {call, arguments: asJson(args), messages: []};
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

// A query as it is recorded, before its answer comes
interface AskedQuery {
    query: Query;
    answer: QueryAnswer | null;
}

function isCall(entry: CallEntry | AskedQuery): entry is CallEntry {
    return "call" in entry;
}
