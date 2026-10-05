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

import { CAR_PIXELS, CAR_TILES_PER_SECOND, Cars, LANE_OFFSET, MAX_CARS, carColour, carPlace, tripRoute } from "../src/cars";
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

// Cars whose clock has been read once, at NOW, holding a car on each trip given
function carsOn(...trips: Trip[]): Cars {
    const cars = new Cars();
    cars.advance(NOW, false);
    cars.add(trips);
    return cars;
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

    it("decodes the protocol's example trips to their tiles", () => {
        const {routes} = JSON.parse(readFileSync(repositoryPath("protocol/examples/state/trips.json"), "utf8")) as
            TripsMessage;

        expect(routes.map(tripRoute)).toEqual([
            [{x: 9, y: 8}, {x: 9, y: 7}, {x: 9, y: 6}],
            [{x: 40, y: 31}, {x: 41, y: 31}, {x: 42, y: 31}, {x: 42, y: 32}],
        ]);
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

    it("drop the cars that arrive while sixty drive, cutting none short", () => {
        const trips = Array.from({length: MAX_CARS}, (_, i) => shortTrip(i));
        const cars = carsOn(...trips);

        cars.add([EAST_TRIP]);

        expect(cars.paintable().map((car) => Math.floor((car.y + CAR_PIXELS / 2) / SPRITE_PIXELS_PER_TILE)))
            .toEqual(trips.map(([, y]) => y));
    });

    // Fifty-eight drive, and a batch of four arrives: the first two drive, the last two are dropped
    it("drop the rest of a batch that fills the sixty partway", () => {
        const cars = carsOn(...Array.from({length: MAX_CARS - 2}, (_, i) => shortTrip(i)));

        cars.add([shortTrip(70), shortTrip(71), shortTrip(72), shortTrip(73)]);

        expect(cars.paintable().slice(-2).map((car) => Math.floor((car.y + CAR_PIXELS / 2) / SPRITE_PIXELS_PER_TILE)))
            .toEqual([70, 71]);
        expect(cars.driven().length).toBe(MAX_CARS);
    });

    it("take a car again once one of the sixty has gone", () => {
        const cars = carsOn(...Array.from({length: MAX_CARS}, (_, i) => shortTrip(i)));

        cars.advance(NOW + TILE_MS, false);
        cars.add([EAST_TRIP]);

        expect(cars.driven()).toEqual([0]);
    });

    it("are drawn in a square centred on their place, in map pixels", () => {
        const [car] = carsOn(EAST_TRIP).paintable();

        expect(car).toEqual({x: 10.5 * SPRITE_PIXELS_PER_TILE - CAR_PIXELS / 2,
                             y: (5.5 + LANE_OFFSET) * SPRITE_PIXELS_PER_TILE - CAR_PIXELS / 2,
                             width: CAR_PIXELS, direction: "east", colour: carColour(EAST)});
    });

    it("take their colour from their route's start, the same every time", () => {
        expect(carColour([{x: 10, y: 5}, {x: 10, y: 6}])).toBe(carColour(EAST));
        const colours = new Set(Array.from({length: 8}, (_, x) => carColour([{x, y: 0}, {x, y: 1}])));
        expect(colours.size).toBeGreaterThan(1);
    });
});
