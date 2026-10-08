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
    CAR_PIXELS, Cars, LANE_OFFSET, MAX_CARS, TRACK_OFFSET, carCap, carColour, carPlace, trainPlace,
} from "../src/cars";
import type { CarPlace, PaintableCar } from "../src/cars";
import { CAR_BREADTH, CAR_LENGTH } from "../src/mapFrame";
import { SPRITE_PIXELS_PER_TILE } from "../src/paintable";
import type { Ride, TilePosition, Trip, TripsMessage } from "../src/protocol";
import { CAR_CROSSING_MS, CAR_TILES_PER_SECOND } from "../src/roadTraffic";
import { sameTile, tripRoute } from "../src/routeTiles";
import {
    DEPARTURE_INTERVAL, STEPS_PER_SECOND, TRAIN_CAR_SPACING, TRAIN_TILES_PER_SECOND, Trains, tilesOf,
} from "../src/trains";
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

// How wide a car of a train is drawn, in tiles: about as wide as the right-hand track it runs on
const TRAIN_CAR_BREADTH = 2 * TRACK_OFFSET;

// The rectangle a car is painted in, in tiles: a car on the road CAR_LENGTH of a tile long the way it faces and
// CAR_BREADTH across, a car of a train TRAIN_CAR_SPACING long and TRAIN_CAR_BREADTH across, about the middle of its
// square
function body({kind, x, y, width, direction}: PaintableCar): {left: number, top: number, right: number, bottom: number} {
    const [length, breadth] = kind === "road" ? [CAR_LENGTH, CAR_BREADTH] : [TRAIN_CAR_SPACING, TRAIN_CAR_BREADTH];
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

// The cars, and the client's clock they were last moved to, which runs on an animation frame at a time, on a map whose
// level crossings are the tiles given
class Drive {
    now = NOW;
    readonly cars: Cars;

    constructor(share: () => CarShareStep, crossings: readonly TilePosition[] = []) {
        this.cars = new Cars(share, (tile) => crossings.some((crossing) => sameTile(crossing, tile)));
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

describe("the trains", () => {
    // The step clock as the tests' trips messages carry it, and a departure a second after it
    const STEPS = 6000;
    const DEPARTS = STEPS + STEPS_PER_SECOND;

    // A ride east along row 5 from a station at (10, 5) to one at (14, 5), and one north up column 20, each boarding
    // the departure given
    const east = (departure = DEPARTS): Ride => [10, 5, "EEEE", departure];
    const north = (departure = DEPARTS): Ride => [20, 9, "NNN", departure];

    // The cars at the step given, the step clock at STEPS, the rides given arrived in one trips message
    function trainsAt(share: () => CarShareStep, rides: Ride[]): Drive {
        const drive = new Drive(share);
        drive.cars.addRides(rides, STEPS);
        return drive;
    }

    // The cars each train draws, front first, as the middles of their squares, in tiles
    function middles({cars}: Drive): {x: number, y: number, direction: string}[] {
        return cars.paintable().map(({x, y, direction}) => rounded({
            x: (x + CAR_PIXELS / 2) / SPRITE_PIXELS_PER_TILE, y: (y + CAR_PIXELS / 2) / SPRITE_PIXELS_PER_TILE, direction,
        }));
    }

    // A car of a train going east along row 5, at x, on the right-hand track
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
        trains.board([10, 5, "EEEEEEEE", STEPS + 4 * STEPS_PER_SECOND], {drive: 0, steps: STEPS});
        const columnsClosed = (clock: number) => {
            const closed = new Set<number>();
            tilesOf(trains.all[0], clock, closed);
            return [...closed].map((key) => key % 65536);
        };
        const reached = 0.5 * CAR_CROSSING_MS / 1000 * TRAIN_TILES_PER_SECOND + TRAIN_CAR_SPACING / 2;

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

    // Five rides east and one north, boarding one departure: four of the east ones ride one train, a car each, and
    // the fifth the next departure's, an interval of the step clock later; the north train has gone into its station
    it("ride one train for the rides of one departure from a station the same way, four cars, the rest the next", () => {
        const drive = trainsAt(() => ALL, [east(), north(), east(), east(), east(), east()]);

        drive.run(1000 + RAIL_TILE_MS * 3.5);

        expect(middles(drive)).toEqual([eastAt(14), eastAt(14 - TRAIN_CAR_SPACING), eastAt(14 - 2 * TRAIN_CAR_SPACING),
                                        eastAt(14 - 3 * TRAIN_CAR_SPACING), eastAt(10.5)]);
        drive.run(DEPARTURE_INTERVAL / STEPS_PER_SECOND * 1000);
        expect(middles(drive)).toEqual([eastAt(14)]);
    });

    it("merge the rides of one departure whichever trips message brings them", () => {
        const drive = trainsAt(() => ALL, [east()]);

        drive.cars.addRides([east()], STEPS);
        drive.run(1000 + RAIL_TILE_MS * 2);

        expect([drive.cars.driven().length, drive.cars.paintable().length]).toEqual([1, 2]);
    });

    it("run the rides of the next departure on the next train", () => {
        const drive = trainsAt(() => ALL, [east(), east(DEPARTS + DEPARTURE_INTERVAL)]);

        drive.run(1000 + RAIL_TILE_MS);

        expect(near(drive.cars.driven())).toEqual([1, 0]);
    });

    // Rides two and four tiles east from one station: the train runs the longer, and drops the car of the shorter
    // where it gets off, at (12, 5)
    it("follow their longest ride, dropping a car where each ride gets off", () => {
        const drive = trainsAt(() => ALL, [[10, 5, "EE", DEPARTS], east()]);
        const shown = (front: number) => drive.runTo(1000 + front * RAIL_TILE_MS).cars.paintable().length;

        expect([shown(2.6), shown(2.9), shown(3.9)]).toEqual([2, 1, 1]);
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

    // At the start only the front has left the station; each car shows once it is TRAIN_CAR_SPACING behind the one
    // ahead, and goes once it reaches the station the ride gets off at
    it("show each car from leaving the station it got on at to reaching the one it gets off at", () => {
        const drive = trainsAt(() => ALL, [east(STEPS), east(STEPS), east(STEPS)]);
        const shown = (ms: number) => drive.runTo(ms).cars.paintable().length;

        expect([shown(0), shown(RAIL_TILE_MS * TRAIN_CAR_SPACING + 1), shown(RAIL_TILE_MS * 2 * TRAIN_CAR_SPACING + 1),
                shown(RAIL_TILE_MS * (4 + TRAIN_CAR_SPACING / 2)), shown(RAIL_TILE_MS * (4 + 2 * TRAIN_CAR_SPACING) - 1)])
            .toEqual([1, 2, 3, 2, 1]);
        drive.run(2);
        expect(drive.cars.driven()).toEqual([]);
    });

    it("are drawn as cars of a train, in squares centred on the track", () => {
        const [car] = trainsAt(() => ALL, [east()]).cars.paintable();

        expect(car).toEqual({kind: "rail", x: 10.5 * SPRITE_PIXELS_PER_TILE - CAR_PIXELS / 2,
                             y: (5.5 + TRACK_OFFSET) * SPRITE_PIXELS_PER_TILE - CAR_PIXELS / 2, width: CAR_PIXELS,
                             direction: "east"});
    });

    // Of a ride east and seven north, a quarter takes the first and the fifth, a train each way. Counted on from the
    // three trips before them, it would take the second and the sixth, one train north of two cars.
    it("take the slider's share of the rides, counted on their own, before merging them", () => {
        const drive = carsAt(() => QUARTER, shortTrips(0, 3));

        drive.cars.addRides([east(), ...Array.from({length: 7}, () => north())], STEPS);
        drive.run(1000 + RAIL_TILE_MS * 2);

        expect(drive.cars.paintable().filter(({kind}) => kind === "rail").map(({direction}) => direction))
            .toEqual(["east", "north"]);
    });

    it("count their rides from the first again once the page joins the city again", () => {
        const drive = trainsAt(() => HALF, [east()]);

        drive.cars.joined();
        drive.cars.addRides([north()], STEPS);

        expect(drive.cars.driven()).toEqual([0, 0]);
    });

    // A train's cars count toward the most that drive: one short of it, a ride's car joins, the next ride's car is
    // dropped, and so is a car on the road after them
    it("count each car toward the most that drive, dropping a ride's car past it", () => {
        const drive = carsOn(...shortTrips(0, MAX_CARS - 1));

        drive.cars.addRides([east(), east()], STEPS);
        drive.add(EAST_TRIP);

        expect(drive.cars.driven().length).toBe(MAX_CARS);
        expect(drive.cars.paintable().filter(({kind}) => kind === "rail").length).toBe(1);
    });

    it("are gone at Off, as cars are", () => {
        expect(trainsAt(() => OFF, [east()]).cars.driven()).toEqual([]);
    });
});
