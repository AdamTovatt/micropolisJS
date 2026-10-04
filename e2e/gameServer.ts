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
import { join } from "path";

import { START_SERVER_TIMEOUT_MS, startTestServer, TestServer, TestServerClock } from "../test/helpers/testServer";

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

export class GameServer {
  // Each page's forwarding in the running test, which the test stops before its pages close
  private forwarding: Forwarded[] = [];

  private constructor(private readonly server: TestServer) {}

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
    await this.server.stop();
  }

  // Stops every page's forwarding, in a spec's afterEach, so no handler outlives its page
  async stopForwarding(): Promise<void> {
    await Promise.all(this.forwarding.map((forwarded) => forwarded.stop()));
    this.forwarding = [];
  }

  // Sends the page's requests to the game server's API and its city's socket to this server, and refuses anything else
  // that leaves the page's host
  async forward(page: Page): Promise<Forwarded> {
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
}

// A city's link in the page's address, as a city on the game server puts it there
export const CITY_LINK = /[?&]city=([0-9a-f]{32})(&|$)/;

// Signs in under the name, as the page asks a player with no stored session before anything else
export async function signIn(page: Page, name: string): Promise<void> {
  await page.locator("#signInName").fill(name);
  await page.click("#signInSubmit");
}
