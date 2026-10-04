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

import { ChildProcess, spawn } from "child_process";
import { existsSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { CityClient } from "../../src/cityClient";
import type { CityClientEnvironment, SessionStore, SocketLike, StoredSession } from "../../src/cityClient";
import { repositoryPath } from "./repository";

// The real C# server, as the client's tests run against it: the Debug build, which answers the debug channel, with its
// cities on a clock only the debug channel moves, a city database of its own, and a port the system picks. It needs the
// build `dotnet build server/Micropolis.slnx` makes, which CI's server job has.

// The environment variable that runs the tests against the server. Only CI's server job, which has .NET, sets it; the
// tests that need the server are skipped without it. Any value but 1 is refused, so a mistyped one doesn't skip them
// while the job passes.
const SERVER_TESTS = "MICROPOLIS_SERVER_TESTS";

export function serverTestsEnabled(): boolean {
    const value = process.env[SERVER_TESTS];

    if (value !== undefined && value !== "1") {
        throw new Error(`${SERVER_TESTS} runs the tests against the server when it is 1, and is unset otherwise, not "${value}"`);
    }

    return value === "1";
}

// The server's Debug build, under the repository's root
const SERVER_BUILD = "server/Micropolis.Server/bin/Debug/net10.0/Micropolis.Server.dll";

// How long the server has to listen, within the time a suite gives its hook to start it, so the server's own output
// says why it didn't, rather than Jest's timeout
const STARTUP_TIMEOUT_MS = 30000;

// The time to give the hook that starts the server
export const START_SERVER_TIMEOUT_MS = STARTUP_TIMEOUT_MS + 10000;

// How long the server has to stop once asked before it is killed
const STOP_TIMEOUT_MS = 10000;

export interface TestServer {
    // Where the server answers, such as http://127.0.0.1:41234
    origin: string;
    stop(): Promise<void>;
}

// Starts the server and resolves once it listens. What the server writes is kept, and shown if it exits before it is
// stopped. The end-to-end suite, whose modules have no __dirname, names the repository's root.
export function startTestServer(repositoryRoot = repositoryPath(".")): Promise<TestServer> {
    const build = join(repositoryRoot, SERVER_BUILD);
    if (!existsSync(build)) {
        throw new Error(`No server build at ${build}: run dotnet build server/Micropolis.slnx first`);
    }

    // The server makes its database in this directory, and SQLite its journal beside it
    const databaseDirectory = mkdtempSync(join(tmpdir(), "micropolis-cities-"));
    // Pinned over whatever the environment holds, which may name another server's address or start its client
    const env: NodeJS.ProcessEnv = {...process.env};
    delete env.ASPNETCORE_HOSTINGSTARTUPASSEMBLIES;
    Object.assign(env, {
        ASPNETCORE_URLS: "http://127.0.0.1:0",
        ASPNETCORE_ENVIRONMENT: "Testing",
        JWT_SECRET: "test-only-signing-secret-for-the-client-contract-tests",
        TRUSTED_PROXIES: "none",
        CITY_DATABASE: join(databaseDirectory, "cities.db"),
        CITY_CLOCK: "manual",
    });

    const server: ChildProcess = spawn("dotnet", [build], {cwd: dirname(build), env, stdio: ["ignore", "pipe", "pipe"]});
    let output = "";
    let stopping = false;
    const exited = new Promise<void>((resolve) => server.once("exit", () => resolve()));
    const running = () => server.exitCode === null && server.signalCode === null;

    server.stdout?.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    server.stderr?.on("data", (chunk: Buffer) => { output += chunk.toString(); });

    const stop = async () => {
        stopping = true;
        if (running()) {
            server.kill("SIGTERM");
            const killing = setTimeout(() => server.kill("SIGKILL"), STOP_TIMEOUT_MS);
            await exited;
            clearTimeout(killing);
        }

        rmSync(databaseDirectory, {recursive: true, force: true});
    };

    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            void stop();
            reject(new Error(`The server didn't listen within ${STARTUP_TIMEOUT_MS} ms:\n${output}`));
        }, STARTUP_TIMEOUT_MS);

        const listen = () => {
            const listening = /Now listening on: (http:\/\/127\.0\.0\.1:[0-9]+)/.exec(output);
            if (listening !== null) {
                clearTimeout(timeout);
                server.stdout?.off("data", listen);
                resolve({origin: listening[1], stop});
            }
        };

        server.stdout?.on("data", listen);
        server.once("exit", (code, signal) => {
            clearTimeout(timeout);
            const exit = `The server exited with ${code ?? signal}`;
            reject(new Error(`${exit} before it listened:\n${output}`));
            if (!stopping) {
                console.error(`${exit} while the tests ran:\n${output}`);
            }
        });
    });
}

// A browser's session store, in memory. A client with one of its own signs in as a player of its own; clients that
// share one are one player, as a browser's tabs are.
export function memorySessionStore(): SessionStore {
    let stored: StoredSession | null = null;
    return {load: () => stored, save: (session) => { stored = session; }};
}

// A city client's environment in Node, against the server at the origin. drop loses its connection as a network
// going would, after which the client reconnects; close ends its sockets and timers for good.
export interface NodeCityEnvironment extends CityClientEnvironment {
    drop(): void;
    close(): void;
}

export function nodeCityEnvironment(origin: string, store: SessionStore): NodeCityEnvironment {
    const sockets: WebSocket[] = [];
    const timers: NodeJS.Timeout[] = [];
    let closed = false;

    return {
        request: (path, init) => fetch(origin + path, init),
        openSocket: (pathAndQuery) => {
            const socket = new WebSocket(origin.replace(/^http/, "ws") + pathAndQuery);
            sockets.push(socket);
            const city: SocketLike = {onmessage: null, onclose: null, send: (data) => socket.send(data)};
            socket.onmessage = (event) => city.onmessage?.({data: event.data});
            socket.onclose = ({code}) => city.onclose?.({code});
            return city;
        },
        store,
        exclusively: (task) => task(),
        schedule: (callback, delayMs) => {
            if (!closed) {
                timers.push(setTimeout(callback, delayMs));
            }
        },
        drop: () => sockets.forEach((socket) => socket.close()),
        close: () => {
            closed = true;
            timers.forEach((timer) => clearTimeout(timer));
            sockets.forEach((socket) => socket.close());
        },
    };
}

// A city client signed in to the server under the name, unless the store already holds a session, once the server has
// welcomed it. When that fails, its environment is closed, so no socket or timer outlives the test.
export async function signedInClient(origin: string, store: SessionStore, name: string):
    Promise<{client: CityClient, environment: NodeCityEnvironment}> {
    const environment = nodeCityEnvironment(origin, store);

    try {
        const client = new CityClient(environment);
        if (await client.start() === "needs-name") {
            await client.signIn(name);
        }

        if (!await client.welcomed()) {
            throw new Error("The test server didn't welcome the client");
        }

        return {client, environment};
    } catch (e) {
        environment.close();
        throw e;
    }
}
