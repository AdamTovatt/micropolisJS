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

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { readdirSync, readFileSync, writeFileSync } from "fs";
import { cpus, loadavg, platform, release } from "os";
import { join } from "path";

import { CAR_SHARE_KEY, CAR_SHARE_STEPS } from "../src/carShare";
import { STEP_LETTERS, tripRoute } from "../src/cars";
import type { Trip } from "../src/protocol";
import { CITY_LINK, serverForTests } from "./gameServer";
import { collectPageProblems } from "./page";
import { Player, TESTER } from "./player";
import type { GameSave, Tile } from "./player";
import { isRoad, tilesWhere } from "./savedMap";

// The render benchmark, `npm run benchmark:render`: how fast the page draws the map as the cars on it grow. It plays a
// fixture's city on a game server of its own, the driver held throughout so no tile changes, and drives synthetic cars
// on the roads in view, added through the test hook, then counts over a while the turns of the page's animation loop
// and the frames of them the map's painter drew. It prints a table of both rates and the machine's load average as
// each was measured, with the machine, the build and the date beside it. Its numbers belong to the machine, so CI
// never runs it, and nothing keeps them.

// The fixture saves the city is chosen from: the run saves, of which it plays the one with the most road tiles
const RUN_SAVE = /^(.+\.run)\.json$/;

// The zooms measured, in CSS pixels a tile: the one the game opens at, and the next
const ZOOMS = [16, 32];

// The cars driven at each zoom, the first the baseline: the view with no cars
const CAR_COUNTS = [0, 60, 200, 500];

// How long the page draws before it is measured, and how long it is measured, in milliseconds
const WARM_UP_MS = 2000;
const MEASURE_MS = 10000;

// The trips laid along the roads in view: how many, the most tiles one stands on, and the seed of their random walks
const TRIPS = 4096;
const MOST_ROUTE_TILES = 64;
const ROUTE_SEED = 163;

// How long the cars of one count may take to drive to the ends of their routes, after which none should be left
const CARS_GONE_MS = (MOST_ROUTE_TILES / 4 + 10) * 1000;

const server = serverForTests("manual");

// The page's size in CSS pixels, at one device pixel to the CSS pixel
const VIEWPORT = {width: 1440, height: 900};

test.use({viewport: VIEWPORT, deviceScaleFactor: 1});

// What one count of cars measured at a zoom: the turns of the page's animation loop a second, and the frames the map's
// painter drew a second, and the machine's load average over the last minute as it ended, since on software WebGL the
// rates follow the load
interface Measured {
  zoom: number;
  cars: number;
  animated: number;
  painted: number;
  load: number;
}

// A fixture's save, by its name, and the road tiles on its map, which the city played keeps while the driver is held
interface Fixture {
  name: string;
  save: GameSave;
  roads: Tile[];
}

// The run save with the most road tiles
function fixtureWithMostRoads(): Fixture {
  const saves = join(test.info().config.rootDir, "..", "conformance", "saves");
  const fixtures = readdirSync(saves).flatMap((file) => {
    const name = RUN_SAVE.exec(file)?.[1];
    if (name === undefined) {
      return [];
    }
    const save = JSON.parse(readFileSync(join(saves, file), "utf8")) as GameSave;
    return [{name, save, roads: tilesWhere(save, isRoad)}];
  });
  return fixtures.reduce((most, fixture) => fixture.roads.length > most.roads.length ? fixture : most);
}

// A save file of the fixture's save, which holds the simulation's state alone, as the player's Load takes it: with a
// name, and the save version the fixture tool wrote it in, the current one, whose sample is the newest under
// conformance/saveVersions/, since the tool fails unless every version up to the current one has a sample. The version
// is read from the samples' names, not from the rules' numbers in conformance/ruleConstants.json, which hold none:
// adding it there would move the conformance files, which this client-side benchmark leaves as they are.
function saveFile({name, save}: Fixture): string {
  const conformance = join(test.info().config.rootDir, "..", "conformance");
  const version = Math.max(...readdirSync(join(conformance, "saveVersions"))
    .map((file) => /^version(\d+)\.json$/.exec(file)?.[1])
    .filter((number) => number !== undefined)
    .map(Number));
  const file = test.info().outputPath(`${name}.json`);
  writeFileSync(file, JSON.stringify({name: "Benchmark", version, ...save}));
  return file;
}

// The steps a trip takes, by the letter a trips message gives each, and where each takes a car, as the cars read them
const STEPS = Object.keys(STEP_LETTERS).map((letter) => {
  const [, to] = tripRoute([0, 0, letter]);
  return {letter, ...to};
});

// Trips along the road tiles given, the roads in the view where described, as a trips message brings them: random
// walks, each from a road tile with a road beside it, each step to a road tile beside the last, never back the way it
// came, as a drive never goes, until a dead end or the most tiles a route has. Seeded, so every run lays the same trips.
// Fails where no road tile has a road beside it, from which no trip could take a step.
function tripsAlong(roads: readonly Tile[], where: string): Trip[] {
  const isRoadTile = new Set(roads.map(({x, y}) => `${x},${y}`));
  const starts = roads.filter((at) => STEPS.some(({x, y}) => isRoadTile.has(`${at.x + x},${at.y + y}`)));
  if (starts.length === 0) {
    throw new Error(`No road tile in ${where} has a road beside it, so no trip can be laid there`);
  }

  let state = ROUTE_SEED;
  // A linear congruential generator's next value, from 0 to below the bound
  const next = (bound: number) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state % bound;
  };

  const trips: Trip[] = [];
  while (trips.length < TRIPS) {
    const start = starts[next(starts.length)];
    let at = start;
    let steps = "";
    let back: string | null = null;
    while (steps.length < MOST_ROUTE_TILES - 1) {
      const ways = STEPS.filter(({letter, x, y}) => letter !== back && isRoadTile.has(`${at.x + x},${at.y + y}`));
      if (ways.length === 0) {
        break;
      }
      const way = ways[next(ways.length)];
      steps += way.letter;
      back = STEPS.find(({x, y}) => x === -way.x && y === -way.y)!.letter;
      at = {x: at.x + way.x, y: at.y + way.y};
    }

    trips.push([start.x, start.y, steps]);
  }

  return trips;
}

// Keeps the cars driving at the count given: as cars reach the ends of their routes, cars on the next trips take their
// place. A count of none lets the cars driving finish their routes. Gives the cars driving once the first cars were
// added, before any could finish.
async function keepCarsAt(page: Page, trips: readonly Trip[], count: number): Promise<number> {
  return page.evaluate(({trips, count}) => {
    const page = window as unknown as {benchmarkCars?: number};
    const hook = window.micropolisTestHook!;
    window.clearInterval(page.benchmarkCars);
    if (count === 0) {
      return hook.carsDriven().length;
    }

    let next = 0;
    const topUp = () => {
      const missing = count - hook.carsDriven().length;
      const added = [];
      for (let i = 0; i < missing; i++) {
        added.push(trips[next++ % trips.length]);
      }
      hook.addCars(added);
    };
    topUp();
    page.benchmarkCars = window.setInterval(topUp, 50);
    return hook.carsDriven().length;
  }, {trips, count});
}

async function carsDriving(page: Page): Promise<number> {
  return page.evaluate(() => window.micropolisTestHook!.carsDriven().length);
}

// The page's frames a second over the measurement, after the warm-up
async function measure(page: Page): Promise<Pick<Measured, "animated" | "painted" | "load">> {
  const read = () => page.evaluate(() => ({...window.micropolisTestHook!.frameCounts(), at: performance.now()}));

  await page.waitForTimeout(WARM_UP_MS);
  const start = await read();
  await page.waitForTimeout(MEASURE_MS);
  const end = await read();
  const seconds = (end.at - start.at) / 1000;
  return {animated: (end.animated - start.animated) / seconds, painted: (end.painted - start.painted) / seconds,
          load: loadavg()[0]};
}

function table(measured: readonly Measured[], fixture: string, buildId: string): string {
  const percent = (rate: number, baseline: number) => `${Math.round(rate / baseline * 100)}%`;
  const lines = [
    `Machine: ${cpus().length} × ${cpus()[0]?.model ?? "unknown"}, ${platform()} ${release()}, load average ` +
      loadavg().map((load) => load.toFixed(2)).join(" "),
    `Build: ${buildId}`,
    `Date: ${new Date().toISOString()}`,
    `Fixture: ${fixture}, ${VIEWPORT.width}×${VIEWPORT.height}, 1 device pixel to the CSS pixel, ` +
      `${MEASURE_MS / 1000} s measured`,
    "",
    "| Zoom | Cars | Animation frames/s | Painter frames/s | Animation, of baseline | Painter, of baseline | Load |",
    "|-----:|-----:|-------------------:|-----------------:|-----------------------:|---------------------:|-----:|",
  ];

  for (const row of measured) {
    // The baseline: the page's animation frames on the same view with no cars
    const baseline = measured.find((other) => other.zoom === row.zoom && other.cars === 0)!.animated;
    lines.push(`| ${row.zoom} | ${row.cars} | ${row.animated.toFixed(1)} | ${row.painted.toFixed(1)} | ` +
               `${percent(row.animated, baseline)} | ${percent(row.painted, baseline)} | ${row.load.toFixed(1)} |`);
  }

  return lines.join("\n");
}

test("the map's frames a second, as the cars on it grow", async ({page}) => {
  const problems = collectPageProblems(page);
  const player = await Player.onServer(server(), page, TESTER);
  // Every trip becomes a car, at the Cars slider's last step, before the page reads it
  await page.addInitScript(([key, all]) => {
    if (location.protocol === "http:") {
      localStorage.setItem(key, all);
    }
  }, [CAR_SHARE_KEY, CAR_SHARE_STEPS[CAR_SHARE_STEPS.length - 1].name]);
  const fixture = fixtureWithMostRoads();
  const {roads} = fixture;
  await player.open();
  await player.loadSaveFile(saveFile(fixture));
  await expect.poll(() => problems.length > 0 || CITY_LINK.test(page.url()), "the fixture's city, started").toBe(true);
  expect(problems).toEqual([]);
  await player.waitForGame();
  await player.dismissNotification();
  const middle = (along: (tile: Tile) => number) =>
    Math.floor((Math.min(...roads.map(along)) + Math.max(...roads.map(along))) / 2);
  const centre = {x: middle((tile) => tile.x), y: middle((tile) => tile.y)};

  const measured: Measured[] = [];
  for (const zoom of ZOOMS) {
    await player.zoomWithKeys(ZOOMS.indexOf(zoom) - ZOOMS.indexOf(await player.tileWidth()));
    await player.showTiles([centre]);
    const {originX, originY, tileWidth} = await player.view();
    const canvas = await player.canvasBox();
    const inView = roads.filter(({x, y}) => x >= originX && y >= originY && x + 1 <= originX + canvas.width / tileWidth &&
                                            y + 1 <= originY + canvas.height / tileWidth);
    const trips = tripsAlong(inView, `the view at ${zoom} px a tile from tile (${originX}, ${originY})`);

    for (const cars of CAR_COUNTS) {
      const driving = await keepCarsAt(page, trips, cars);
      if (cars === 0) {
        await expect.poll(() => carsDriving(page), {message: "the cars driving, once they have finished their routes",
                                                    timeout: CARS_GONE_MS}).toBe(0);
      } else {
        // A count the page can't drive, past the cap on the cars driving at once, fails rather than measure fewer
        expect(driving, "the cars driving").toBe(cars);
      }

      measured.push({zoom, cars, ...await measure(page)});
    }

    await keepCarsAt(page, trips, 0);
  }

  console.log(`\n${table(measured, fixture.name, await player.buildId())}\n`);
});
