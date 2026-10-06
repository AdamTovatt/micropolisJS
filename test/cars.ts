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
    CAR_PIXELS, CAR_TILES_PER_SECOND, Cars, LANE_OFFSET, MAX_CARS, TRAIN_CAR_SPACING, TRAIN_TILES_PER_SECOND, carCap,
    carColour, carPlace, trainPlace, tripRoute,
} from "../src/cars";
import type { CarPlace } from "../src/cars";
import { SPRITE_PIXELS_PER_TILE } from "../src/paintable";
import type { TilePosition, Trip, TripsMessage } from "../src/protocol";
import { repositoryPath } from "./helpers/repository";

// The milliseconds a car takes to drive one tile
const TILE_MS = 1000 / CAR_TILES_PER_SECOND;

// A route east along row 5, from (10, 5) to (12, 5), and the trip that drives it
const EAST: TilePosition[] = [{x: 10, y: 5}, {x: 11, y: 5}, {x: 12, y: 5}];
const EAST_TRIP: Trip = [10, 5, "EE"];

// The client's clock as the tests start
const NOW = 1_000_000;

// A place's numbers rounded, so sums of fractions compare
function rounded({x, y, direction}: CarPlace): CarPlace {
    return {x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000, direction};
}

// The Cars slider's steps, by name
const [OFF, TENTH, QUARTER, HALF, ALL] = CAR_SHARE_STEPS;

// Cars whose clock has been read once, at NOW, taking every trip, and holding a car on each trip given
function carsOn(...trips: Trip[]): Cars {
    return carsAt(() => ALL, trips);
}

// Cars whose clock has been read once, at NOW, at the step given as each trips message arrives, the trips given arrived
function carsAt(share: () => CarShareStep, trips: Trip[] = []): Cars {
    const cars = new Cars(share);
    cars.advance(NOW, false);
    cars.add(trips);
    return cars;
}

// The rows of the trips the cars drive, in the order they started, as shortTrip numbers them
function rows(cars: Cars): number[] {
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
        const cars = carsOn(EAST_TRIP);

        cars.advance(NOW + TILE_MS / 2, false);
        const half = cars.driven();
        cars.advance(NOW + TILE_MS * 1.5, false);

        expect([half, cars.driven()]).toEqual([[0.5], [1.5]]);
    });

    it("are gone at the ends of their routes", () => {
        const cars = carsOn(EAST_TRIP);

        cars.advance(NOW + 2 * TILE_MS - 1, false);
        const before = cars.driven().length;
        cars.advance(NOW + 2 * TILE_MS, false);

        expect([before, cars.driven().length]).toEqual([1, 0]);
    });

    it("stand at the starts of their routes while the client's clock stands, as the end-to-end suite fixes it", () => {
        const cars = carsOn(EAST_TRIP);

        cars.advance(NOW, false);
        cars.advance(NOW, false);

        expect(cars.driven()).toEqual([0]);
    });

    it("stand still while the client's clock goes back, and drive on from where they stood", () => {
        const cars = carsOn(EAST_TRIP);
        cars.advance(NOW + TILE_MS / 2, false);

        cars.advance(NOW, false);
        const back = cars.driven();
        cars.advance(NOW + TILE_MS / 4, false);

        expect([back, cars.driven()]).toEqual([[0.5], [0.75]]);
    });

    it("stand still while the city is paused, and pick up again from there when it runs", () => {
        const cars = carsOn(EAST_TRIP);
        cars.advance(NOW + TILE_MS / 2, false);

        cars.advance(NOW + 10 * TILE_MS, true);
        const paused = cars.driven();
        cars.advance(NOW + 10.5 * TILE_MS, false);

        expect([paused, cars.driven()]).toEqual([[0.5], [1]]);
    });

    it("start where they arrive, wherever the cars before them have driven", () => {
        const cars = carsOn(EAST_TRIP);
        cars.advance(NOW + TILE_MS, false);

        cars.add([EAST_TRIP]);

        expect(cars.driven()).toEqual([1, 0]);
    });

    it("take no car for a trip of no steps, which has nowhere to drive", () => {
        expect(carsOn([3, 3, ""]).driven()).toEqual([]);
    });

    it("drop the cars that arrive while the most drive, cutting none short", () => {
        const trips = shortTrips(0, MAX_CARS);
        const cars = carsOn(...trips);

        cars.add([EAST_TRIP]);

        expect(rows(cars)).toEqual(trips.map(([, y]) => y));
    });

    // Two short of the most drive, and a batch of four arrives: the first two drive, the last two are dropped
    it("drop the rest of a batch that fills the most partway", () => {
        const cars = carsOn(...shortTrips(0, MAX_CARS - 2));

        cars.add(shortTrips(MAX_CARS + 10, 4));

        expect(rows(cars).slice(-2)).toEqual([MAX_CARS + 10, MAX_CARS + 11]);
        expect(cars.driven().length).toBe(MAX_CARS);
    });

    it("take a car again once one of the most has gone", () => {
        const cars = carsOn(...shortTrips(0, MAX_CARS));

        cars.advance(NOW + TILE_MS, false);
        cars.add([EAST_TRIP]);

        expect(cars.driven()).toEqual([0]);
    });

    it("are drawn in a square centred on their place, in map pixels", () => {
        const [car] = carsOn(EAST_TRIP).paintable();

        expect(car).toEqual({kind: "road", x: 10.5 * SPRITE_PIXELS_PER_TILE - CAR_PIXELS / 2,
                             y: (5.5 + LANE_OFFSET) * SPRITE_PIXELS_PER_TILE - CAR_PIXELS / 2,
                             width: CAR_PIXELS, direction: "east", colour: carColour(EAST)});
    });

    it("take their colour from their route's start, the same every time", () => {
        expect(carColour([{x: 10, y: 5}, {x: 10, y: 6}])).toBe(carColour(EAST));
        const colours = new Set(Array.from({length: 8}, (_, x) => carColour([{x, y: 0}, {x, y: 1}])));
        expect(colours.size).toBeGreaterThan(1);
    });

    it("let go of the cars at the ends of their routes, the rest driving on in the order they started", () => {
        const cars = carsOn([0, 0, "E"], [0, 1, "EEE"], [0, 2, "E"], [0, 3, "EE"]);

        cars.advance(NOW + TILE_MS, false);

        expect(rows(cars)).toEqual([1, 3]);
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
        const cars = carsAt(() => QUARTER, shortTrips(0, 3));

        cars.add(shortTrips(3, 6));

        expect(rows(cars)).toEqual([0, 4, 8]);
    });

    it("counts the trips on through a change of share", () => {
        let step = HALF;
        const cars = carsAt(() => step, shortTrips(0, 3));

        step = QUARTER;
        cars.add(shortTrips(3, 6));

        expect(rows(cars)).toEqual([0, 2, 4, 8]);
    });

    it("counts the trips from the first again once the page joins the city again", () => {
        const cars = carsAt(() => QUARTER, shortTrips(0, 3));

        cars.joined();
        cars.add(shortTrips(3, 6));

        expect(rows(cars)).toEqual([0, 3, 7]);
    });

    it("drops the cars a share's trips bring past its own most, cutting none short", () => {
        const cars = carsAt(() => TENTH, shortTrips(0, 10 * carCap(TENTH) + 10));

        expect(cars.driven().length).toBe(carCap(TENTH));
    });

    // Many drive, then the share goes down: none of them is cut short, and no new car starts while more than the new
    // share's most drive, Off's none included
    it.each([TENTH, OFF])("lowered to $name, lets every car already driving finish and starts none past its most",
        (lowered) => {
            let step = ALL;
            const cars = carsAt(() => step, shortTrips(0, 300));

            step = lowered;
            cars.add(shortTrips(300, 100));
            cars.advance(NOW + TILE_MS / 2, false);
            const halfway = cars.driven();
            cars.advance(NOW + TILE_MS, false);

            expect([halfway.length, halfway.every((distance) => distance === 0.5), cars.driven()])
                .toEqual([300, true, []]);
        });

    it("starts cars at Off no more, and starts them again once the share goes up", () => {
        let step = OFF;
        const cars = carsAt(() => step, shortTrips(0, 4));

        step = ALL;
        cars.add(shortTrips(4, 2));

        expect(rows(cars)).toEqual([4, 5]);
    });
});

describe("the trains", () => {
    // The milliseconds a train takes to run one tile
    const RAIL_TILE_MS = 1000 / TRAIN_TILES_PER_SECOND;

    // A ride east along row 5 from a station at (10, 5) to one at (14, 5), and one north up column 20
    const EAST_RIDE: Trip = [10, 5, "EEEE"];
    const NORTH_RIDE: Trip = [20, 9, "NNN"];

    // Cars whose clock has been read once, at NOW, at the step given, the rides given arrived in one trips message
    function trainsAt(share: () => CarShareStep, rides: Trip[]): Cars {
        const cars = new Cars(share);
        cars.advance(NOW, false);
        cars.addRides(rides);
        return cars;
    }

    // The cars each train draws, front first, as the middles of their squares, in tiles
    function middles(cars: Cars): {x: number, y: number, direction: string}[] {
        return cars.paintable().map(({x, y, direction}) => rounded({
            x: (x + CAR_PIXELS / 2) / SPRITE_PIXELS_PER_TILE, y: (y + CAR_PIXELS / 2) / SPRITE_PIXELS_PER_TILE, direction,
        }));
    }

    // A ride of one path each, in a batch: rides alike ride one train, four cars at most, the trains in the order the
    // first ride of each came
    it("run a train for the rides of one path in a batch, a car a ride, four cars at most", () => {
        const cars = trainsAt(() => ALL, [EAST_RIDE, NORTH_RIDE, EAST_RIDE, EAST_RIDE, EAST_RIDE, EAST_RIDE]);

        cars.advance(NOW + RAIL_TILE_MS * 3.5, false);

        // Three and a half tiles on, the east train's four cars show behind its front, and the north train's one has
        // gone into its station at three; the east train's fifth ride runs a train of its own
        const east = (x: number) => ({x, y: 5.5, direction: "east"});
        expect(middles(cars)).toEqual([east(14), east(14 - TRAIN_CAR_SPACING), east(14 - 2 * TRAIN_CAR_SPACING),
                                       east(14 - 3 * TRAIN_CAR_SPACING), east(14)]);
    });

    it("merge only the rides of one batch", () => {
        const cars = trainsAt(() => ALL, [EAST_RIDE]);

        cars.addRides([EAST_RIDE]);

        expect(cars.driven()).toEqual([0, 0]);
    });

    it("run along the middle of the track at six tiles a second on the client's clock", () => {
        const cars = trainsAt(() => ALL, [NORTH_RIDE]);

        cars.advance(NOW + RAIL_TILE_MS * 1.5, false);

        expect(cars.driven()).toEqual([1.5]);
        expect(middles(cars)).toEqual([{x: 20.5, y: 8, direction: "north"}]);
        expect(rounded(trainPlace([{x: 4, y: 4}, {x: 5, y: 4}, {x: 5, y: 3}], 1.5)))
            .toEqual({x: 5.5, y: 4, direction: "north"});
    });

    // At the start only the front has left the station; each car shows once it is TRAIN_CAR_SPACING behind the one
    // ahead, and goes once it reaches the station the ride gets off at
    it("show each car from leaving the station it got on at to reaching the one it gets off at", () => {
        const cars = trainsAt(() => ALL, [EAST_RIDE, EAST_RIDE, EAST_RIDE]);
        const shown = (ms: number) => {
            cars.advance(NOW + ms, false);
            return cars.paintable().length;
        };

        expect([shown(0), shown(RAIL_TILE_MS * TRAIN_CAR_SPACING), shown(RAIL_TILE_MS * 2 * TRAIN_CAR_SPACING),
                shown(RAIL_TILE_MS * (4 + TRAIN_CAR_SPACING / 2)), shown(RAIL_TILE_MS * (4 + 2 * TRAIN_CAR_SPACING))])
            .toEqual([1, 2, 3, 2, 1]);
        cars.advance(NOW + RAIL_TILE_MS * (4 + 2 * TRAIN_CAR_SPACING) + 1, false);
        expect(cars.driven()).toEqual([]);
    });

    it("are drawn as cars of a train, in squares centred on the track", () => {
        const [car] = trainsAt(() => ALL, [EAST_RIDE]).paintable();

        expect(car).toEqual({kind: "rail", x: 10.5 * SPRITE_PIXELS_PER_TILE - CAR_PIXELS / 2,
                             y: 5.5 * SPRITE_PIXELS_PER_TILE - CAR_PIXELS / 2, width: CAR_PIXELS, direction: "east"});
    });

    // Of a ride east and seven north, a quarter takes the first and the fifth, a train each way. Counted on from the
    // three trips before them, it would take the second and the sixth, one train north of two cars.
    it("take the slider's share of the rides, counted on their own, before merging them", () => {
        const cars = carsAt(() => QUARTER, shortTrips(0, 3));

        cars.addRides([EAST_RIDE, ...Array.from({length: 7}, () => NORTH_RIDE)]);
        cars.advance(NOW + RAIL_TILE_MS * 2, false);

        expect(cars.paintable().filter(({kind}) => kind === "rail").map(({direction}) => direction))
            .toEqual(["east", "north"]);
    });

    it("count their rides from the first again once the page joins the city again", () => {
        const cars = trainsAt(() => HALF, [EAST_RIDE]);

        cars.joined();
        cars.addRides([NORTH_RIDE]);

        expect(cars.driven()).toEqual([0, 0]);
    });

    // A train's cars count toward the most that drive: one short of it, a train of two is dropped, and a car still drives
    it("count each car toward the most that drive, dropping a train its cars would take past it", () => {
        const cars = carsOn(...shortTrips(0, MAX_CARS - 1));

        cars.addRides([EAST_RIDE, EAST_RIDE]);
        cars.add([EAST_TRIP]);

        expect(cars.driven().length).toBe(MAX_CARS);
        expect(cars.paintable().some(({kind}) => kind === "rail")).toBe(false);
    });

    it("are gone at Off, as cars are", () => {
        expect(trainsAt(() => OFF, [EAST_RIDE]).driven()).toEqual([]);
    });
});

