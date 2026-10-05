/* micropolisJS, continued by Adam Tovatt from Graeme McCutcheon's micropolisJS.
 * Copyright (C) 2026 Adam Tovatt
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

import type { CityClientEnvironment, ResponseLike, SocketLike, StoredSession } from "../../src/cityClient";

// A browser the city client's tests drive: requests a handler answers, sockets the test delivers to and drops, and the
// reconnects the client schedules, which the test runs

export interface Request {
    method: string;
    path: string;
    headers: Record<string, string>;
    body?: string;
}

// Answers a request: a response, or a thrown error for no server at all
export type Handler = (request: Request) => ResponseLike;

export function respond(status: number, body: unknown): ResponseLike {
    return {status, json: () => Promise.resolve(body)};
}

// The status a browser gives a connection that went without a close frame
export const ABNORMAL_CLOSE = 1006;

export class FakeSocket implements SocketLike {
    onmessage: ((event: {data: unknown}) => void) | null = null;
    onclose: ((event: {code: number}) => void) | null = null;
    // What the client sent, as the wire carried it
    readonly sent: string[] = [];

    constructor(readonly pathAndQuery: string) {}

    send(data: string): void {
        this.sent.push(data);
    }

    // What the client sent, each read back as the object it is
    sentMessages(): Record<string, unknown>[] {
        return this.sent.map((text) => JSON.parse(text) as Record<string, unknown>);
    }

    deliver(message: unknown): void {
        this.onmessage?.({data: typeof message === "string" ? message : JSON.stringify(message)});
    }

    drop(code = ABNORMAL_CLOSE): void {
        this.onclose?.({code});
    }
}

// One browser: every client given it is a tab, sharing its stored session and its lock
export class FakeBrowser implements CityClientEnvironment {
    readonly requests: Request[] = [];
    readonly sockets: FakeSocket[] = [];
    readonly scheduled: {callback: () => void; delayMs: number}[] = [];
    stored: StoredSession | null = null;
    private lockQueue: Promise<unknown> = Promise.resolve();

    constructor(public handler: Handler) {}

    store = {
        load: () => this.stored,
        save: (session: StoredSession) => { this.stored = session; },
    };

    request(path: string, init: {method: string; headers: Record<string, string>; body?: string}): Promise<ResponseLike> {
        const request = {path, ...init};
        this.requests.push(request);

        try {
            return Promise.resolve(this.handler(request));
        } catch (error) {
            return Promise.reject(error);
        }
    }

    openSocket(pathAndQuery: string): SocketLike {
        const socket = new FakeSocket(pathAndQuery);
        this.sockets.push(socket);
        return socket;
    }

    exclusively<T>(task: () => Promise<T>): Promise<T> {
        const result = this.lockQueue.then(task);
        this.lockQueue = result.catch(() => undefined);
        return result;
    }

    schedule(callback: () => void, delayMs: number): void {
        this.scheduled.push({callback, delayMs});
    }

    lastSocket(): FakeSocket {
        return this.sockets[this.sockets.length - 1];
    }

    signIns(): Request[] {
        return this.requests.filter((request) => request.method === "POST");
    }

    // Runs the scheduled reconnects due now, every tab's, and lets their requests settle
    async runScheduled(count = 1): Promise<void> {
        const due = this.scheduled.splice(0, count);

        if (due.length < count) {
            throw new Error(`${count} scheduled, ${due.length} found`);
        }

        due.forEach((entry) => entry.callback());
        await settle();
    }
}

// Every fake answers at once, so everything pending has run by the next turn of the event loop
export function settle(): Promise<void> {
    return new Promise((resolve) => setImmediate(resolve));
}
