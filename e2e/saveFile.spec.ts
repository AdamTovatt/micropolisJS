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

import { expect, Page, test } from "@playwright/test";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

import { CITY_LINK, serverForTests } from "./gameServer";
import { collectPageProblems, isContextLost } from "./page";
import { Player, TESTER } from "./player";
import { SEED, SITE } from "./stages";

// Save keeps the city in the game server's store, Download gives the player its save as a file, and Load on the splash
// screen starts a save file on the game server as a new city, so a checkpoint's save, or any city saved as a file, can
// be played again. A game the browser kept in its localStorage before cities were kept on the server is offered until
// the player starts it, downloads it or discards it.

const server = serverForTests("manual");

// The key the browser kept its saved game under, and the oldest sample save the game loads, as such a game may be
const OLD_SAVE_KEY = "micropolisJSGame";
const OLD_SAVE_NAME = "Sample";

function oldSaveText(): string {
  return readFileSync(join(test.info().config.rootDir, "..", "conformance", "saveVersions", "version5.json"), "utf8");
}

// Has the browser keep the text as its old saved game when the page first opens, as a browser that played before cities
// were kept on the server does: once only, so the page that takes it out finds it gone when it opens again
async function keepOldSave(page: Page, text: string): Promise<void> {
  await page.addInitScript(({key, text}) => {
    if (sessionStorage.getItem("oldSaveKept") === null) {
      sessionStorage.setItem("oldSaveKept", "yes");
      localStorage.setItem(key, text);
    }
  }, {key: OLD_SAVE_KEY, text});
}

function storedOldSave(page: Page): Promise<string | null> {
  return page.evaluate((key) => localStorage.getItem(key), OLD_SAVE_KEY);
}

// The id in the city's link in the page's address
function linkedCity(url: string): string {
  const link = CITY_LINK.exec(url);
  if (link === null) {
    throw new Error(`${url} has no city's link`);
  }

  return link[1];
}

test("Load starts a save file as a new city, the city it saved", async ({page}) => {
  const player = await Player.onServer(server(), page, TESTER);
  const problems = collectPageProblems(page);

  await player.startNewGame(SEED, "Saved", "Easy");
  const savedCity = linkedCity(page.url());
  // A row of the playthrough's building site, clear land on the seed's map
  const site = SITE[0];
  await player.selectTool("road");
  await player.dragTiles({x: site.left, y: site.top}, {x: site.right, y: site.top});
  await player.advance(500);
  const saved = await player.save();
  const file = test.info().outputPath("city.json");
  writeFileSync(file, JSON.stringify(saved));

  await player.open();
  await player.loadSaveFile(file);
  await player.waitForGame();

  expect(linkedCity(page.url())).not.toBe(savedCity);
  expect(await player.save()).toEqual(saved);
  await expect(page.locator("#name")).toHaveText("Saved");
  expect(await isContextLost(page, "#SplashCanvas"), "the splash preview's context, once the saved game started")
    .toBe(true);
  expect(problems).toEqual([]);
});

test("Load refuses a file that isn't a save, as often as it is chosen", async ({page}) => {
  const player = await Player.onServer(server(), page, TESTER);
  const problems = collectPageProblems(page);
  const file = test.info().outputPath("notes.json");
  writeFileSync(file, "not a save");

  await player.open();
  await player.loadSaveFile(file);
  await expect.poll(() => problems.length).toBe(1);
  await player.loadSaveFile(file);
  await expect.poll(() => problems.length).toBe(2);

  expect(problems.every((problem) => problem.startsWith("Alert: Could not start notes.json:")), problems.join("\n"))
    .toBe(true);
  await expect(page.locator("#splash")).toBeVisible();
});

test("Load refuses a file that reads as a save but won't start, and stays on the splash screen", async ({page}) => {
  const player = await Player.onServer(server(), page, TESTER);
  const problems = collectPageProblems(page);

  await player.startNewGame(SEED, "Saved", "Easy");
  const mapless: Record<string, unknown> = {...await player.save()};
  delete mapless.map;
  const file = test.info().outputPath("mapless.json");
  writeFileSync(file, JSON.stringify(mapless));

  await player.open();
  await player.loadSaveFile(file);
  await expect.poll(() => problems.length).toBe(1);

  expect(problems[0]).toMatch(/^Alert: Could not start mapless.json:/);
  await expect(page.locator("#splash")).toBeVisible();
});

test("Load says why it can't read a file, and a file chosen after it starts", async ({page}) => {
  const player = await Player.onServer(server(), page, TESTER);
  const problems = collectPageProblems(page);

  await player.startNewGame(SEED, "Saved", "Easy");
  const saved = await player.save();
  const file = test.info().outputPath("city.json");
  writeFileSync(file, JSON.stringify(saved));

  // A browser can't be made to fail a real file's read, so the first file's read fails here as one would
  await page.addInitScript(() => {
    const read = Blob.prototype.text;
    let failed = false;
    Blob.prototype.text = function() {
      if (failed || !(this instanceof File)) {
        return read.call(this);
      }

      failed = true;
      return Promise.reject(new DOMException("The file could not be read.", "NotReadableError"));
    };
  });

  await player.open();
  await player.loadSaveFile(file);
  await expect.poll(() => problems).toEqual(["Alert: Could not read city.json: The file could not be read."]);
  await expect(page.locator("#splash")).toBeVisible();

  await player.loadSaveFile(file);
  await player.waitForGame();

  expect(await player.save()).toEqual(saved);
  expect(problems).toHaveLength(1);
});

test("Load ignores a save file that finishes reading after the player started a new city", async ({page}) => {
  const player = await Player.onServer(server(), page, TESTER);
  const problems = collectPageProblems(page);

  await player.startNewGame(SEED, "Saved", "Easy");
  const file = test.info().outputPath("city.json");
  writeFileSync(file, JSON.stringify(await player.save()));

  // A file's text is read only once the test lets it, and then the page's own handler runs before the test goes on
  await page.addInitScript(() => {
    const read = Blob.prototype.text;
    let release = () => {};
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    const page = window as unknown as {finishFileRead: () => Promise<unknown>};
    let pending: Promise<string> = Promise.resolve("");

    Blob.prototype.text = function() {
      pending = released.then(() => read.call(this));
      return pending;
    };
    page.finishFileRead = () => {
      release();
      return pending.then(() => new Promise((resolve) => setTimeout(resolve, 0)));
    };
  });

  await player.open();
  await player.loadSaveFile(file);
  await page.click("#splashPlay");
  await page.fill("#nameForm", "Started");
  await page.click("#playit");
  await player.waitForGame();
  await page.evaluate(() => (window as unknown as {finishFileRead: () => Promise<unknown>}).finishFileRead());

  await expect(page.locator("#name")).toHaveText("Started");
  expect((await player.save()).name).toBe("Started");
  expect(problems).toEqual([]);
});

// The page joins a city by its link without the splash screen, and Save and Download work there as in a city it
// started: the city a session joins by its link is the one a player shares or comes back to
test("Save and Download work in a city joined by its link, and the download loads as the city it saved",
     async ({page}) => {
  const player = await Player.onServer(server(), page, TESTER);
  const problems = collectPageProblems(page);
  await player.startNewGame(SEED, "Kept/Town", "Easy");
  const site = SITE[0];
  await player.selectTool("road");
  await player.dragTiles({x: site.left, y: site.top}, {x: site.right, y: site.top});
  await player.advance(500);

  await player.reloadCity();
  await expect(page.locator("#splash")).toBeHidden();
  await player.advance(100);
  const saved = await player.save();
  const file = await player.downloadGame();
  await player.saveGame();

  expect(file.name).toBe("Kept_Town.json");
  expect(JSON.parse(file.text)).toEqual(saved);
  expect(player.storedSave()).toEqual(saved);

  const path = test.info().outputPath(file.name);
  writeFileSync(path, file.text);
  await player.open();
  await player.loadSaveFile(path);
  await player.waitForGame();
  expect(await player.save()).toEqual(saved);
  expect(problems).toEqual([]);
});

test("Download clicked again while its file is on its way gives one file", async ({page}) => {
  const player = await Player.onServer(server(), page, TESTER);
  const problems = collectPageProblems(page);
  await player.startNewGame(SEED, "Twice", "Easy");
  const files: string[] = [];
  page.on("download", (download) => files.push(download.suggestedFilename()));

  await page.dblclick("#downloadRequest");
  await expect.poll(() => files.length).toBe(1);
  // The server answers a connection's requests in order, so a second download the page asked for would come first
  await player.save();

  expect(files).toEqual(["Twice.json"]);
  expect(problems).toEqual([]);
});

test.describe("a game the browser kept before cities were kept on the server", () => {

  test("is offered, starts as a new city, and is kept no more", async ({page}) => {
    const player = await Player.onServer(server(), page, TESTER);
    const problems = collectPageProblems(page);
    await keepOldSave(page, oldSaveText());

    await player.open(`seed=${SEED}`);
    await expect(page.locator("#splashOldSave")).toBeVisible();
    await page.click("#splashOldSaveStart");
    await player.waitForGame();

    await expect(page.locator("#name")).toHaveText(OLD_SAVE_NAME);
    expect(await storedOldSave(page)).toBeNull();
    await player.open(`seed=${SEED}`);
    await expect(page.locator("#splash")).toBeVisible();
    await expect(page.locator("#splashOldSave")).toBeHidden();
    expect(problems).toEqual([]);
  });

  test("is given as a file, and kept no more", async ({page}) => {
    const player = await Player.onServer(server(), page, TESTER);
    const problems = collectPageProblems(page);
    const text = oldSaveText();
    await keepOldSave(page, text);

    await player.open(`seed=${SEED}`);
    const file = await player.downloadFrom("#splashOldSaveDownload");

    expect(file).toEqual({name: "micropolis-saved-city.json", text});
    await expect(page.locator("#splashOldSave")).toBeHidden();
    await expect(page.locator("#splash")).toBeVisible();
    expect(await storedOldSave(page)).toBeNull();
    expect(problems).toEqual([]);
  });

  test("is discarded, and kept no more", async ({page}) => {
    const player = await Player.onServer(server(), page, TESTER);
    const problems = collectPageProblems(page);
    await keepOldSave(page, oldSaveText());

    await player.open(`seed=${SEED}`);
    await page.click("#splashOldSaveDiscard");

    await expect(page.locator("#splashOldSave")).toBeHidden();
    expect(await storedOldSave(page)).toBeNull();
    expect(problems).toEqual([]);
  });

  test("that won't start is said out loud, and still offered", async ({page}) => {
    const player = await Player.onServer(server(), page, TESTER);
    const problems = collectPageProblems(page);
    await keepOldSave(page, "not a save");

    await player.open(`seed=${SEED}`);
    await page.click("#splashOldSaveStart");
    await expect.poll(() => problems.length).toBe(1);

    expect(problems[0]).toMatch(/^Alert: The city saved in this browser could not start:/);
    await expect(page.locator("#splashOldSave")).toBeVisible();
    expect(await storedOldSave(page)).toBe("not a save");
  });

  test("refused while another city starts is still kept", async ({page}) => {
    const forwarded = await server().forward(page, TESTER);
    const problems = collectPageProblems(page);
    await keepOldSave(page, oldSaveText());
    await page.goto(`/?seed=${SEED}`);
    // An upload the server never answers, so the old save is still starting when the player starts it again
    forwarded.intercept = (message) => message.type === "upload";

    await page.click("#splashOldSaveStart");
    await page.click("#splashOldSaveStart");

    await expect.poll(() => problems).toEqual(["Alert: Another city is starting: wait for it, then choose again."]);
    expect(await storedOldSave(page)).not.toBeNull();
  });

  test("dealt with in another tab is said out loud there, and offered there no more", async ({page, context}) => {
    await server().forward(page, TESTER);
    await keepOldSave(page, oldSaveText());
    await page.goto(`/?seed=${SEED}`);
    const other = await context.newPage();
    await server().forward(other, TESTER);
    const problems = collectPageProblems(other);
    await other.goto(`/?seed=${SEED}`);
    await expect(other.locator("#splashOldSave")).toBeVisible();

    await page.click("#splashOldSaveDiscard");
    await other.click("#splashOldSaveStart");

    await expect.poll(() => problems)
      .toEqual(["Alert: The city saved in this browser was already started, downloaded or discarded in another tab."]);
    await expect(other.locator("#splashOldSave")).toBeHidden();
    await expect(other.locator("#splash")).toBeVisible();
  });

  test("isn't offered by a browser that kept none", async ({page}) => {
    const player = await Player.onServer(server(), page, TESTER);

    await player.open(`seed=${SEED}`);

    await expect(page.locator("#splash")).toBeVisible();
    await expect(page.locator("#splashOldSave")).toBeHidden();
  });
});

test("Load is offered outside debug mode", async ({page}) => {
  await server().forward(page, TESTER);

  await page.goto("/");

  await expect(page.locator("#splashLoad")).toBeVisible();
  await expect(page.locator("#splashLoad")).toBeEnabled();
});

// Last, since it uses up the saves and downloads the server allows from here, and the tests share an address
test("Download past the saves and downloads allowed from here is said out loud", async ({page}) => {
  const player = await Player.onServer(server(), page, TESTER);
  const problems = collectPageProblems(page);
  await player.startNewGame(SEED, "Often", "Easy");
  let files = 0;
  page.on("download", () => files++);

  // More than the server allows at once, each click waiting for its file or its failure
  for (let clicks = 1; clicks <= 20 && problems.length === 0; clicks++) {
    await page.click("#downloadRequest");
    await expect.poll(() => files + problems.length).toBe(clicks);
  }

  expect(problems)
    .toEqual(["Alert: The city couldn't be downloaded: Too many saves and downloads were made from here. Try again in a few seconds."]);
  expect(files).toBeGreaterThan(0);
});
