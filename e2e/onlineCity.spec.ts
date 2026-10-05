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

import { CITY_LINK, serverForTests, signIn } from "./gameServer";
import { collectPageProblems } from "./page";
import { SEED } from "./stages";

// The page online, with a city on the server (gameServer.ts): the link a started city puts in the page's address, a
// second player joining by it, the invite link the Online panel copies, a link the page can't follow, and a city the
// page loses.

// Starts a city on the splash screen's map, and waits until the page plays it
async function startCity(page: Page, name: string): Promise<void> {
  await page.click("#splashPlay");
  await page.locator("#nameForm").fill(name);
  await page.click("#playit");
  await expect(page.locator("#name")).toHaveText(name);
}

// The invite link of the city in the page's address: the page's origin and path, and the city's id alone
function invite(url: string): string {
  const page = new URL(url);
  const city = CITY_LINK.exec(url);
  if (city === null) {
    throw new Error(`${url} has no city's link`);
  }

  return `${page.origin}${page.pathname}?city=${city[1]}`;
}

test.describe("a city on the server", () => {
  const server = serverForTests("manual");

  test("puts the city it starts in the address, which another player's page joins without the splash screen",
       async ({page, browser}) => {
    const problems = collectPageProblems(page);
    await server().forward(page);
    await page.goto(`/?seed=${SEED}`);
    await signIn(page, "Ada");

    await startCity(page, "Harbour");

    await expect(page).toHaveURL(CITY_LINK);
    const graceContext = await browser.newContext();
    const grace = await graceContext.newPage();
    const graceForwarded = await server().forward(grace);
    try {
      const graceProblems = collectPageProblems(grace);
      await grace.goto(page.url());
      await signIn(grace, "Grace");

      await expect(grace.locator("#name")).toHaveText("Harbour");
      await expect(grace.locator("#splash")).toBeHidden();
      await expect(grace.locator("#onlineList")).toContainText("Ada");
      // A player who joined by the link can pass it on, as the one who started the city can
      await expect(grace.locator("#inviteCopy")).toBeVisible();

      // A city joined by its link goes on the list of cities the browser played, as one started does
      await grace.goto(`/?seed=${SEED}`);
      await expect(grace.locator("#splashCityList .splashRejoin")).toContainText("Harbour");
      expect(graceProblems).toEqual([]);
    } finally {
      await graceForwarded.stop();
      await graceContext.close();
    }

    expect(problems).toEqual([]);
  });

  test("lists the cities this browser played on the splash screen, to join again or forget", async ({page}) => {
    const problems = collectPageProblems(page);
    await server().forward(page, "Ada");
    await page.goto(`/?seed=${SEED}`);
    await expect(page.locator("#splashCities")).toBeHidden();
    await startCity(page, "Harbour");
    const harbour = page.url();

    await page.goto(`/?seed=${SEED}`);
    const rejoin = page.locator("#splashCityList .splashRejoin");
    await expect(rejoin).toHaveCount(1);
    await expect(rejoin).toContainText("Harbour");
    await rejoin.click();
    await expect(page.locator("#name")).toHaveText("Harbour");
    await expect(page).toHaveURL(harbour);

    await page.goto(`/?seed=${SEED}`);
    await page.click("#splashCityList .splashForget");
    await expect(page.locator("#splashCities")).toBeHidden();
    await page.reload();
    await expect(page.locator("#splash")).toBeVisible();
    await expect(page.locator("#splashCities")).toBeHidden();
    expect(problems).toEqual([]);
  });

  // The game's parts are hidden until it starts, which a layout a rule with an id gives one could undo
  test("shows none of the game's parts on the splash screen", async ({page}) => {
    const problems = collectPageProblems(page);
    await server().forward(page, "Ada");
    await page.goto(`/?seed=${SEED}`);
    await expect(page.locator("#splash")).toBeVisible();

    const parts = await page.locator(".initialHidden").all();
    expect(parts.length, "the game's parts").toBeGreaterThan(0);
    for (const part of parts) {
      await expect(part, `#${await part.getAttribute("id")} on the splash screen`).toBeHidden();
    }
    expect(problems).toEqual([]);
  });

  test("says why it can't join a city the server doesn't have, and takes the link out of the address", async ({page}) => {
    const problems = collectPageProblems(page);
    await server().forward(page, "Ada");
    const missing = "0123456789abcdef0123456789abcdef";

    await page.goto(`/?seed=${SEED}&city=${missing}`);

    await expect(page.locator("#splash")).toBeVisible();
    expect(problems).toEqual([`Alert: The city in this link can't be joined: No city has the id ${missing}`]);
    await expect(page).toHaveURL(`/?seed=${SEED}`);
  });

  test("says the city failed when the server closes the connection for it, and goes back to choosing a city",
       async ({page}) => {
    const problems = collectPageProblems(page);
    const forwarded = await server().forward(page, "Ada");
    await page.goto(`/?seed=${SEED}`);
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
    const forwarded = await server().forward(page, "Ada");
    forwarded.intercept = (message, socket) => {
      if (message.type !== "start") {
        return false;
      }

      socket.send(JSON.stringify({type: "failed", id: message.id, error: "The server is busy"}));
      return true;
    };
    await page.goto(`/?seed=${SEED}`);

    await page.click("#splashPlay");
    await page.locator("#nameForm").fill("Refused");
    await page.click("#playit");

    await expect(page.locator("#splash")).toBeVisible();
    await expect(page.locator("#splashSeed")).toHaveText(String(SEED));
    expect(problems).toEqual(["Alert: The city could not start: The server is busy"]);
    await expect(page).not.toHaveURL(CITY_LINK);
  });

  test("says why a city on the list can't be joined, and keeps it listed on the splash screen", async ({page}) => {
    const problems = collectPageProblems(page);
    const forwarded = await server().forward(page, "Ada");
    await page.goto(`/?seed=${SEED}`);
    await startCity(page, "Harbour");
    await page.goto(`/?seed=${SEED}`);
    // As the server answers a join it refuses
    forwarded.intercept = (message, socket) => {
      if (message.type !== "join") {
        return false;
      }

      socket.send(JSON.stringify({type: "failed", id: message.id, error: "The city couldn't be loaded"}));
      return true;
    };

    await page.click("#splashCityList .splashRejoin");

    await expect.poll(() => problems).toEqual(["Alert: Harbour can't be joined: The city couldn't be loaded"]);
    await expect(page.locator("#splash")).toBeVisible();
    await expect(page.locator("#splashCityList .splashRejoin")).toContainText("Harbour");
    await expect(page).not.toHaveURL(CITY_LINK);
  });

  test("copies the city's invite link, its id alone, from the Online panel", async ({page}) => {
    const problems = collectPageProblems(page);
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await server().forward(page, "Ada");
    // In debug mode and on a seed, neither of which the invite link passes on
    await page.goto(`/?debug=1&seed=${SEED}`);
    const copy = page.locator("#inviteCopy");
    await expect(copy).toBeHidden();

    await startCity(page, "Harbour");
    await copy.click();

    await expect(copy).toHaveText("Copied");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(invite(page.url()));
    await expect(page.locator("#inviteLink")).toBeHidden();
    await expect(copy).toHaveText("Copy invite link");
    expect(problems).toEqual([]);
  });

  // Where the clipboard is refused: a permission the player denied, and an insecure origin, where there's none
  const refusals: {name: string, refuse: () => void}[] = [
    {name: "denies writing to it", refuse: () => {
      navigator.clipboard.writeText = () =>
        Promise.reject(new DOMException("Write permission denied.", "NotAllowedError"));
    }},
    {name: "has none", refuse: () => {
      Object.defineProperty(Navigator.prototype, "clipboard", {get: () => undefined, configurable: true});
    }},
  ];

  for (const {name, refuse} of refusals) {
    test(`shows the invite link in a field, selected, where the page ${name}`, async ({page}) => {
      const problems = collectPageProblems(page);
      await page.addInitScript(refuse);
      await server().forward(page, "Ada");
      await page.goto(`/?seed=${SEED}`);
      await startCity(page, "Harbour");

      await page.click("#inviteCopy");

      const field = page.locator("#inviteLink");
      await expect(field).toBeVisible();
      await expect(field).toHaveValue(invite(page.url()));
      await expect(field).toBeFocused();
      expect(await field.evaluate((input: HTMLInputElement) => [input.selectionStart, input.selectionEnd]))
        .toEqual([0, invite(page.url()).length]);
      await expect(page.locator("#inviteCopy")).toHaveText("Copy invite link");

      await field.blur();
      await expect(field).toBeHidden();
      expect(problems).toEqual([]);
    });
  }

  test("tells the player choosing a city while another is starting to wait for it", async ({page}) => {
    const problems = collectPageProblems(page);
    const forwarded = await server().forward(page, "Ada");
    await page.goto(`/?seed=${SEED}`);
    await startCity(page, "Harbour");
    await page.goto(`/?seed=${SEED}`);
    // A join the server never answers, so the city is still starting while the player chooses again
    forwarded.intercept = (message) => message.type === "join";
    const stillStarting = "Alert: Another city is starting: wait for it, then choose again.";

    await page.click("#splashCityList .splashRejoin");
    await page.click("#splashCityList .splashRejoin");
    await expect.poll(() => problems).toEqual([stillStarting]);
    await page.click("#splashPlay");

    await expect.poll(() => problems).toEqual([stillStarting, stillStarting]);
    await expect(page.locator("#splash")).toBeVisible();
    await expect(page.locator("#start")).toBeHidden();
  });
});
