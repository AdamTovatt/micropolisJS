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

import { expect, Page, test } from "@playwright/test";

import { CITY_LINK, GameServer, signIn } from "./gameServer";
import { collectPageProblems } from "./page";
import { SEED } from "./stages";

// The page online, with a city on the server (gameServer.ts): the link a started city puts in the page's address, a
// second player joining by it, a link the page can't follow, and a city the page loses.

// Starts a city on the splash screen's map, and waits until the page plays it
async function startCity(page: Page, name: string): Promise<void> {
  await page.click("#splashPlay");
  await page.locator("#nameForm").fill(name);
  await page.click("#playit");
  await expect(page.locator("#name")).toHaveText(name);
}

test.describe("a city on the server", () => {
  let server: GameServer;

  test.beforeAll(async () => {
    server = await GameServer.start("manual");
  });

  test.afterAll(async () => {
    await server?.stop();
  });

  test.afterEach(async () => {
    await server.stopForwarding();
  });

  test("puts the city it starts in the address, which another player's page joins without the splash screen",
       async ({page, browser}) => {
    const problems = collectPageProblems(page);
    await server.forward(page);
    await page.goto(`/?seed=${SEED}`);
    await signIn(page, "Ada");

    await startCity(page, "Harbour");

    await expect(page).toHaveURL(CITY_LINK);
    const graceContext = await browser.newContext();
    const grace = await graceContext.newPage();
    const graceForwarded = await server.forward(grace);
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
    await server.forward(page);
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
    const forwarded = await server.forward(page);
    await page.goto(`/?seed=${SEED}`);
    await signIn(page, "Ada");
    await startCity(page, "Doomed");

    // As the server closes every connection in a city whose work failed
    await forwarded.sockets[forwarded.sockets.length - 1].close({code: 1011, reason: "the city failed"});

    await expect(page.locator("#splash")).toBeVisible();
    expect(problems).toEqual(["Alert: This city is no longer open here: The city failed on the server, which keeps it " +
                              "as it was last saved. Its link joins it again."]);
    await expect(page).not.toHaveURL(CITY_LINK);
  });

  test("says why a city couldn't start, and shows the splash screen again on the same map", async ({page}) => {
    const problems = collectPageProblems(page);
    const forwarded = await server.forward(page);
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
    await expect(page).not.toHaveURL(CITY_LINK);
  });
});
