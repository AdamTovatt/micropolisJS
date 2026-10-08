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

import { readFileSync } from "fs";

import { CAR_SHARE_STEPS } from "../src/carShare";
import type { CarShareStep } from "../src/carShare";
import {
    CAR_PIXELS, Cars, LANE_OFFSET, MAX_CARS, TRACK_OFFSET, VIEW_MARGIN, carCap, carColour, carPlace, distanceFrom,
    nearView, trainPlace,
} from "../src/cars";
import type { CarPlace, PaintableCar } from "../src/cars";
import { CAR_BREADTH, CAR_LENGTH } from "../src/mapFrame";
import { SPRITE_PIXELS_PER_TILE } from "../src/paintable";
import type { Ride, TilePosition, Trip, TripsMessage } from "../src/protocol";
import { CAR_CROSSING_MS, CAR_TILES_PER_SECOND } from "../src/roadTraffic";
import { sameTile, tripRoute } from "../src/routeTiles";
import {
    CARRIAGE_SPACING, DEPARTURE_INTERVAL, MOST_CARRIAGES, RIDES_PER_CARRIAGE, STEPS_PER_SECOND, TRAIN_TILES_PER_SECOND,
    Trains, tilesOf,
} from "../src/trains";
import type { TileRect } from "../src/viewPosition";
import { repositoryPath } from "./helpers/repository";
import { RULES } from "./helpers/ruleConstants";

// The milliseconds a car takes to drive one tile, and a train to run one
const TILE_MS = 1000 / CAR_TILES_PER_SECOND;
const RAIL_TILE_MS = 1000 / TRAIN_TILES_PER_SECOND;

// A route east along row 5, from (10, 5) to (12, 5), and the trip that drives it
const EAST: TilePosition[] = [{x: 10, y: 5}, {x: 11, y: 5}, {x: 12, y: 5}];
const EAST_TRIP: Trip = [10, 5, "EE"];

// A level crossing, where the tests' trains along row 5 cross column 12
const CROSSING: TilePosition = {x: 12, y: 5};

// How wide a carriage of a train is drawn, in tiles: about as wide as the right-hand track it runs on
const CARRIAGE_BREADTH = 2 * TRACK_OFFSET;

// The rectangle a car is painted in, in tiles: a car on the road CAR_LENGTH of a tile long the way it faces and
// CAR_BREADTH across, a carriage of a train CARRIAGE_SPACING long and CARRIAGE_BREADTH across, about the middle of its
// square
function body({kind, x, y, width, direction}: PaintableCar): {left: number, top: number, right: number, bottom: number} {
    const [length, breadth] = kind === "road" ? [CAR_LENGTH, CAR_BREADTH] : [CARRIAGE_SPACING, CARRIAGE_BREADTH];
    const across = direction === "east" || direction === "west";
    const middle = {x: (x + width / 2) / SPRITE_PIXELS_PER_TILE, y: (y + width / 2) / SPRITE_PIXELS_PER_TILE};
    const halfX = (across ? length : breadth) / 2;
    const halfY = (across ? breadth : length) / 2;
    return {left: middle.x - halfX, top: middle.y - halfY, right: middle.x + halfX, bottom: middle.y + halfY};
}

// Whether two rectangles overlap
function overlap(a: ReturnType<typeof body>, b: ReturnType<typeof body>): boolean {
    return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

// The client's clock as the tests start, and the milliseconds of an animation frame
const NOW = 1_000_000;
const FRAME = 16;

// A place's numbers rounded, so sums of fractions compare
function rounded({x, y, direction}: CarPlace): CarPlace {
    return {x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000, direction};
}

// Distances rounded, so sums of frames compare
function near(distances: number[]): number[] {
    return distances.map((distance) => Math.round(distance * 1000) / 1000);
}

// The Cars slider's steps, by name
const [OFF, TENTH, QUARTER, HALF, ALL] = CAR_SHARE_STEPS;

// A view that shows every tile, so every car is near it and none takes another's place
const EVERY_TILE: TileRect = {left: -Infinity, top: -Infinity, right: Infinity, bottom: Infinity};

// The cars, and the client's clock they were last moved to, which runs on an animation frame at a time, on a map whose
// level crossings are the tiles given, the main map's view showing the tiles view has
class Drive {
    now = NOW;
    view = EVERY_TILE;
    readonly cars: Cars;

    constructor(share: () => CarShareStep, crossings: readonly TilePosition[] = []) {
        this.cars = new Cars(share, (tile) => crossings.some((crossing) => sameTile(crossing, tile)), () => this.view);
        this.cars.advance(NOW, false);
    }

    // Runs the client's clock on by the milliseconds given, a frame at a time, the city paused or not, checking each
    // frame with check
    run(milliseconds: number, paused = false, check: () => void = () => undefined): this {
        const end = this.now + milliseconds;
        while (this.now < end) {
            this.now = Math.min(end, this.now + FRAME);
            this.cars.advance(this.now, paused);
            check();
        }
        return this;
    }

    // Runs the client's clock on to the milliseconds given after the tests' start
    runTo(milliseconds: number): this {
        return this.run(NOW + milliseconds - this.now);
    }

    // An animation frame with the client's clock where it stands, as the end-to-end suite fixes it: the cars that
    // arrived since appear where they can, and nothing drives
    frame(): this {
        this.cars.advance(this.now, false);
        return this;
    }

    // The trips given arrive, and the next frame comes
    add(...trips: Trip[]): this {
        this.cars.add(trips);
        return this.frame();
    }
}

// The cars at the step given as each trips message arrives, the trips given arrived, and a frame come since
function carsAt(share: () => CarShareStep, trips: Trip[] = []): Drive {
    return new Drive(share).add(...trips);
}

// The cars, taking every trip, the trips given arrived, and a frame come since
function carsOn(...trips: Trip[]): Drive {
    return carsAt(() => ALL, trips);
}

// The rows of the trips the cars showing drive, in the order they arrived, as shortTrip numbers them
function rows({cars}: Drive): number[] {
    return cars.paintable().map((car) => Math.floor((car.y + CAR_PIXELS / 2) / SPRITE_PIXELS_PER_TILE));
}

// The trips shortTrip numbers from the first row given, as many as given
function shortTrips(first: number, count: number): Trip[] {
    return Array.from({length: count}, (_, i) => shortTrip(first + i));
}

// A trip one step east, from the start of the row given
function shortTrip(y: number): Trip {
    return [0, y, "E"];
}

it("take the rules' steps a second and the steps between departures", () => {
    expect([STEPS_PER_SECOND, DEPARTURE_INTERVAL]).toEqual([RULES.stepsPerSecond, RULES.departureInterval]);
});

describe("a trip's route", () => {
    it("starts at the trip's tile and takes a tile each step, N up the map", () => {
        expect(tripRoute([5, 5, "NESW"])).toEqual([{x: 5, y: 5}, {x: 5, y: 4}, {x: 6, y: 4}, {x: 6, y: 5}, {x: 5, y: 5}]);
    });

    it("is the trip's tile alone for a trip of no steps", () => {
        expect(tripRoute([7, 3, ""])).toEqual([{x: 7, y: 3}]);
    });

    it("refuses a step that is no way", () => {
        expect(() => tripRoute([0, 0, "NX"])).toThrow(`A trip's step "X" is none of NESW`);
    });

    it("decodes the protocol's example trips and rides to their tiles", () => {
        const {routes, rides} = JSON.parse(readFileSync(repositoryPath("protocol/examples/state/trips.json"), "utf8")) as
            TripsMessage;

        expect(routes.map(tripRoute)).toEqual([
            [{x: 9, y: 8}, {x: 9, y: 7}, {x: 9, y: 6}],
            [{x: 40, y: 31}, {x: 41, y: 31}, {x: 42, y: 31}, {x: 42, y: 32}],
        ]);
        expect(rides.map(tripRoute)).toEqual([Array.from({length: 20}, (_, i) => ({x: 25 + i, y: 15}))]);
    });
});

describe("a car's place on its route", () => {
    it("starts in the middle of its first tile's right-hand lane", () => {
        expect(rounded(carPlace(EAST, 0))).toEqual({x: 10.5, y: 5.5 + LANE_OFFSET, direction: "east"});
    });

    it("moves along the lane in proportion to the distance driven", () => {
        expect(rounded(carPlace(EAST, 0.5))).toEqual({x: 11, y: 5.5 + LANE_OFFSET, direction: "east"});
        expect(rounded(carPlace(EAST, 1.25))).toEqual({x: 11.75, y: 5.5 + LANE_OFFSET, direction: "east"});
        expect(rounded(carPlace(EAST, 2))).toEqual({x: 12.5, y: 5.5 + LANE_OFFSET, direction: "east"});
    });

    // The right-hand lane is a quarter turn clockwise from the way the car drives, y growing south
    it.each([
        ["north", [{x: 4, y: 4}, {x: 4, y: 3}], {x: 4.5 + LANE_OFFSET, y: 4.5}],
        ["east", [{x: 4, y: 4}, {x: 5, y: 4}], {x: 4.5, y: 4.5 + LANE_OFFSET}],
        ["south", [{x: 4, y: 4}, {x: 4, y: 5}], {x: 4.5 - LANE_OFFSET, y: 4.5}],
        ["west", [{x: 4, y: 4}, {x: 3, y: 4}], {x: 4.5, y: 4.5 - LANE_OFFSET}],
    ])("drives %s on the right-hand side", (direction, route, start) => {
        expect(rounded(carPlace(route, 0))).toEqual(rounded({...start, direction} as CarPlace));
    });

    // East to (5, 4), then north: the corner is where the two lanes cross, right of each way
    it("turns a corner where the lanes cross, facing the way it drives each side of it", () => {
        const route = [{x: 4, y: 4}, {x: 5, y: 4}, {x: 5, y: 3}];

        expect(rounded(carPlace(route, 1))).toEqual({x: 5.5 + LANE_OFFSET, y: 4.5 + LANE_OFFSET, direction: "north"});
        expect(carPlace(route, 0.9).direction).toBe("east");
        expect(rounded(carPlace(route, 2))).toEqual({x: 5.5 + LANE_OFFSET, y: 3.5, direction: "north"});
    });
});

describe("the cars", () => {
    it("drive their routes at four tiles a second on the client's clock", () => {
        const drive = carsOn(EAST_TRIP);

        const half = near(drive.run(TILE_MS / 2).cars.driven());
        drive.run(TILE_MS);

        expect([half, near(drive.cars.driven())]).toEqual([[0.5], [1.5]]);
    });

    it("are gone at the ends of their routes, driving off them without slowing", () => {
        const drive = carsOn(EAST_TRIP);

        const before = drive.run(2 * TILE_MS - FRAME).cars.driven().length;
        drive.run(FRAME + 1);

        expect([before, drive.cars.driven().length]).toEqual([1, 0]);
    });

    it("stand at the starts of their routes while the client's clock stands, as the end-to-end suite fixes it", () => {
        const drive = carsOn(EAST_TRIP);

        drive.frame().frame();

        expect(drive.cars.driven()).toEqual([0]);
    });

    it("stand still while the client's clock goes back, and drive on from where they stood", () => {
        const drive = carsOn(EAST_TRIP).run(TILE_MS / 2);

        drive.now = NOW;
        const back = near(drive.frame().cars.driven());
        drive.run(TILE_MS / 4);

        expect([back, near(drive.cars.driven())]).toEqual([[0.5], [0.75]]);
    });

    it("stand still while the city is paused, and pick up again from there when it runs", () => {
        const drive = carsOn(EAST_TRIP).run(TILE_MS / 2);

        const paused = near(drive.run(10 * TILE_MS, true).cars.driven());
        drive.run(TILE_MS / 2);

        expect([paused, near(drive.cars.driven())]).toEqual([[0.5], [1]]);
    });

    it("appear where they arrive, behind the cars before them on the same road", () => {
        const drive = carsOn(EAST_TRIP).run(TILE_MS);

        drive.add(EAST_TRIP);

        expect(near(drive.cars.driven())).toEqual([1, 0]);
    });

    it("wait to appear while a car before them is on the first tile of their route", () => {
        const drive = carsOn(EAST_TRIP, EAST_TRIP);

        const together = drive.cars.driven().length;
        drive.run(TILE_MS);

        expect([together, drive.cars.driven().length]).toEqual([1, 2]);
    });

    it("take no car for a trip of no steps, which has nowhere to drive", () => {
        expect(carsOn([3, 3, ""]).cars.driven()).toEqual([]);
    });

    it("drop the cars that arrive while the most drive, cutting none short", () => {
        const trips = shortTrips(0, MAX_CARS);
        const drive = carsOn(...trips);

        drive.add(EAST_TRIP);

        expect(rows(drive)).toEqual(trips.map(([, y]) => y));
    });

    // Two short of the most drive, and a batch of four arrives: the first two drive, the last two are dropped
    it("drop the rest of a batch that fills the most partway", () => {
        const drive = carsOn(...shortTrips(0, MAX_CARS - 2));

        drive.add(...shortTrips(MAX_CARS + 10, 4));

        expect(rows(drive).slice(-2)).toEqual([MAX_CARS + 10, MAX_CARS + 11]);
        expect(drive.cars.driven().length).toBe(MAX_CARS);
    });

    // The most arrive at once on one route: the first drives and the rest wait to appear behind it, each counted, so a
    // car arriving after them is dropped though only one shows
    it("count the cars waiting to appear toward the most that drive", () => {
        const drive = carsOn(...Array.from({length: MAX_CARS}, () => EAST_TRIP));

        drive.add(shortTrip(0));

        expect([rows(drive), drive.cars.carsHeld()]).toEqual([[5], MAX_CARS]);
    });

    it("take a car again once one of the most has gone", () => {
        const drive = carsOn(...shortTrips(0, MAX_CARS));

        drive.run(TILE_MS + 1).add(EAST_TRIP);

        expect(drive.cars.driven()).toEqual([0]);
    });

    it("are drawn in a square centred on their place, in map pixels, whole while they drive", () => {
        const [car] = carsOn(EAST_TRIP).cars.paintable();

        expect(car).toEqual({kind: "road", x: 10.5 * SPRITE_PIXELS_PER_TILE - CAR_PIXELS / 2,
                             y: (5.5 + LANE_OFFSET) * SPRITE_PIXELS_PER_TILE - CAR_PIXELS / 2,
                             width: CAR_PIXELS, direction: "east", colour: carColour(EAST), opacity: 1});
    });

    it("take their colour from their route's start, the same every time", () => {
        expect(carColour([{x: 10, y: 5}, {x: 10, y: 6}])).toBe(carColour(EAST));
        const colours = new Set(Array.from({length: 8}, (_, x) => carColour([{x, y: 0}, {x, y: 1}])));
        expect(colours.size).toBeGreaterThan(1);
    });

    it("let go of the cars at the ends of their routes, the rest driving on in the order they arrived", () => {
        const drive = carsOn([0, 0, "E"], [0, 1, "EEE"], [0, 2, "E"], [0, 3, "EE"]);

        drive.run(TILE_MS + 1);

        expect(rows(drive)).toEqual([1, 3]);
    });

    // A train runs east along row 5 through a level crossing at (12, 5), leaving its station at (10, 5) now, as a car
    // comes south down column 12 to it: until the train's car has passed it, nearly three tiles on, the car's front,
    // a quarter of a tile ahead of its middle, stays short of the crossing; then it drives on over it
    it("wait at a level crossing while a train is on it, and drive on once it has gone", () => {
        const drive = new Drive(() => ALL, [CROSSING]);
        drive.cars.addRides([[10, 5, "EEEE", 6000]], 6000);
        drive.add([12, 3, "SSSS"]);
        let furthest = 0;

        while (drive.now < NOW + 2.8 * RAIL_TILE_MS) {
            furthest = Math.max(furthest, drive.run(FRAME).cars.driven()[0]);
        }
        drive.run(1000);

        expect(furthest).toBeGreaterThan(1);
        expect(furthest).toBeLessThanOrEqual(1.25);
        expect(drive.cars.driven()).toEqual([]);
    });

    // A train runs east along row 5 through the level crossing at (12, 5), leaving its station at (10, 5) a second
    // from now, and a car comes south down column 12 over it, starting a little later each time, from well before the
    // train to well after it, so that it comes to the crossing before the train, as it does, and after: a frame at a
    // time, the car and the train's car are never drawn over each other
    it("never meet a train on a level crossing, whenever they come to it", () => {
        const faults: string[] = [];
        for (let delay = 0; delay <= 2500; delay += 25) {
            const drive = new Drive(() => ALL, [CROSSING]);
            drive.cars.addRides([[10, 5, "EEEEEE", 6000 + STEPS_PER_SECOND]], 6000);
            drive.run(delay).add([12, 1, "SSSSSSS"]);
            drive.run(4000, false, () => {
                const road = drive.cars.paintable().filter(({kind}) => kind === "road");
                const rail = drive.cars.paintable().filter(({kind}) => kind === "rail");
                if (road.some((car) => rail.some((train) => overlap(body(car), body(train))))) {
                    faults.push(`the car starting at ${delay} ms, the train at 1000, at ${drive.now - NOW} ms`);
                }
            });
        }

        expect(faults.slice(0, 5)).toEqual([]);
    });
});

describe("the share of the trips that become cars", () => {
    it.each([[OFF, 0], [TENTH, 200], [QUARTER, 500], [HALF, 1000], [ALL, 2000]])(
        "at %p, lets at most %s cars drive at once", (step, cap) => {
            expect(carCap(step)).toBe(cap);
        });

    it.each([[OFF, []], [TENTH, [0, 10]], [QUARTER, [0, 4, 8, 12]], [HALF, [0, 2, 4, 6, 8, 10, 12, 14]],
             [ALL, Array.from({length: 16}, (_, i) => i)]])(
        "at %p, of 16 trips, takes every k-th from the first", (step, taken) => {
            expect(rows(carsAt(() => step, shortTrips(0, 16)))).toEqual(taken);
        });

    it("counts the trips on from one batch to the next", () => {
        const drive = carsAt(() => QUARTER, shortTrips(0, 3));

        drive.add(...shortTrips(3, 6));

        expect(rows(drive)).toEqual([0, 4, 8]);
    });

    it("counts the trips on through a change of share", () => {
        let step = HALF;
        const drive = carsAt(() => step, shortTrips(0, 3));

        step = QUARTER;
        drive.add(...shortTrips(3, 6));

        expect(rows(drive)).toEqual([0, 2, 4, 8]);
    });

    it("counts the trips from the first again once the page joins the city again", () => {
        const drive = carsAt(() => QUARTER, shortTrips(0, 3));

        drive.cars.joined();
        drive.add(...shortTrips(3, 6));

        expect(rows(drive)).toEqual([0, 3, 7]);
    });

    it("drops the cars a share's trips bring past its own most, cutting none short", () => {
        const drive = carsAt(() => TENTH, shortTrips(0, 10 * carCap(TENTH) + 10));

        expect(drive.cars.driven().length).toBe(carCap(TENTH));
    });

    // Many drive, then the share goes down: none of them is cut short, and no new car starts while more than the new
    // share's most drive, Off's none included
    it.each([TENTH, OFF])("lowered to $name, lets every car already driving finish and starts none past its most",
        (lowered) => {
            let step = ALL;
            const drive = carsAt(() => step, shortTrips(0, 300));

            step = lowered;
            drive.add(...shortTrips(300, 100));
            const halfway = near(drive.run(TILE_MS / 2).cars.driven());
            drive.run(TILE_MS / 2 + 1);

            expect([halfway.length, halfway.every((distance) => distance === 0.5), drive.cars.driven()])
                .toEqual([300, true, []]);
        });

    it("starts cars at Off no more, and starts them again once the share goes up", () => {
        let step = OFF;
        const drive = carsAt(() => step, shortTrips(0, 4));

        step = ALL;
        drive.add(...shortTrips(4, 2));

        expect(rows(drive)).toEqual([4, 5]);
    });
});

describe("the tiles near the main map's view", () => {
    it("are the tiles it shows and VIEW_MARGIN more on every side", () => {
        expect(nearView({left: 0, top: 0, right: 9, bottom: 4})).toEqual({left: -8, top: -8, right: 17, bottom: 12});
        expect(VIEW_MARGIN).toBe(8);
    });

    // A route west along row 7 from (20, 7) to (4, 7), its thirteenth tile (8, 7) and its sixth (15, 7)
    const ROW = tripRoute([20, 7, "W".repeat(16)]);
    const VIEW: TileRect = {left: 0, top: 0, right: 9, bottom: 4};
    const EAST_OF_IT: TileRect = {left: 30, top: 7, right: 31, bottom: 7};

    it.each<[string, TilePosition[], number, TileRect, number]>([
        ["a route below and right of the tiles, the farther way", tripRoute([14, 9, "E"]), 0, VIEW, 5],
        ["a route that drives into the tiles", tripRoute([5, 7, "NNNN"]), 0, VIEW, 0],
        ["a route along a row below the tiles, from its start", ROW, 0, VIEW, 3],
        ["a route along a row below the tiles, from a tile below them", ROW, 12, VIEW, 3],
        ["a route driving away from the tiles, from its start", ROW, 0, EAST_OF_IT, 10],
        ["a route driving away from the tiles, from a tile on", ROW, 5, EAST_OF_IT, 15],
    ])("lie from %s as a king moves, from the nearest of its tiles from the index given", (_, route, from, tiles,
                                                                                           distance) => {
        expect(distanceFrom(route, from, tiles)).toBe(distance);
    });
});

// The view shows columns 0 to 99 of every row the fillers drive: they are near it, and a trip from column 200 or past
// it is far from it
describe("the cars near the view, while the most drive", () => {
    const SHOWN: TileRect = {left: 0, top: 0, right: 99, bottom: MAX_CARS};

    // A trip one step east from the column and row given, far from the view from column 200
    const from = (x: number, y = 10): Trip => [x, y, "E"];

    // The most cars, the trips given last after near ones, taking every trip, with the view showing SHOWN
    function full(...last: Trip[]): Drive {
        const drive = new Drive(() => ALL);
        drive.view = SHOWN;
        return drive.add(...shortTrips(0, MAX_CARS - last.length), ...last);
    }

    // Where the cars on the road showing start, as "column,row", but for the near ones the fillers drive, in the order
    // they arrived
    function others({cars}: Drive): string[] {
        const tile = (pixels: number) => Math.floor((pixels + CAR_PIXELS / 2) / SPRITE_PIXELS_PER_TILE);
        return cars.paintable().filter((car) => car.kind === "road" && tile(car.x) !== 0)
            .map((car) => `${tile(car.x)},${tile(car.y)}`);
    }

    it("take the place of the car farthest from it with the rest of its route outside it, which is gone at once", () => {
        const drive = full(from(200), from(300));

        drive.add(EAST_TRIP);

        expect([drive.cars.carsHeld(), others(drive)]).toEqual([MAX_CARS, ["200,10", "10,5"]]);
    });

    it("are dropped while every car on the road is near it", () => {
        const drive = full();

        drive.add(EAST_TRIP);

        expect([drive.cars.carsHeld(), others(drive)]).toEqual([MAX_CARS, []]);
    });

    it("are the only ones that take a far car's place: a car far from it is dropped", () => {
        const drive = full(from(300));

        drive.add(from(200, 20));

        expect([drive.cars.carsHeld(), others(drive)]).toEqual([MAX_CARS, ["300,10"]]);
    });

    // A car starting at column 400 drives west to column 100, inside the view's margin: it is farther than the car
    // from column 200, but drives into the view, so it stays
    it("never take the place of a car still driving into it", () => {
        const drive = full(from(200), [400, 10, "W".repeat(300)]);

        drive.add(EAST_TRIP);

        expect(others(drive)).toEqual(["400,10", "10,5"]);
    });

    // A car from column 100, inside the margin, drives east to column 200: five seconds on, at column 120, the rest of
    // its route is outside the view
    it("take the place of a car that has driven out of it", () => {
        const drive = new Drive(() => ALL);
        drive.view = SHOWN;
        drive.add([100, 10, "E".repeat(100)]).run(5000);
        drive.add(...shortTrips(0, MAX_CARS - 1));

        drive.add(EAST_TRIP);

        expect([drive.cars.carsHeld(), others(drive)]).toEqual([MAX_CARS, ["10,5"]]);
    });

    // The cars from (200, 30) and (200, 10) are as far from the view, the one from row 30 added first
    it("take the place of the one added first of the cars as far", () => {
        const drive = full(from(200, 30), from(200, 10));

        drive.add(EAST_TRIP);

        expect(others(drive)).toEqual(["200,10", "10,5"]);
    });

    // Three near trips arrive in one batch: the first takes the place of the car from column 300, the second that of the
    // car from column 200, and the third is dropped, no car far from the view being left
    it("take the places of the far cars one by one, farthest first, in a batch of them", () => {
        const drive = full(from(200), from(300));

        drive.add(EAST_TRIP, [20, 5, "E"], [30, 5, "E"]);

        expect([drive.cars.carsHeld(), others(drive)]).toEqual([MAX_CARS, ["10,5", "20,5"]]);
    });

    // Two cars from (300, 10) go east, the first on east, the second, which waits to appear behind it on its first
    // tile, turning south: once the first is gone, the second appears and drives on, turning south a tile on
    it("let the car waiting behind the one whose place they take go on", () => {
        const drive = full([300, 10, "EE"], [300, 10, "ES"]);
        const before = others(drive);

        drive.add(EAST_TRIP);
        const after = others(drive);
        drive.run(TILE_MS * 1.5);

        expect([before, after, drive.cars.paintable().filter(({kind}) => kind === "road").map(({direction}) => direction)])
            .toEqual([["300,10"], ["300,10", "10,5"], ["south", "east"]]);
    });

    // At All, 300 drive, one of them far; then the share goes down to a tenth, whose most is 200: a car near the view
    // can't fit under it by taking one car's place, so it is dropped and the far car kept
    it("are dropped while more than the share's most drive, after the share went down", () => {
        let step = ALL;
        const drive = new Drive(() => step);
        drive.view = SHOWN;
        drive.add(...shortTrips(0, 299), from(300));

        step = TENTH;
        drive.add(EAST_TRIP);

        expect([drive.cars.carsHeld(), others(drive)]).toEqual([300, ["300,10"]]);
    });

    // The cars on the road are near the view, at column 0, and a train's car far from it, from (10, 5): a car near it
    // is dropped rather than take the train's place
    it("never take the place of a train's car", () => {
        const drive = new Drive(() => ALL);
        drive.view = {left: 0, top: 0, right: 1, bottom: MAX_CARS};
        drive.add(...shortTrips(0, MAX_CARS - 1));
        drive.cars.addRides([[10, 5, "EEEE", 6000]], 6000);

        drive.add([5, 5, "E"]);

        expect([drive.cars.carsHeld(), drive.cars.paintable().filter(({kind}) => kind === "road").length])
            .toEqual([MAX_CARS, MAX_CARS - 1]);
    });
});

describe("the trains", () => {
    // The step clock as the tests' trips messages carry it, and a departure a second after it
    const STEPS = 6000;
    const DEPARTS = STEPS + STEPS_PER_SECOND;

    // A ride east along row 5 from a station at (10, 5) to one at (14, 5), and one north up column 20, each boarding
    // the departure given
    const east = (departure = DEPARTS): Ride => [10, 5, "EEEE", departure];
    const north = (departure = DEPARTS): Ride => [20, 9, "NNN", departure];

    // As many rides as given, each boarding the departure given
    const rides = (count: number, ride: Ride): Ride[] => Array.from({length: count}, () => ride);

    // As many rides east along row 5 as given, ten tiles from (10, 5), five tiles on, every carriage out of the station
    const longEast = (count: number): Ride[] => rides(count, [10, 5, "E".repeat(10), DEPARTS]);
    const allOut = 1000 + RAIL_TILE_MS * 5;

    // The cars at the step given, the step clock at STEPS, the rides given arrived in one trips message
    function trainsAt(share: () => CarShareStep, given: Ride[]): Drive {
        const drive = new Drive(share);
        drive.cars.addRides(given, STEPS);
        return drive;
    }

    // The carriages each train draws, front first, as the middles of their squares, in tiles
    function middles({cars}: Drive): {x: number, y: number, direction: string}[] {
        return cars.paintable().map(({x, y, direction}) => rounded({
            x: (x + CAR_PIXELS / 2) / SPRITE_PIXELS_PER_TILE, y: (y + CAR_PIXELS / 2) / SPRITE_PIXELS_PER_TILE, direction,
        }));
    }

    // A carriage of a train going east along row 5, at x, on the right-hand track
    const eastAt = (x: number) => ({x, y: 5.5 + TRACK_OFFSET, direction: "east"});

    it("stand at their stations until their departure, then run at six tiles a second on the client's clock", () => {
        const drive = trainsAt(() => ALL, [east()]);

        const waiting = near(drive.run(1000 - FRAME).cars.driven());
        drive.run(FRAME + RAIL_TILE_MS * 1.5);

        expect([waiting, near(drive.cars.driven())]).toEqual([[0], [1.5]]);
    });

    it("stand at their stations past their departure while the city is paused, and leave once it runs", () => {
        const drive = trainsAt(() => ALL, [east()]);

        const paused = near(drive.run(5000, true).cars.driven());
        const waiting = near(drive.run(1000 - FRAME).cars.driven());
        drive.run(FRAME + RAIL_TILE_MS);

        expect([paused, waiting, near(drive.cars.driven())]).toEqual([[0], [0], [1]]);
    });

    // A train east from (10, 5) leaving four seconds on closes its station's tile alone while it stands there, so cars
    // cross a level crossing beside a station until the train is about to leave; from CAR_CROSSING_MS before it
    // leaves, it closes the tiles its front reaches by then, and its front car's reach past it
    it("close only their station's tile while they stand there, and those they reach within a car's crossing once they run", () => {
        const trains = new Trains();
        trains.board([10, 5, "EEEEEEEE", STEPS + 4 * STEPS_PER_SECOND], {drive: 0, steps: STEPS}, () => true);
        const columnsClosed = (clock: number) => {
            const closed = new Set<number>();
            tilesOf(trains.all[0], clock, closed);
            return [...closed].map((key) => key % 65536);
        };
        const reached = 0.5 * CAR_CROSSING_MS / 1000 * TRAIN_TILES_PER_SECOND + CARRIAGE_SPACING / 2;

        expect(columnsClosed(4000 - CAR_CROSSING_MS - 1)).toEqual([10]);
        expect(columnsClosed(4000 - CAR_CROSSING_MS / 2)).toEqual(
            Array.from({length: Math.round(reached) + 1}, (_, i) => 10 + i));
    });

    it("leave at once for a departure the step clock has passed", () => {
        const drive = trainsAt(() => ALL, [east(STEPS - 10)]);

        drive.run(RAIL_TILE_MS);

        expect(near(drive.cars.driven())).toEqual([1]);
    });

    it("stand at their stations while the client's clock stands, as the end-to-end suite fixes it", () => {
        const drive = trainsAt(() => ALL, [east(STEPS - 10)]);

        drive.frame().frame();

        expect(middles(drive)).toEqual([eastAt(10.5)]);
    });

    it.each([[1, 1], [RIDES_PER_CARRIAGE, 1], [RIDES_PER_CARRIAGE + 1, 2],
             [MOST_CARRIAGES * RIDES_PER_CARRIAGE, MOST_CARRIAGES]])(
        "carry %s rides of one departure in %s carriages of one train", (count, carriages) => {
            const drive = trainsAt(() => ALL, longEast(count));

            drive.run(allOut);

            expect([drive.cars.carsHeld(), middles(drive)]).toEqual([carriages, Array.from({length: carriages},
                (_, carriage) => eastAt(15.5 - carriage * CARRIAGE_SPACING))]);
        });

    // One ride more than six carriages seat east, and one north, boarding one departure, the north among the east: six
    // carriages of the east ones ride one train, and the last the next departure's, an interval of the step clock
    // later; the north train has gone into its station
    it("carry six carriages of rides at most, the rest riding the next departure's train", () => {
        const most = MOST_CARRIAGES * RIDES_PER_CARRIAGE;
        const drive = trainsAt(() => ALL, [...longEast(most / 2), north(), ...longEast(most / 2 + 1)]);

        drive.run(allOut);

        expect([drive.cars.carsHeld(), middles(drive).length, near(drive.cars.driven())])
            .toEqual([MOST_CARRIAGES + 1, MOST_CARRIAGES + 1, [5, 0]]);
    });

    it("merge the rides of one departure whichever trips message brings them", () => {
        const drive = trainsAt(() => ALL, longEast(RIDES_PER_CARRIAGE));

        drive.cars.addRides(longEast(1), STEPS);
        drive.run(allOut);

        expect([drive.cars.driven().length, drive.cars.paintable().length]).toEqual([1, 2]);
    });

    // Half a carriage of rides leaves at once, and the train runs a tile on: as many more for its departure take its
    // seats left, and the one after them, with no seat left, waits at the station for the next departure rather than
    // add a carriage behind the train running
    it("seat the rides for a train that has left in the seats it has left, the rest riding the next train", () => {
        const drive = trainsAt(() => ALL, rides(RIDES_PER_CARRIAGE / 2, east(STEPS)));
        drive.run(RAIL_TILE_MS);

        drive.cars.addRides(rides(RIDES_PER_CARRIAGE / 2, east(STEPS)), STEPS);
        const seated = drive.cars.carsHeld();
        drive.cars.addRides([east(STEPS)], STEPS);

        expect([seated, drive.cars.carsHeld(), near(drive.cars.driven())]).toEqual([1, 2, [1, 0]]);
    });

    // A train of two carriages two tiles east leaves at once, and its front carriage has reached (12, 5), the end of
    // its path, and gone: a ride four tiles east for its departure, which would take its path past there, waits at the
    // station for the next departure, though the train has seats left, so the front carriage never shows again
    it("seat no ride longer than the path of a train that has left, which rides the next train", () => {
        const drive = trainsAt(() => ALL, rides(RIDES_PER_CARRIAGE + 1, [10, 5, "EE", STEPS]));
        drive.run(RAIL_TILE_MS * 2.5);
        const before = middles(drive);

        drive.cars.addRides([east(STEPS)], STEPS);
        drive.frame();

        expect([before, middles(drive)]).toEqual([[eastAt(12.25)], [eastAt(12.25), eastAt(10.5)]]);
    });

    it("run the rides of the next departure on the next train", () => {
        const drive = trainsAt(() => ALL, [east(), east(DEPARTS + DEPARTURE_INTERVAL)]);

        drive.run(1000 + RAIL_TILE_MS);

        expect(near(drive.cars.driven())).toEqual([1, 0]);
    });

    // A carriage of rides two tiles east from one station, getting off at (12, 5), and one four tiles east: the train
    // runs the longer with both its carriages, past where the shorter get off, until the last reaches (14, 5)
    it("follow their longest ride, keeping every carriage to its end", () => {
        const drive = trainsAt(() => ALL, [...rides(RIDES_PER_CARRIAGE, [10, 5, "EE", DEPARTS]),
                                           ...rides(RIDES_PER_CARRIAGE, east())]);
        const shown = (front: number) => middles(drive.runTo(1000 + front * RAIL_TILE_MS));

        expect([shown(3.5), shown(4 + CARRIAGE_SPACING - 0.1)])
            .toEqual([[eastAt(14), eastAt(14 - CARRIAGE_SPACING)], [eastAt(14.4)]]);
        drive.run(RAIL_TILE_MS / 5);
        expect(drive.cars.driven()).toEqual([]);
    });

    // A ride from the station the same way along another path would run into the train, so it waits for the next
    it("take a ride along another path from the station the same way on the next departure", () => {
        const drive = trainsAt(() => ALL, [east(), [10, 5, "EEN", DEPARTS]]);

        drive.run(1000 + RAIL_TILE_MS);

        expect(near(drive.cars.driven())).toEqual([1, 0]);
    });

    it("run on the right-hand track of the double track, so trains each way pass", () => {
        const drive = trainsAt(() => ALL, [north(STEPS)]);

        drive.run(RAIL_TILE_MS * 1.5);

        expect(middles(drive)).toEqual([{x: 20.5 + TRACK_OFFSET, y: 8, direction: "north"}]);
        expect(rounded(trainPlace([{x: 4, y: 4}, {x: 5, y: 4}, {x: 5, y: 3}], 1.5)))
            .toEqual({x: 5.5 + TRACK_OFFSET, y: 4 + TRACK_OFFSET / 2, direction: "north"});
    });

    // Three carriages: at the start only the front has left the station; each shows once it is CARRIAGE_SPACING
    // behind the one ahead, and goes once it reaches the end of the path
    it("show each carriage from leaving the station to reaching the end of the path", () => {
        const drive = trainsAt(() => ALL, rides(2 * RIDES_PER_CARRIAGE + 1, east(STEPS)));
        const shown = (ms: number) => drive.runTo(ms).cars.paintable().length;

        expect([shown(0), shown(RAIL_TILE_MS * CARRIAGE_SPACING + 1), shown(RAIL_TILE_MS * 2 * CARRIAGE_SPACING + 1),
                shown(RAIL_TILE_MS * (4 + CARRIAGE_SPACING / 2)), shown(RAIL_TILE_MS * (4 + 2 * CARRIAGE_SPACING) - 1)])
            .toEqual([1, 2, 3, 2, 1]);
        drive.run(2);
        expect(drive.cars.driven()).toEqual([]);
    });

    it("are drawn as carriages of a train, in squares centred on the track", () => {
        const [carriage] = trainsAt(() => ALL, [east()]).cars.paintable();

        expect(carriage).toEqual({kind: "rail", x: 10.5 * SPRITE_PIXELS_PER_TILE - CAR_PIXELS / 2,
                             y: (5.5 + TRACK_OFFSET) * SPRITE_PIXELS_PER_TILE - CAR_PIXELS / 2, width: CAR_PIXELS,
                             direction: "east"});
    });

    // A carriage of rides east and one more, and one north: every one boards, two carriages east and one north
    it.each([TENTH, QUARTER, HALF, ALL])("take every ride at $name", (step) => {
        const drive = trainsAt(() => step, [...rides(RIDES_PER_CARRIAGE + 1, east()), north()]);

        drive.run(1000 + RAIL_TILE_MS * 2);

        expect(drive.cars.paintable().filter(({kind}) => kind === "rail").map(({direction}) => direction))
            .toEqual(["east", "east", "north"]);
    });

    // A train's carriages count toward the most that drive: one short of it, the first ride's carriage joins, the
    // rides into its seats after it board, and the ride that needs a second carriage is dropped, as is a car on the
    // road after them
    it("count each carriage toward the most that drive, dropping a ride that needs one past it", () => {
        const drive = carsOn(...shortTrips(0, MAX_CARS - 1));

        drive.cars.addRides(rides(RIDES_PER_CARRIAGE + 1, east()), STEPS);
        drive.add(EAST_TRIP);
        const held = drive.cars.carsHeld();
        drive.run(1000 + RAIL_TILE_MS * 2);

        expect([held, drive.cars.paintable().map(({kind}) => kind)]).toEqual([MAX_CARS, ["rail"]]);
    });

    it("start no train while the most drive", () => {
        const drive = carsOn(...shortTrips(0, MAX_CARS));

        drive.cars.addRides([east()], STEPS);
        drive.frame();

        expect([drive.cars.carsHeld(), drive.cars.paintable().filter(({kind}) => kind === "rail")])
            .toEqual([MAX_CARS, []]);
    });

    // The first ride adds the train's carriage, the rides after it take its seats though no carriage may be added, and
    // the one past them, needing a second carriage, is dropped; so once a carriage may be added, the next ride adds the
    // second, its seats all taken
    it("seat a ride in a carriage the train has whatever the most, and add a carriage only where it may", () => {
        const trains = new Trains();
        const ride: Ride = [10, 5, "EEEE", DEPARTS];
        trains.board(ride, {drive: 0, steps: STEPS}, () => true);

        for (let i = 0; i < RIDES_PER_CARRIAGE; i++) {
            trains.board(ride, {drive: 0, steps: STEPS}, () => false);
        }
        const refused = trains.carriages;
        trains.board(ride, {drive: 0, steps: STEPS}, () => true);

        expect([refused, trains.carriages]).toEqual([1, 2]);
    });

    it("are gone at Off, as cars are", () => {
        expect(trainsAt(() => OFF, [east()]).cars.driven()).toEqual([]);
    });
});
