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

import { carPlace } from "../src/cars";
import { CAR_BREADTH, CAR_LENGTH } from "../src/mapFrame";
import type { Trip } from "../src/protocol";
import {
    CAR_BRAKING, CAR_FADE_MS, CAR_GAP, CAR_TILES_PER_SECOND, CAR_WAIT_MS, LONGEST_DRIVE_MS, RoadTraffic, carOpacity, pathQuadrants,
} from "../src/roadTraffic";
import type { RoadCar } from "../src/roadTraffic";
import { tileKey, tripRoute } from "../src/routeTiles";
import type { TilePosition } from "../src/protocol";

// The clock as the tests start, and the milliseconds of an update, about a frame
const START = 1_000_000;
const FRAME = 16;

// How far along its route a car stops short of a tile it can't take, its index on the route given: its front, half
// a car's gap ahead of its middle, at the tile's near edge
function stopsShortOf(index: number): number {
    return index - 0.5 - CAR_GAP / 2;
}

// The road traffic, the level crossings and the tiles trains are on, and its clock, updated a frame at a time; and the
// state each car was in as it was last seen, by its order, which tells a car that reached its route's end, last seen
// driving, from one that faded out or was dropped waiting to appear
class Road {
    readonly crossings = new Set<number>();
    readonly trainTiles = new Set<number>();
    readonly traffic = new RoadTraffic((tile) => this.crossings.has(tileKey(tile)));
    readonly lastSeen = new Map<number, RoadCar["state"]>();
    clock = START;

    add(...trips: Trip[]): this {
        for (const trip of trips) {
            this.traffic.add(tripRoute(trip), 0, this.clock);
        }
        this.see();
        return this;
    }

    crossingAt(...tiles: TilePosition[]): this {
        for (const tile of tiles) {
            this.crossings.add(tileKey(tile));
        }
        return this;
    }

    // Runs the clock on by the milliseconds given, a frame at a time, checking each frame with check
    run(milliseconds: number, check: () => void = () => undefined): this {
        for (let ran = 0; ran < milliseconds; ran += FRAME) {
            this.clock += FRAME;
            this.traffic.update(this.clock, FRAME, this.trainTiles);
            this.see();
            check();
        }
        return this;
    }

    showing(): RoadCar[] {
        return this.traffic.all.filter(({state}) => state !== "waiting");
    }

    // The cars, by order, that faded out or were dropped waiting to appear, or are still to reach their ends
    notThrough(): number[] {
        return [...this.lastSeen].filter(([order, state]) => state !== "driving" || this.traffic.all.some((car) =>
            car.order === order)).map(([order]) => order);
    }

    private see(): void {
        for (const car of this.traffic.all) {
            this.lastSeen.set(car.order, car.state);
        }
    }
}

// The rectangle a car is painted in, in tiles: CAR_LENGTH of a tile long the way it faces, CAR_BREADTH across, about
// the middle of its place
function body(car: RoadCar): {left: number, top: number, right: number, bottom: number} {
    const {x, y, direction} = carPlace(car.route, car.distance);
    const across = direction === "east" || direction === "west";
    const halfX = (across ? CAR_LENGTH : CAR_BREADTH) / 2;
    const halfY = (across ? CAR_BREADTH : CAR_LENGTH) / 2;
    return {left: x - halfX, top: y - halfY, right: x + halfX, bottom: y + halfY};
}

// Every two cars showing whose painted bodies overlap
function overlaps(road: Road): string[] {
    const cars = road.showing();
    const found: string[] = [];
    for (let i = 0; i < cars.length; i++) {
        for (let j = i + 1; j < cars.length; j++) {
            const [a, b] = [body(cars[i]), body(cars[j])];
            if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) {
                found.push(`cars ${cars[i].order} and ${cars[j].order} at ${cars[i].distance.toFixed(2)} and ` +
                           `${cars[j].distance.toFixed(2)}`);
            }
        }
    }
    return found;
}

// Trips through a crossroads at (10, 10), a road three tiles long each way from it, from each side: straight on,
// turning right and turning left
const FROM_WEST = {straight: [7, 10, "EEEEEE"] as Trip, right: [7, 10, "EEESSS"] as Trip, left: [7, 10, "EEENNN"] as Trip};
const FROM_EAST = {straight: [13, 10, "WWWWWW"] as Trip, right: [13, 10, "WWWNNN"] as Trip, left: [13, 10, "WWWSSS"] as Trip};
const FROM_NORTH = {straight: [10, 7, "SSSSSS"] as Trip, right: [10, 7, "SSSWWW"] as Trip, left: [10, 7, "SSSEEE"] as Trip};
const FROM_SOUTH = {straight: [10, 13, "NNNNNN"] as Trip, right: [10, 13, "NNNEEE"] as Trip, left: [10, 13, "NNNWWW"] as Trip};

// The index of the crossroads on each of those trips' routes
const CROSSROADS = 3;

describe("a car's path through a tile", () => {
    // Quarters: north-west 1, north-east 2, south-west 4, south-east 8. Driving on the right, a car going east keeps to
    // the south half, going north the east half.
    it("keeps to its lane straight on, to one quarter turning right, and crosses the oncoming lane turning left", () => {
        expect(pathQuadrants("east", "east")).toBe(4 | 8);
        expect(pathQuadrants("north", "north")).toBe(8 | 2);
        expect(pathQuadrants("east", "south")).toBe(4);
        expect(pathQuadrants("east", "north")).toBe(4 | 8 | 2);
        expect(pathQuadrants("west", "south")).toBe(2 | 1 | 4);
        expect(pathQuadrants(null, "east")).toBe(4 | 8);
        expect(pathQuadrants("south", null)).toBe(1 | 4);
    });

    it("crosses no oncoming car's going straight on or turning right, and every car's it meets turning left", () => {
        expect(pathQuadrants("east", "east") & pathQuadrants("west", "west")).toBe(0);
        expect(pathQuadrants("east", "south") & pathQuadrants("west", "north")).toBe(0);
        expect(pathQuadrants("east", "north") & pathQuadrants("west", "west")).not.toBe(0);
        expect(pathQuadrants("east", "east") & pathQuadrants("north", "north")).not.toBe(0);
    });
});

describe("the cars on the road", () => {
    it("drive their lanes at four tiles a second where nothing is in the way", () => {
        const road = new Road().add([10, 5, "EEEE"]).run(0);

        road.run(500);

        expect(road.traffic.all[0].distance).toBeCloseTo(CAR_TILES_PER_SECOND * 0.5, 1);
    });

    it("drive no further in one update than LONGEST_DRIVE_MS takes them, after a stall", () => {
        const road = new Road().add([10, 5, "EEEE"]).run(0);
        road.traffic.update(road.clock, 0, road.trainTiles);

        road.clock += 1000;
        road.traffic.update(road.clock, 1000, road.trainTiles);

        expect(road.traffic.all[0].distance).toBeCloseTo(CAR_TILES_PER_SECOND * LONGEST_DRIVE_MS / 1000, 6);
    });

    // Every pair of the twelve ways through the crossroads, the second car starting a little after the first, a frame
    // at a time: no two cars' painted bodies ever overlap, and every car gets through, none fading out or dropped
    it("never overlap where they meet at a junction, whichever ways they come and go", () => {
        const trips = [FROM_WEST, FROM_EAST, FROM_NORTH, FROM_SOUTH].flatMap(({straight, right, left}) => [straight, right, left]);
        const faults: string[] = [];
        for (const first of trips) {
            for (const second of trips) {
                if (first[0] === second[0] && first[1] === second[1]) {
                    continue;
                }
                for (const delay of [0, 120, 240, 400]) {
                    const road = new Road().add(first).run(delay).add(second);
                    road.run(4000, () => faults.push(...overlaps(road).map((fault) => `${first} then ${second} after ${delay}: ${fault}`)));
                    if (road.notThrough().length !== 0) {
                        faults.push(`${first} then ${second} after ${delay}: cars ${road.notThrough()} not through`);
                    }
                }
            }
        }

        expect(faults.slice(0, 10)).toEqual([]);
    });

    // Four cars from each side, every way through: none overlaps any other at any frame, and every one gets through,
    // none fading out or dropped
    it("never overlap at a busy junction, and wait their turns there", () => {
        const road = new Road();
        const faults: string[] = [];
        for (const way of [FROM_WEST, FROM_EAST, FROM_NORTH, FROM_SOUTH]) {
            road.add(way.straight).run(150).add(way.left).run(150).add(way.right).run(150).add(way.straight);
        }

        road.run(20000, () => faults.push(...overlaps(road)));

        expect(faults.slice(0, 10)).toEqual([]);
        expect([road.lastSeen.size, road.notThrough()]).toEqual([16, []]);
    });

    it("wait in the order they came where their paths cross", () => {
        // A car from the west turning right stands in the crossroads, short of a train at (10, 11), its path crossing
        // the path of one from the north going straight on, which waits for it; one from the east going straight on
        // comes after, whose path crosses the second's but not the first's, and waits behind the second, which came
        // first, though nothing in the crossroads is in its way. Once the train has gone, the first goes on, then the
        // second, then the third, each through once its back clears the crossroads.
        const road = new Road();
        road.trainTiles.add(tileKey({x: 10, y: 11}));
        road.add(FROM_WEST.right, FROM_NORTH.straight).run(1000).add(FROM_EAST.straight).run(1000);
        const through: number[] = [];

        expect(road.traffic.all.map(({distance}) => distance < CROSSROADS)).toEqual([false, true, true]);
        road.trainTiles.clear();
        road.run(3000, () => {
            for (const car of road.traffic.all) {
                if (car.distance > CROSSROADS + 0.5 + CAR_GAP / 2 && !through.includes(car.order)) {
                    through.push(car.order);
                }
            }
        });

        expect(through).toEqual([0, 1, 2]);
    });

    it("queue behind a car stopped ahead of them, each keeping its gap", () => {
        // A crossing at (14, 5), four tiles on, a train is on: the first car stops short of it, and the rest behind it
        const road = new Road().crossingAt({x: 14, y: 5});
        road.trainTiles.add(tileKey({x: 14, y: 5}));
        for (let i = 0; i < 3; i++) {
            road.add([10, 5, "EEEEEE"]).run(400);
        }

        road.run(2000);

        const distances = road.traffic.all.map(({distance}) => distance);
        expect(distances.length).toBe(3);
        expect(distances[0]).toBeCloseTo(stopsShortOf(4), 6);
        expect(distances[0] - distances[1]).toBeCloseTo(CAR_GAP, 1);
        expect(distances[1] - distances[2]).toBeCloseTo(CAR_GAP, 1);
    });

    it("wait at a level crossing while a train is on it, and drive on once it has gone", () => {
        // The crossing at (12, 5), two tiles on
        const road = new Road().crossingAt({x: 12, y: 5});
        const crossing = tileKey({x: 12, y: 5});
        road.trainTiles.add(crossing);
        road.add([10, 5, "EEEE"]).run(2000);

        const waited = road.traffic.all[0].distance;
        road.trainTiles.delete(crossing);
        road.run(1500);

        expect(waited).toBeCloseTo(stopsShortOf(2), 6);
        expect(road.traffic.count).toBe(0);
    });

    it("take a level crossing only with room past it, and never stand on one", () => {
        // A crossing at (12, 5), two tiles on, and a train at (14, 5) that the first car stops short of: the second
        // stops behind it, its back just past the crossing, and the third, which would stand on the crossing behind
        // the second, waits short of it
        const road = new Road().crossingAt({x: 12, y: 5});
        road.trainTiles.add(tileKey({x: 14, y: 5}));
        for (let i = 0; i < 3; i++) {
            road.add([10, 5, "EEEEEE"]).run(400);
        }
        road.run(2000);

        expect(road.traffic.all.map(({distance}) => distance))
            .toEqual([stopsShortOf(4), stopsShortOf(4) - CAR_GAP, stopsShortOf(2)]);
    });

    it("take a level crossing with the tile past it, so nothing turning in there stops them on it", () => {
        // A crossing at (12, 5), two tiles on: about a tile on, the car has taken it and the tile past it, (13, 5),
        // which it would take alone only from braking distance short of where it would stop for it
        const road = new Road().crossingAt({x: 12, y: 5});
        road.add([10, 5, "EEEE"]).run(250);
        const [car] = road.traffic.all;

        expect(car.distance).toBeLessThan(stopsShortOf(3) - CAR_BRAKING);
        expect(car.lastHeld).toBe(3);
    });

    it("fade out once they have stood still for a few seconds, and are gone", () => {
        // The car stands short of the crossing at (12, 5) from about a second on
        const road = new Road();
        road.trainTiles.add(tileKey({x: 12, y: 5}));
        road.add([10, 5, "EEEE"]).run(1000);
        const {distance, stood} = road.traffic.all[0];

        road.run(CAR_WAIT_MS - stood - 50);
        expect(road.traffic.all.map((car) => [car.state, car.distance])).toEqual([["driving", distance]]);
        road.run(100);
        const fading = road.traffic.all[0];
        expect(fading.state).toBe("fading");
        expect(carOpacity(fading, road.clock)).toBeLessThan(1);

        road.run(CAR_FADE_MS);
        expect(road.traffic.count).toBe(0);
    });

    it("wait to appear while their first tile is taken, and are dropped if they can't within a few seconds", () => {
        // The first car stands on its first tile, short of the crossing at (11, 5), where the second's starts
        const road = new Road();
        road.trainTiles.add(tileKey({x: 11, y: 5}));
        road.add([10, 5, "EEEE"]).run(500).add([10, 5, "EEEE"]);

        road.run(CAR_WAIT_MS - 200);
        expect(road.traffic.all.map(({state}) => state)).toEqual(["driving", "waiting"]);

        road.run(400);
        expect(road.traffic.all.map(({order}) => order)).toEqual([0]);
    });

    it("stand where they are while the clock stands, as the end-to-end suite fixes it", () => {
        const road = new Road().add([10, 5, "EEEE"], [10, 5, "EEEE"], [20, 5, "WW"]);

        for (let i = 0; i < 100; i++) {
            road.traffic.update(road.clock, 0, road.trainTiles);
        }

        expect(road.traffic.all.map(({state, distance}) => [state, distance]))
            .toEqual([["driving", 0], ["waiting", 0], ["driving", 0]]);
    });

    it("drive as one alone does among cars on other roads", () => {
        // Two hundred cars on rows far apart: none slows another
        const road = new Road();
        for (let row = 0; row < 200; row++) {
            road.add([0, row * 3, "EEEEEEEE"]);
        }

        road.run(1000);

        expect(new Set(road.traffic.all.map(({distance}) => distance.toFixed(6))).size).toBe(1);
    });
});

describe("a car taken off the road", () => {
    it("is gone at once, with no fade", () => {
        const road = new Road().add([10, 5, "EEEE"]).run(200);

        road.traffic.remove(road.traffic.all[0]);

        expect(road.traffic.count).toBe(0);
    });

    it("can't be taken off again", () => {
        const road = new Road().add([10, 5, "EEEE"]).run(200);
        const [car] = road.traffic.all;
        road.traffic.remove(car);

        expect(() => road.traffic.remove(car)).toThrow("Car 0 is not on the road");
    });

    it("lets the cars queued behind it in its lane drive on", () => {
        // A train at (14, 5) the first of three cars stops short of, the other two behind it, each its gap behind the
        // car ahead: once the first is gone, the second drives up to where the first stood
        const road = new Road();
        road.trainTiles.add(tileKey({x: 14, y: 5}));
        for (let i = 0; i < 3; i++) {
            road.add([10, 5, "EEEEEE"]).run(400);
        }
        road.run(2000);

        road.traffic.remove(road.traffic.all[0]);
        road.run(1000);

        const distances = road.traffic.all.map(({distance}) => distance);
        expect(distances[0]).toBeCloseTo(stopsShortOf(4), 6);
        expect(distances[0] - distances[1]).toBeCloseTo(CAR_GAP, 1);
    });

    it("lets a car waiting to appear on its first tile appear", () => {
        // The first car stands on its first tile, short of a train at (11, 5), and the second waits to appear there
        const road = new Road();
        road.trainTiles.add(tileKey({x: 11, y: 5}));
        road.add([10, 5, "EEEE"]).run(500).add([10, 5, "EEEE"]).run(500);

        road.traffic.remove(road.traffic.all[0]);
        road.run(FRAME);

        expect(road.traffic.all.map(({order, state}) => [order, state])).toEqual([[1, "driving"]]);
    });

    it("lets the cars that came to wait for a tile after it take it", () => {
        // The first car stands on its first tile, short of a train at (11, 5); the second waits to appear there, and
        // the third, which turns south there across the second's path, waits after it. With the second gone, the third
        // takes the tile once the first has driven off it.
        const road = new Road();
        road.trainTiles.add(tileKey({x: 11, y: 5}));
        road.add([10, 5, "EEEEEEEE"]).run(500).add([10, 5, "EEEE"]).run(200).add([10, 5, "SSSS"]).run(200);

        road.traffic.remove(road.traffic.all[1]);
        road.trainTiles.clear();
        road.run(1000);

        expect(road.traffic.all.map(({order, state}) => [order, state])).toEqual([[0, "driving"], [2, "driving"]]);
    });
});
