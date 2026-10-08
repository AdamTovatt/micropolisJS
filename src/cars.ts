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

import type { CarShareStep } from "./carShare";
import { SPRITE_PIXELS_PER_TILE } from "./paintable";
import type { Ride, TilePosition, Trip } from "./protocol";
import { RoadTraffic, carOpacity } from "./roadTraffic";
import type { RoadCar } from "./roadTraffic";
import { directionOf, stepOf, tripRoute } from "./routeTiles";
import type { CarDirection } from "./routeTiles";
import { Trains, carriagesShown, tilesOf } from "./trains";
import type { TileRect } from "./viewPosition";

// The cars the client draws for the city's traffic: each trip a trips message brings (protocol/README.md) becomes a car
// that drives its route once in the right-hand lane, among the other cars (roadTraffic.ts), and is gone at its end, and
// each ride a seat in a carriage of a train on the right-hand track, which leaves its station at the departure the ride
// boards (trains.ts). Cars are the client's alone: never simulation sprites, never saved and never in a command log. They move
// on their own drive clock, which follows the client's, the one tile animation uses, while the city runs, and which the
// end-to-end suite fixes, so there cars stand at the starts of their routes and trains at their stations.

// The most cars driving at once when every trip becomes one, a share of it at a smaller share of them, a train's
// carriages counted each, and the cars waiting to appear and fading out. A car or a carriage that arrives while that
// many drive is dropped, but for a car near the main map's view (Cars.add), and a ride that has a seat in a carriage
// its train has (Cars.addRides).
export const MAX_CARS = 2000;

// How far round the tiles the main map's view shows a car counts as near it, in tiles
export const VIEW_MARGIN = 8;

// The tiles near a view: those it shows, and VIEW_MARGIN more on every side
export function nearView(shown: TileRect): TileRect {
  return {left: shown.left - VIEW_MARGIN, top: shown.top - VIEW_MARGIN,
          right: shown.right + VIEW_MARGIN, bottom: shown.bottom + VIEW_MARGIN};
}

// How far, in tiles, the nearest of a route's tiles from the index given to its end lies from the tiles given, as a
// king moves: 0 where one of them is among those tiles
export function distanceFrom(route: readonly TilePosition[], from: number, tiles: TileRect): number {
  let least = Infinity;
  for (let index = from; index < route.length && least > 0; index++) {
    const {x, y} = route[index];
    least = Math.min(least, Math.max(tiles.left - x, x - tiles.right, tiles.top - y, y - tiles.bottom, 0));
  }
  return least;
}

// The most cars driving at once at the step of the Cars slider given: MAX_CARS times its share, and none at Off
export function carCap(step: CarShareStep): number {
  return step.every === null ? 0 : MAX_CARS / step.every;
}

// Whether the trip that arrived index trips after the page joined becomes a car at the step of the Cars slider given:
// every k-th from the first, k being the step's every, and none at Off
export function takesTrip(index: number, step: CarShareStep): boolean {
  return step.every !== null && index % step.every === 0;
}

// Whether the rides board trains at the step of the Cars slider given: every one of them, at every step but Off
export function takesRides(step: CarShareStep): boolean {
  return step.every !== null;
}

// How far right of the middle of the road a car drives, in tiles: the middle of the road's right-hand lane, as the art
// paints it (LANE in art/blender/tilesets.py)
export const LANE_OFFSET = 0.1;

// How far right of the middle of the rail a train runs, in tiles: the middle of the right-hand track of the double
// track, as the art lays it (TRACK in art/blender/tilesets.py)
export const TRACK_OFFSET = 0.2;

// The side of the square a car is drawn in, in map pixels, at 16 a tile: a tile, as its art's frame is
export const CAR_PIXELS = 16;

// Where a car is: the point of the map under its middle, in tiles from the map's top-left corner, and the way it faces
export interface CarPlace {
  x: number;
  y: number;
  direction: CarDirection;
}

// A car as a view draws it: the square it is drawn in, width map pixels a side with its top-left corner at map pixel
// (x, y), and the way it faces; a car on the road in its colour, by its number from 0, which its route picks, as much of
// it showing as its opacity, from 1 down to 0 as it fades out, and a carriage of a train in the trains' art
interface CarSquare {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly direction: CarDirection;
}

export interface PaintableRoadCar extends CarSquare {
  readonly kind: "road";
  readonly colour: number;
  readonly opacity: number;
}

export interface PaintableTrainCar extends CarSquare {
  readonly kind: "rail";
}

export type PaintableCar = PaintableRoadCar | PaintableTrainCar;

// A colour cars come in: its name, by which the render manifest names its art (docs/render-assets.md), and the flat
// colour, red, green and blue from 0 to 1, a car is drawn in where the manifest has no art for it
export interface CarColour {
  readonly name: string;
  readonly flat: readonly [number, number, number];
}

// The colours cars come in, a car's colour its number in this list: the render manifest's art for a car is found by
// its colour's name, which the art build writes (CAR_COLOURS in art/tools/designs.py)
export const CAR_COLOURS: readonly CarColour[] = [
  {name: "red", flat: [0.85, 0.2, 0.15]},
  {name: "blue", flat: [0.15, 0.4, 0.85]},
  {name: "yellow", flat: [0.95, 0.8, 0.2]},
  {name: "white", flat: [0.95, 0.95, 0.95]},
  {name: "green", flat: [0.15, 0.4, 0.25]},
  {name: "orange", flat: [0.95, 0.5, 0.15]},
];

// The offset from the middle of a road or rail to the right of it, for something going the way given: a quarter turn
// clockwise from the way it goes, the distance given long
function rightOf(direction: CarDirection, distance: number): {x: number, y: number} {
  const step = stepOf(direction);
  return {x: -step.y * distance, y: step.x * distance};
}

// The point right of the middle a car or a train passes at the route's tile, its index given, the offset given: the
// tile's middle moved right of the way it comes in and goes out, and at a turn right of both, where they cross. A route
// never turns back on itself, since a drive or a ride never goes the way it came.
function sidePoint(route: readonly TilePosition[], index: number, offset: number): {x: number, y: number} {
  const tile = route[index];
  const incoming = index > 0 ? directionOf(route[index - 1], tile) : null;
  const outgoing = index < route.length - 1 ? directionOf(tile, route[index + 1]) : null;
  const point = {x: tile.x + 0.5, y: tile.y + 0.5};

  for (const direction of incoming === outgoing ? [incoming] : [incoming, outgoing]) {
    if (direction !== null) {
      const right = rightOf(direction, offset);
      point.x += right.x;
      point.y += right.y;
    }
  }

  return point;
}

// Where something on a route is, distance tiles from its start, and the way it faces, passing each tile offset right of
// its middle. A route has two tiles at least, and the distance runs from 0 to one less than its tiles.
function placeOn(route: readonly TilePosition[], distance: number, offset: number): CarPlace {
  const segment = Math.min(Math.floor(distance), route.length - 2);
  const along = distance - segment;
  const from = sidePoint(route, segment, offset);
  const to = sidePoint(route, segment + 1, offset);

  return {x: from.x + (to.x - from.x) * along, y: from.y + (to.y - from.y) * along,
          direction: directionOf(route[segment], route[segment + 1])};
}

// Where a car is on its route, distance tiles from its start, and the way it faces: in its right-hand lane
export function carPlace(route: readonly TilePosition[], distance: number): CarPlace {
  return placeOn(route, distance, LANE_OFFSET);
}

// Where a carriage of a train is on its path, distance tiles from its start, and the way it faces: on the right-hand
// track
export function trainPlace(route: readonly TilePosition[], distance: number): CarPlace {
  return placeOn(route, distance, TRACK_OFFSET);
}

// The colour a car takes from its route: the same for every car from its start
export function carColour(route: readonly TilePosition[]): number {
  const {x, y} = route[0];
  return (x * 7 + y * 13) % CAR_COLOURS.length;
}

// The cars and trains: their own drive clock, which moves on with the client's while the city runs and stands while
// it's paused, so each stands still while the city is paused and picks up again when it runs. Which trips become cars,
// and whether rides board trains at all, is the step of the Cars slider the player chose (CarSharePreference), read as
// each trips message arrives, so a smaller share starts fewer from then on and every one already driving finishes its
// route, but one whose place a car near the view takes (add).
export class Cars {
  private readonly road: RoadTraffic;
  private readonly trains = new Trains();
  // The drive clock, in milliseconds, and the client's clock as it was last read, or null before then
  private clock = 0;
  private lastNow: number | null = null;
  // The trips that arrived since the page last joined the city, those that became cars or not alike
  private arrived = 0;

  // share is the step of the Cars slider, as the player has it now, isCrossing says whether a tile of the map is a
  // level crossing, and view is the tiles the main map's view shows now
  constructor(private readonly share: () => CarShareStep, isCrossing: (tile: TilePosition) => boolean,
              private readonly view: () => TileRect) {
    this.road = new RoadTraffic(isCrossing);
  }

  // The page joined the city, at its start or again after a reconnect: the trips are counted from here
  joined(): void {
    this.arrived = 0;
  }

  // A car for each trip a trips message brings that the step takes (takesTrip), which waits to appear at the trip's
  // start, in order, while fewer than the step's cap drive (carCap). With that many, a car near the view takes the
  // place of one far from it, if any (FarCars.giveWayTo); past it, as after the share went down, one car's place leaves
  // no room under the cap, so the car is dropped, as any other is. A trip of no steps has nowhere to drive.
  add(trips: readonly Trip[]): void {
    const step = this.share();
    const cap = carCap(step);
    const farCars = new FarCars(this.view, this.road);
    for (const trip of trips) {
      const index = this.arrived++;
      if (!takesTrip(index, step)) {
        continue;
      }
      const route = tripRoute(trip);
      if (route.length > 1 && (this.carsHeld() + 1 <= cap || (this.carsHeld() === cap && farCars.giveWayTo(route)))) {
        this.road.add(route, carColour(route), this.clock);
      }
    }
  }

  // A seat for each ride a trips message brings, at every step but Off, which takes none (takesRides), in the train its
  // departure, its station and the way it leaves make (Trains.board), which leaves at the departure, timed from the
  // city's step clock as the batch that brought the rides carried it. A ride boards a carriage its train has whatever
  // the cap, and one its train adds while fewer than the step's cap drive (carCap), a carriage counting as a car; with
  // that many, a ride that needs a new carriage is dropped. A carriage carries up to RIDES_PER_CARRIAGE rides, so trains
  // show about a tenth of the rides, as cars on the road at the slider's 10%. A ride of no steps has nowhere to run.
  addRides(rides: readonly Ride[], stepClock: number): void {
    const step = this.share();
    if (!takesRides(step)) {
      return;
    }
    const cap = carCap(step);
    for (const ride of rides) {
      if (ride[2].length > 0) {
        this.trains.board(ride, {drive: this.clock, steps: stepClock}, () => this.carsHeld() + 1 <= cap);
      }
    }
  }

  // Moves the drive clock on to the client's clock now, in milliseconds, unless the city is paused, then the trains,
  // and the cars about them
  advance(now: number, paused: boolean): void {
    const elapsed = this.lastNow !== null && !paused ? Math.max(0, now - this.lastNow) : 0;
    this.lastNow = now;
    this.clock += elapsed;

    this.trains.update(this.clock);
    const trainTiles = new Set<number>();
    for (const train of this.trains.all) {
      tilesOf(train, this.clock, trainTiles);
    }
    this.road.update(this.clock, elapsed, trainTiles);
  }

  // How far each car on the road and the front of each train has gone, in tiles, as the drive clock last moved it:
  // the cars showing, not those waiting to appear
  driven(): number[] {
    return [...this.road.all.filter(({state}) => state !== "waiting").map(({distance}) => distance),
            ...this.trains.all.map((train) => carriagesShown(train, this.clock)[0] ?? 0)];
  }

  // Each car showing, and each car of each train on its path, as a view draws it
  paintable(): PaintableCar[] {
    const painted: PaintableCar[] = [];
    for (const car of this.road.all) {
      if (car.state === "waiting") {
        continue;
      }
      const {x, y, direction} = carPlace(car.route, car.distance);
      painted.push({kind: "road", ...square(x, y), direction, colour: car.colour,
                    opacity: carOpacity(car, this.clock)});
    }
    for (const train of this.trains.all) {
      for (const at of carriagesShown(train, this.clock)) {
        const {x, y, direction} = trainPlace(train.path, at);
        painted.push({kind: "rail", ...square(x, y), direction});
      }
    }
    return painted;
  }

  // How many cars are held: on the road, waiting to appear or fading, and of trains, which the cap counts
  carsHeld(): number {
    return this.road.count + this.trains.carriages;
  }
}

// The cars on the road far from the main map's view, whose places cars near it take while the most drive, as a batch
// of trips arrives: the tiles near the view, and the cars far from them, are found the first time each is needed, and
// hold for the rest of the batch, since no car drives on while it arrives and every car it adds once the most drive is
// near the view
class FarCars {
  private near: TileRect | null = null;
  // The cars far from the view, the farthest last, and of those as far the one added first last
  private far: RoadCar[] | null = null;

  // view is the tiles the main map's view shows now
  constructor(private readonly view: () => TileRect, private readonly road: RoadTraffic) {}

  // For a car on the route given with a tile near the view (nearView), takes the car on the road farthest from it off
  // the road at once, and says whether it did: where one has none of the rest of its route near the view, from where it
  // is, or its start while it waits to appear (distanceFrom), so a car still driving into the view is never taken off.
  // Of cars as far, the one added first goes.
  giveWayTo(route: readonly TilePosition[]): boolean {
    const near = this.near ??= nearView(this.view());
    if (distanceFrom(route, 0, near) > 0) {
      return false;
    }
    this.far ??= farFrom(this.road.all, near);
    const farthest = this.far.pop();
    if (farthest === undefined) {
      return false;
    }
    this.road.remove(farthest);
    return true;
  }
}

// The cars given with none of the rest of their routes among the tiles given, the farthest from them last, and of those
// as far the one added first last
function farFrom(cars: readonly RoadCar[], tiles: TileRect): RoadCar[] {
  const far: {car: RoadCar, distance: number}[] = [];
  for (const car of cars) {
    const distance = distanceFrom(car.route, Math.floor(car.distance), tiles);
    if (distance > 0) {
      far.push({car, distance});
    }
  }
  far.sort((a, b) => a.distance - b.distance || b.car.order - a.car.order);
  return far.map(({car}) => car);
}

// The square a car is drawn in, whose middle is the point of the map (x, y), in tiles
function square(x: number, y: number): {x: number, y: number, width: number} {
  return {x: x * SPRITE_PIXELS_PER_TILE - CAR_PIXELS / 2, y: y * SPRITE_PIXELS_PER_TILE - CAR_PIXELS / 2,
          width: CAR_PIXELS};
}
