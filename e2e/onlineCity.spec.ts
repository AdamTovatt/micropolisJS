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

import { expect, Page, test, WebSocketRoute } from "@playwright/test";
import { join } from "path";

import {
  serverTestsEnabled, START_SERVER_TIMEOUT_MS, startTestServer, TestServer,
} from "../test/helpers/testServer";
import { collectPageProblems } from "./page";
import { SEED } from "./stages";

// The page online, with a city on the server: the link a started city puts in the page's address, a second player
// joining by it, a link the page can't follow, and a city the page loses. The page is served as in every spec, and its
// requests to the game server's API and its city's socket go to a server of the spec's own (test/helpers/testServer.ts),
// never to one already on the machine. Holding the socket, the spec can close it as the server does when a city fails,
// or fail a request, as a healthy server never would.

const CITY_ID = /[?&]city=([0-9a-f]{32})(&|$)/;

// The city's sockets the page has opened, latest last, and what the spec does to what the page sends on them: true for
// a message it has answered itself, which the server never sees. stop ends the forwarding before the page closes: it
// waits for the requests being forwarded, which the page may still be waiting on as a test ends, and closes the sockets
// to the server without passing their closing on to the page.
interface Forwarded {
  sockets: WebSocketRoute[];
  intercept?: (message: Record<string, unknown>, socket: WebSocketRoute) => boolean;
  stop(): Promise<void>;
}

// Each page's forwarding in the running test, which the test stops before its pages close
let forwarding: Forwarded[] = [];

// Sends the page's requests to the game server's API and its city's socket to the test server, and refuses anything
// else that leaves the page's host
async function forwardToServer(page: Page, server: TestServer): Promise<Forwarded> {
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
  forwarding.push(forwarded);

  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && url.pathname.startsWith("/api/"), async (route) => {
    const url = new URL(route.request().url());
    await route.fulfill({response: await route.fetch({url: `${server.origin}${url.pathname}${url.search}`})});
  });
  await page.routeWebSocket((url) => url.pathname === "/ws/city", (socket) => {
    forwarded.sockets.push(socket);
    const url = new URL(socket.url());
    const upstream = new WebSocket(`${server.origin.replace(/^http/, "ws")}${url.pathname}${url.search}`);
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

// Signs in under the name, as the page asks a player with no stored session before anything else
async function signIn(page: Page, name: string): Promise<void> {
  await page.locator("#signInName").fill(name);
  await page.click("#signInSubmit");
}

// Starts a city on the splash screen's map, and waits until the page plays it
async function startCity(page: Page, name: string): Promise<void> {
  await page.click("#splashPlay");
  await page.locator("#nameForm").fill(name);
  await page.click("#playit");
  await expect(page.locator("#name")).toHaveText(name);
}

test.describe("a city on the server", () => {
  test.skip(!serverTestsEnabled(), "Runs against the server's Debug build, with MICROPOLIS_SERVER_TESTS=1");

  let server: TestServer;

  test.beforeAll(async () => {
    const testInfo = test.info();
    testInfo.setTimeout(START_SERVER_TIMEOUT_MS);
    // The suite's directory is e2e/, under the repository's root
    server = await startTestServer(join(testInfo.config.rootDir, ".."));
  });

  test.afterAll(async () => {
    await server?.stop();
  });

  test.afterEach(async () => {
    await Promise.all(forwarding.map((forwarded) => forwarded.stop()));
    forwarding = [];
  });

  test("puts the city it starts in the address, which another player's page joins without the splash screen",
       async ({page, browser}) => {
    const problems = collectPageProblems(page);
    await forwardToServer(page, server);
    await page.goto(`/?seed=${SEED}`);
    await signIn(page, "Ada");

    await startCity(page, "Harbour");

    await expect(page).toHaveURL(CITY_ID);
    const graceContext = await browser.newContext();
    const grace = await graceContext.newPage();
    const graceForwarded = await forwardToServer(grace, server);
    try {
      const graceProblems = collectPageProblems(grace);
      await grace.goto(page.url());
      await signIn(grace, "Grace");

      await expect(grace.locator("#name")).toHaveText("Harbour");
      await expect(grace.locator("#splash")).toBeHidden();
      await expect(grace.locator("#onlineList")).toContainText("Ada");
      expect(graceProblems).toEqual([]);
    } finally {
      await graceForwarded.stop();
      await graceContext.close();
    }

    expect(problems).toEqual([]);
  });

  test("says why it can't join a city the server doesn't have, and takes the link out of the address", async ({page}) => {
    const problems = collectPageProblems(page);
    await forwardToServer(page, server);
    const missing = "0123456789abcdef0123456789abcdef";

    await page.goto(`/?seed=${SEED}&city=${missing}`);
    await signIn(page, "Ada");

    await expect(page.locator("#splash")).toBeVisible();
    expect(problems).toEqual([`Alert: The city in this link can't be joined: No city has the id ${missing}`]);
    await expect(page).toHaveURL(`/?seed=${SEED}`);
  });

  test("says the city failed when the server closes the connection for it, and goes back to choosing a city",
       async ({page}) => {
    const problems = collectPageProblems(page);
    const forwarded = await forwardToServer(page, server);
    await page.goto(`/?seed=${SEED}`);
    await signIn(page, "Ada");
    await startCity(page, "Doomed");

    // As the server closes every connection in a city whose work failed
    await forwarded.sockets[forwarded.sockets.length - 1].close({code: 1011, reason: "the city failed"});

    await expect(page.locator("#splash")).toBeVisible();
    expect(problems).toEqual(["Alert: This city is no longer open here: The city failed on the server, which keeps it " +
                              "as it was last saved. Its link joins it again."]);
    await expect(page).not.toHaveURL(CITY_ID);
  });

  test("says why a city couldn't start, and shows the splash screen again on the same map", async ({page}) => {
    const problems = collectPageProblems(page);
    const forwarded = await forwardToServer(page, server);
    forwarded.intercept = (message, socket) => {
      if (message.type !== "start") {
        return false;
      }

      socket.send(JSON.stringify({type: "failed", id: message.id, error: "The server is busy"}));
      return true;
    };
    await page.goto(`/?seed=${SEED}`);
    await signIn(page, "Ada");

    await page.click("#splashPlay");
    await page.locator("#nameForm").fill("Refused");
    await page.click("#playit");

    await expect(page.locator("#splash")).toBeVisible();
    await expect(page.locator("#splashSeed")).toHaveText(String(SEED));
    expect(problems).toEqual(["Alert: The city could not start: The server is busy"]);
    await expect(page).not.toHaveURL(CITY_ID);
  });
});
