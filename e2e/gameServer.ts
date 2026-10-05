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

import { Page, test, WebSocketRoute } from "@playwright/test";
import { DatabaseSync } from "node:sqlite";
import { join } from "path";

import { SESSION_STORAGE_KEY } from "../src/browserCityEnvironment";
import { CityClient, SESSION_PATH, StoredSession } from "../src/cityClient";
import { parseSessionResponse, signInRequest } from "../src/protocol";
import {
  memorySessionStore, NodeCityEnvironment, signedInClient, START_SERVER_TIMEOUT_MS, startTestServer, TestServer,
  TestServerClock,
} from "../test/helpers/testServer";

// The game server a spec plays the page against: the server's Debug build, which test/helpers/testServer.ts starts with
// a city database of its own on a port the system picks, never one already on the machine. The page is served as in
// every spec, and its requests to the game server's API and its city's socket go to this server. Holding the socket, a
// spec can close it as the server does when a city fails, or answer what the page sends itself, as a healthy server
// never would. It needs the build `dotnet build server/Micropolis.slnx` makes, and fails naming it without one.

// The city's sockets a page has opened, latest last, and what the spec does to what the page sends on them: true for a
// message it has answered itself, which the server never sees. stop ends the forwarding before the page closes: it
// waits for the requests being forwarded, which the page may still be waiting on as a test ends, and closes the sockets
// to the server without passing their closing on to the page.
export interface Forwarded {
  sockets: WebSocketRoute[];
  intercept?: (message: Record<string, unknown>, socket: WebSocketRoute) => boolean;
  stop(): Promise<void>;
}

// The name the client watching who is online signs in under, which no spec's player has
const OBSERVER_NAME = "Observer";

// How long a player who closed their pages may stay online: their leaving saves their city to the store if they were
// its last player, which takes a moment, not seconds
const OFFLINE_TIMEOUT_MS = 10000;

// The client watching who is online, and the waits on it, each told of every change
interface Observer {
  client: CityClient;
  environment: NodeCityEnvironment;
  waiting: Set<() => void>;
}

export class GameServer {
  // Each page's forwarding in the running test, which the test stops before its pages close
  private forwarding: Forwarded[] = [];
  // A client signed in to watch who is online, once a spec has asked. It stays signed in until the server stops, so the
  // players' online lists show it from then on, the same on every run.
  private observer: Promise<Observer> | null = null;
  // The session each player name signed in to, once, for every page that plays as that player
  private readonly sessions = new Map<string, Promise<StoredSession>>();

  private constructor(private readonly server: TestServer) {}

  // Resolves once the server lists no player of the name online, which it does only once each of their connections has
  // left its city, and the last player's leaving has saved the city to the store and unloaded it. Fails, naming the
  // player, when they are still online after a while.
  async untilOffline(name: string): Promise<void> {
    const {client, waiting} = await this.observe();
    const offline = () => {
      const status = client.getStatus();
      return status.online && !status.players.some((player) => player.name === name);
    };

    await new Promise<void>((resolve, reject) => {
      const check = () => {
        if (offline()) {
          done();
          resolve();
        }
      };
      const timeout = setTimeout(() => {
        done();
        reject(new Error(`${name} was still online ${OFFLINE_TIMEOUT_MS} ms on`));
      }, OFFLINE_TIMEOUT_MS);
      const done = () => {
        clearTimeout(timeout);
        waiting.delete(check);
      };

      waiting.add(check);
      check();
    });
  }

  // The saved game the server's store keeps for the city, or null when it keeps none, as the server last wrote it
  storedCity(city: string): string | null {
    const database = new DatabaseSync(this.server.database, {readOnly: true});
    try {
      const row = database.prepare("SELECT saved_game FROM cities WHERE id = ?").get(city) as {saved_game: string} | undefined;
      return row?.saved_game ?? null;
    } finally {
      database.close();
    }
  }

  // The observer, signed in the first time it is asked for, which tells each wait on it of every change to who is online
  private observe(): Promise<Observer> {
    return this.observer ??= signedInClient(this.server.origin, memorySessionStore(), OBSERVER_NAME).then(
      ({client, environment}) => {
        const waiting = new Set<() => void>();
        client.onStatus(() => waiting.forEach((check) => check()));
        return {client, environment, waiting};
      });
  }

  // Starts the server, in a spec's beforeAll, with its cities on the clock given: the debug channel's turns alone, or
  // the server's own
  static async start(clock: TestServerClock): Promise<GameServer> {
    const testInfo = test.info();
    testInfo.setTimeout(START_SERVER_TIMEOUT_MS);
    // The suite's directory is e2e/, under the repository's root
    return new GameServer(await startTestServer(clock, join(testInfo.config.rootDir, "..")));
  }

  async stop(): Promise<void> {
    await this.stopForwarding();
    (await this.observer)?.environment.close();
    await this.server.stop();
  }

  // Stops every page's forwarding, in a spec's afterEach, so no handler outlives its page
  async stopForwarding(): Promise<void> {
    await Promise.all(this.forwarding.map((forwarded) => forwarded.stop()));
    this.forwarding = [];
  }

  // Sends the page's requests to the game server's API and its city's socket to this server, and refuses anything else
  // that leaves the page's host. A page signed in as a player opens with the player's session stored, as one signed in
  // before, so it asks for no name: the player signs in once for every page of the spec's, which keeps a spec's
  // sign-ins within the server's limit on them from one address. Without one, the page asks for a name.
  async forward(page: Page, signedInAs: string | null = null): Promise<Forwarded> {
    if (signedInAs !== null) {
      const stored = JSON.stringify(await this.session(signedInAs));
      // Only on the game's pages: a page such as about:blank, which the runner leaves a city through, has no storage
      await page.addInitScript(([key, session]) => {
        if (location.protocol === "http:") {
          localStorage.setItem(key, session);
        }
      }, [SESSION_STORAGE_KEY, stored]);
    }

    const origin = this.server.origin;
    const upstreams: WebSocket[] = [];
    const stopForwarding = async () => {
      await page.unrouteAll({behavior: "wait"});
      await Promise.all(upstreams.map((upstream) => new Promise<void>((resolve) => {
        if (upstream.readyState === WebSocket.CLOSED) {
          resolve();
          return;
        }

        upstream.onclose = () => resolve();
        upstream.close();
      })));
    };
    // Once, however often it is asked, so a test may stop a page it closes itself
    let stopped: Promise<void> | undefined;
    const forwarded: Forwarded = {sockets: [], stop: () => (stopped ??= stopForwarding())};
    this.forwarding.push(forwarded);

    await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
    await page.route((url) => url.hostname === "localhost" && url.pathname.startsWith("/api/"), async (route) => {
      const url = new URL(route.request().url());
      await route.fulfill({response: await route.fetch({url: `${origin}${url.pathname}${url.search}`})});
    });
    await page.routeWebSocket((url) => url.pathname === "/ws/city", (socket) => {
      forwarded.sockets.push(socket);
      const url = new URL(socket.url());
      const upstream = new WebSocket(`${origin.replace(/^http/, "ws")}${url.pathname}${url.search}`);
      upstreams.push(upstream);
      const unsent: string[] = [];

      upstream.onopen = () => unsent.splice(0).forEach((message) => upstream.send(message));
      upstream.onmessage = (event) => socket.send(event.data as string);
      // The upstream's close event has no caller to wait, and the page sees the socket close
      upstream.onclose = (event) => void socket.close({code: event.code, reason: event.reason});
      socket.onMessage((message) => {
        if (forwarded.intercept?.(JSON.parse(message as string) as Record<string, unknown>, socket)) {
          return;
        }

        if (upstream.readyState === WebSocket.OPEN) {
          upstream.send(message);
        } else {
          unsent.push(message as string);
        }
      });
      socket.onClose(() => upstream.close());
    });

    return forwarded;
  }

  // The player's session, signed in to once, as the page signs in
  private session(name: string): Promise<StoredSession> {
    let session = this.sessions.get(name);
    if (session === undefined) {
      session = fetch(`${this.server.origin}${SESSION_PATH}`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(signInRequest(name)),
      }).then(async (response) => {
        if (response.status !== 200) {
          throw new Error(`Signing in as ${name} answered ${response.status}: ${await response.text()}`);
        }

        const {token, name: signedIn} = parseSessionResponse(await response.json());
        return {token, name: signedIn};
      });
      this.sessions.set(name, session);
    }

    return session;
  }
}

// The game server the tests of a spec file, or of a describe block it is called in, play against: started on the clock
// given before the first test, stopped after the last, with each test's forwarding stopped as the test ends. Each file
// starts its own, which keeps the sign-ins its tests make within the server's limit on them from one address. Gives the
// server once it has started.
export function serverForTests(clock: TestServerClock): () => GameServer {
  let server: GameServer | null = null;

  test.beforeAll(async () => {
    server = await GameServer.start(clock);
  });

  test.afterAll(async () => {
    await server?.stop();
  });

  test.afterEach(async () => {
    await server?.stopForwarding();
  });

  return () => {
    if (server === null) {
      throw new Error("The game server is asked for before it has started");
    }

    return server;
  };
}

// A city's link in the page's address, as a city on the game server puts it there
export const CITY_LINK = /[?&]city=([0-9a-f]{32})(&|$)/;

// Signs in under the name, as the page asks a player with no stored session before anything else
export async function signIn(page: Page, name: string): Promise<void> {
  await page.locator("#signInName").fill(name);
  await page.click("#signInSubmit");
}
