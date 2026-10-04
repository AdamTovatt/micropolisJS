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

// The traces conformance/traces/ holds (conformance/README.md): each a fixture's city, the tiles and sprites a layout
// no fixture builds needs, and the calls it makes, which name what they must reach so the generator fails when a
// trace stops reaching it.

import * as Messages from "../src/messages";
import * as SpriteConstants from "../src/spriteConstants";
import { TileUtils } from "../src/tileUtils.js";
import { BIT_MASK, BULLBIT, BURNBIT, CONDBIT, POWERBIT, ZONEBIT } from "../src/tileFlags";
import {
  AIRPORT, CHANNEL, DIRT, FIRSTRIVEDGE, HBRIDGE, HPOWER, HRAIL, LHRAIL, LVRAIL, PORT, RADAR, RADAR0, RAILHPOWERV, RIVER,
} from "../src/tileValues";
import { SavedMap } from "./savedMap";
import { ensure, TraceCity, TraceDefinition, TraceTile } from "./traces";

// The first tile, column by column, the predicate holds for
function findTile(city: TraceCity, predicate: (value: number, isZone: boolean) => boolean): [number, number] {
  for (let x = 0; x < city._map.width; x++) {
    for (let y = 0; y < city._map.height; y++) {
      const tile = city._map.getTile(x, y);
      if (predicate(tile.getValue(), tile.isZone())) {
        return [x, y];
      }
    }
  }

  throw new Error("The trace's city has no such tile");
}

// The tiles of the saved map, column by column, whose raw value the predicate holds for
function filterIn(map: SavedMap, predicate: (raw: number) => boolean): [number, number][] {
  const found: [number, number][] = [];
  for (let x = 0; x < map.width; x++) {
    for (let y = 0; y < map.height; y++) {
      if (predicate(map.getRawValue(x, y))) {
        found.push([x, y]);
      }
    }
  }
  return found;
}

// The saved map's airport, its centre's position and raw value
function savedAirport(map: SavedMap): {x: number, y: number, raw: number} {
  const [x, y] = filterIn(map, (raw) => (raw & BIT_MASK) === AIRPORT && (raw & ZONEBIT) !== 0)[0];
  return {x, y, raw: map.getRawValue(x, y)};
}

// Each tile set to the value, over the raw value the saved map has there
function over(map: SavedMap, expected: number, tiles: TraceTile[]): TraceTile[] {
  for (const {x, y} of tiles) {
    if (map.getRawValue(x, y) !== expected) {
      throw new Error(`The trace's tile (${x}, ${y}) is ${map.getRawValue(x, y)}, not ${expected}`);
    }
  }
  return tiles;
}

// A sprite as a save holds it, at the pixel (x, y), with the fields given and 0 in the rest
function savedSprite(type: number, x: number, y: number, fields: Record<string, number>): Record<string, number> {
  return {
    type, frame: 0, x, y, origX: 0, origY: 0, destX: 0, destY: 0, count: 0, soundCount: 0, dir: 0, newDir: 0, step: 0,
    flag: 0, ...fields,
  };
}

// A land tile west of the town on seed 8's map: a monster rising from it stands on dirt, with its hot spot five tiles
// east and one south, and walks east into the town, to the most polluted place
const MONSTER_START: [number, number] = [14, 30];

// Rail as the rail tool lays it on land, and over water: a train reads only whether a tile is rail, and which
const LAND_RAIL_H = LHRAIL | BULLBIT | BURNBIT;
const LAND_RAIL_V = LVRAIL | BULLBIT | BURNBIT;
const RAIL_BRIDGE = HRAIL | BULLBIT;

// Spare land in the corner of seed 8's map, where the railway trace lays a loop of rail, which bends at each corner,
// with a rail bridge on its top side; and a rail tile alone on the map's west edge
const LOOP = {left: 3, top: 3, right: 8, bottom: 6};
const LONE_RAIL: [number, number] = [0, 30];

function railLoop(): TraceTile[] {
  const tiles: TraceTile[] = [];
  for (let x = LOOP.left; x <= LOOP.right; x++) {
    tiles.push({x, y: LOOP.top, value: x === LOOP.left + 2 ? RAIL_BRIDGE : LAND_RAIL_H});
    tiles.push({x, y: LOOP.bottom, value: LAND_RAIL_H});
  }
  for (let y = LOOP.top + 1; y < LOOP.bottom; y++) {
    tiles.push({x: LOOP.left, y, value: LAND_RAIL_V});
    tiles.push({x: LOOP.right, y, value: LAND_RAIL_V});
  }
  return tiles;
}

// Two river tiles on seed 8's map, where the collisions trace builds what a monster and a tornado wreck: a wire over
// the river, burnable, which no tool lays, so the wreck finds it wet; and a bridge, the one road that doesn't burn
const WIRE_OVER_RIVER: [number, number] = [84, 40];
const BRIDGE: [number, number] = [84, 51];

// Four tiles of land along the map's edges, each a channel in the shipEdges trace, with land around it
const EDGE_CHANNELS: [number, number][] = [[60, 0], [0, 50], [60, 99], [119, 50]];

// Where the bareMap trace sets a seaport's centre
const BARE_PORT: [number, number] = [60, 50];

// The hard level's chance of a random disaster, one draw up to it coming up 0 (DisChance in src/disasterManager.js)
const HARD_DISASTER_CHANCE = 60;

// The collisions trace's sprites, in the order they move
function collisionSprites(): Record<string, number>[] {
  // The monster's hot spot is the middle of the wire's tile's west edge, and the point it wrecks the tile's middle
  const [wireX, wireY] = WIRE_OVER_RIVER;
  const [monsterX, monsterY] = [wireX * 16 - 40, wireY * 16 - 8];
  // The point the tornado wrecks is the middle of the bridge's tile
  const [bridgeX, bridgeY] = BRIDGE;

  return [
    savedSprite(SpriteConstants.SPRITE_HELICOPTER, 1000, 1200, {frame: 5, count: 1, soundCount: 10, origX: 200, origY: 200}),
    savedSprite(SpriteConstants.SPRITE_MONSTER, monsterX, monsterY,
                {frame: 1, count: 1000, destX: 256, destY: 384, origX: monsterX, origY: monsterY}),
    // Each with its hot spot on the monster's
    savedSprite(SpriteConstants.SPRITE_TRAIN, monsterX, monsterY + 24, {frame: 1, dir: 1}),
    savedSprite(SpriteConstants.SPRITE_SHIP, monsterX - 8, monsterY + 16, {frame: 3, newDir: 3, dir: 7, count: 5}),
    savedSprite(SpriteConstants.SPRITE_AIRPLANE, monsterX - 8, monsterY, {frame: 3}),
    savedSprite(SpriteConstants.SPRITE_TORNADO, bridgeX * 16 - 40, bridgeY * 16 - 32, {frame: 1, count: 200}),
  ];
}

export const TRACES: TraceDefinition[] = [
  {
    // The railway's trains, with the population a train needs: the rail handler is called until one sets out, then
    // the train runs along the line and back, and the handler is called again now and then, to send out the next
    name: "trains", fixture: "town", point: "run", changes: {"census.totalPop": 100},
    async run(trace) {
      const rail = findTile(trace.city, (value) => TileUtils.isRail(value));
      while (!trace.alive(SpriteConstants.SPRITE_TRAIN)) {
        ensure(trace.calls.length < 500, "trains", "a train");
        await trace.call("transport.railFound", ...rail);
      }
      for (let i = 0; i < 12; i++) {
        await trace.moves(100);
        await trace.call("transport.railFound", ...rail);
      }
    },
  },
  {
    // The airport's plane and helicopter, with disasters on, so they may collide: the airport's handler is called now
    // and then, to start the radar, which stands still, and send out the next. The town's sprites are cleared, so each
    // aircraft is one the handler sent out, and it runs until a helicopter has flown its 1500 passes and landed home,
    // and a plane has flown.
    name: "aircraft", fixture: "town", point: "run", changes: {"disasters.disastersEnabled": true, "sprites.list": []},
    tiles(map) {
      const airport = savedAirport(map);
      return [{x: airport.x + 1, y: airport.y - 1, value: RADAR | CONDBIT | BURNBIT}];
    },
    async run(trace) {
      const airport = findTile(trace.city, (value, isZone) => value === AIRPORT && isZone);
      await trace.call("transport.airportFound", ...airport);
      ensure(trace.tileValue(airport[0] + 1, airport[1] - 1) === RADAR0, "aircraft", "the radar starting");
      let planeFlew = false;
      let landed = false;
      while (!(planeFlew && landed)) {
        ensure(trace.calls.length < 6000, "aircraft", "a plane flying and a helicopter landing");
        await trace.call("transport.airportFound", ...airport);
        for (let i = 0; i < 25; i++) {
          const flying = trace.alive(SpriteConstants.SPRITE_HELICOPTER);
          await trace.moves(1);
          landed = landed || (flying && !trace.alive(SpriteConstants.SPRITE_HELICOPTER) &&
                              !trace.heardLast(Messages.HELICOPTER_CRASHED));
        }
        planeFlew = planeFlew || trace.alive(SpriteConstants.SPRITE_AIRPLANE);
      }
    },
  },
  {
    // An airport without power: its handler stops the radar
    name: "unpoweredAirport", fixture: "town", point: "run", changes: {},
    tiles(map) {
      const airport = savedAirport(map);
      return [{x: airport.x, y: airport.y, value: airport.raw & ~POWERBIT}];
    },
    async run(trace) {
      const airport = findTile(trace.city, (value, isZone) => value === AIRPORT && isZone);
      await trace.call("transport.airportFound", ...airport);
      ensure(trace.tileValue(airport[0] + 1, airport[1] - 1) === RADAR, "unpoweredAirport", "the radar stopping");
    },
  },
  {
    // The harbour's ship, from the channel on the map's top edge, sailing the river, the port's handler called now and
    // then. The fixture's ship is cleared, so the ship is one the handler sent out.
    name: "ships", fixture: "harbour", point: "run", changes: {"sprites.list": []},
    async run(trace) {
      const port = findTile(trace.city, (value, isZone) => value === PORT && isZone);
      while (!trace.alive(SpriteConstants.SPRITE_SHIP)) {
        ensure(trace.calls.length < 100, "ships", "a ship");
        await trace.call("transport.portFound", ...port);
      }
      for (let i = 0; i < 20; i++) {
        await trace.moves(50);
        await trace.call("transport.portFound", ...port);
      }
      ensure(trace.alive(SpriteConstants.SPRITE_SHIP), "ships", "a ship sailing");
    },
  },
  {
    // A ship from a channel on each of the map's edges, which the port sends out in turn: the trace clears the
    // channels the map has on its edges and sets one alone, with land around, on each. Each ship looks for water on
    // its first pass, finds none, and wrecks, so the port sends out the next.
    name: "shipEdges", fixture: "harbour", point: "run", changes: {"sprites.list": []},
    tiles(map) {
      const onEdge = (x: number, y: number) => x === 0 || y === 0 || x === map.width - 1 || y === map.height - 1;
      const edgeChannels = filterIn(map, (raw) => raw === CHANNEL).filter(([x, y]) => onEdge(x, y));
      return [
        ...edgeChannels.map(([x, y]) => ({x, y, value: RIVER})),
        ...over(map, DIRT, EDGE_CHANNELS.map(([x, y]) => ({x, y, value: CHANNEL}))),
      ];
    },
    async run(trace) {
      const port = findTile(trace.city, (value, isZone) => value === PORT && isZone);
      // A ship's first frame is the direction it sails away from its edge: east from the west edge, 3; south from the
      // top, 5; west from the east edge, 7; north from the bottom, 1
      const firstFrames = new Set<number>();
      while (firstFrames.size < 4) {
        ensure(trace.calls.length < 2000, "shipEdges", "a ship from each edge");
        await trace.call("transport.portFound", ...port);
        if (trace.alive(SpriteConstants.SPRITE_SHIP)) {
          firstFrames.add(trace.frame(SpriteConstants.SPRITE_SHIP));
          await trace.moves(1);
          ensure(trace.heardLast(Messages.SHIP_CRASHED), "shipEdges", "a ship wrecking");
        }
      }
    },
  },
  {
    // Trains on a loop of rail laid on the town's spare land, with a bend at each corner and a bridge, and on a rail
    // tile alone on the map's edge: the lone tile's train finds no track on its first search, beside the edge, and
    // dies; the loop's runs around the loop
    name: "railway", fixture: "town", point: "run", changes: {"census.totalPop": 100, "sprites.list": []},
    tiles(map) {
      return over(map, DIRT, [...railLoop(), {x: LONE_RAIL[0], y: LONE_RAIL[1], value: LAND_RAIL_H}]);
    },
    async run(trace) {
      while (!trace.alive(SpriteConstants.SPRITE_TRAIN)) {
        ensure(trace.calls.length < 500, "railway", "a train on the lone tile");
        await trace.call("transport.railFound", ...LONE_RAIL);
      }
      await trace.moves(4);
      ensure(!trace.alive(SpriteConstants.SPRITE_TRAIN), "railway", "a train dying");

      while (!trace.alive(SpriteConstants.SPRITE_TRAIN)) {
        ensure(trace.calls.length < 1000, "railway", "a train on the loop");
        await trace.call("transport.railFound", LOOP.left, LOOP.top);
      }
      // A train shows frame 3 and 4 at the two kinds of bend, and 5 underwater, on the bridge
      const frames = new Set<number>();
      while (![3, 4, 5].every((frame) => frames.has(frame))) {
        ensure(trace.calls.length < 2000, "railway", "a train turning both ways and crossing the bridge");
        await trace.moves(1);
        frames.add(trace.frame(SpriteConstants.SPRITE_TRAIN));
      }
    },
  },
  {
    // Rail decaying with the roads underfunded, their effect at nothing: the rail handler is called on a rail bridge
    // until it falls into the river, on rail until it falls to rubble, and on rail carrying a wire, which never decays,
    // until it has been drawn to decay
    name: "railDecay", fixture: "underfunded", point: "run", changes: {"budget.roadEffect": 0},
    tiles(map) {
      const [[bridgeX, bridgeY], , [wiredX, wiredY]] = filterIn(map, (raw) => (raw & BIT_MASK) === LHRAIL);
      return [
        {x: bridgeX, y: bridgeY, value: RAIL_BRIDGE},
        {x: wiredX, y: wiredY, value: RAILHPOWERV | CONDBIT | BURNBIT | BULLBIT},
      ];
    },
    async run(trace) {
      const [bridge, wired] = trace.tiles.map(({x, y}): [number, number] => [x, y]);
      const rail = findTile(trace.city, (value) => value === LHRAIL);

      while (trace.tileValue(...bridge) !== RIVER) {
        ensure(trace.calls.length < 4000, "railDecay", "a rail bridge decaying");
        await trace.call("transport.railFound", ...bridge);
      }
      while (TileUtils.isRail(trace.tileValue(...rail))) {
        ensure(trace.calls.length < 8000, "railDecay", "rail decaying");
        await trace.call("transport.railFound", ...rail);
      }
      // The handler asks whether the tile carries a wire only once it has drawn the decay
      const asked = trace.spying(trace.city._map.getTile(...wired), "isConductive");
      while (asked.length === 0) {
        ensure(trace.calls.length < 12000, "railDecay", "rail carrying a wire, drawn to decay");
        await trace.call("transport.railFound", ...wired);
      }
      ensure(trace.tileValue(...wired) === RAILHPOWERV, "railDecay", "rail carrying a wire holding");
    },
  },
  {
    // A monster from the river, which may drown at once, and one from land, which walks into the town, wrecking it,
    // and is sent back to the most polluted place on its way
    name: "monster", fixture: "town", point: "run", changes: {},
    async run(trace) {
      await trace.call("spriteManager.makeMonster");
      await trace.moves(5);
      await trace.call("spriteManager.makeMonsterAt", ...MONSTER_START);
      await trace.moves(100);
      ensure(trace.alive(SpriteConstants.SPRITE_MONSTER), "monster", "a monster walking");
      await trace.call("spriteManager.makeMonster");
      await trace.moves(600);
    },
  },
  {
    // A tornado, given more time while it blows
    name: "tornado", fixture: "town", point: "run", changes: {},
    async run(trace) {
      await trace.call("spriteManager.makeTornado");
      await trace.moves(100);
      await trace.call("spriteManager.makeTornado");
      await trace.moves(300);
    },
  },
  {
    // A monster, a tornado and a helicopter among the vehicles, set in the town's sprites: the monster stands where a
    // train, a ship and a plane are, and wrecks them, then the wire over the river it stands on; the tornado stands
    // over a bridge, and wrecks it; the helicopter, its time up, heads for the monster, and once the monster has
    // drowned, for the tornado
    name: "collisions", fixture: "town", point: "run",
    changes: {"sprites.list": collisionSprites()},
    tiles(map) {
      return over(map, RIVER, [
        {x: WIRE_OVER_RIVER[0], y: WIRE_OVER_RIVER[1], value: HPOWER | CONDBIT | BURNBIT | BULLBIT},
        {x: BRIDGE[0], y: BRIDGE[1], value: HBRIDGE | BULLBIT},
      ]);
    },
    async run(trace) {
      await trace.moves(1);
      for (const crash of [Messages.TRAIN_CRASHED, Messages.SHIP_CRASHED, Messages.PLANE_CRASHED]) {
        ensure(trace.heardLast(crash), "collisions", crash);
      }
      for (const [x, y] of [WIRE_OVER_RIVER, BRIDGE]) {
        ensure(trace.tileValue(x, y) === RIVER, "collisions", `the tile at (${x}, ${y}) wrecked into the river`);
      }
      await trace.moves(200);
    },
  },
  {
    // A plane and a helicopter, set where they meet, with disasters on: the plane's move wrecks both
    name: "midair", fixture: "town", point: "run",
    changes: {
      "disasters.disastersEnabled": true,
      "sprites.list": [
        savedSprite(SpriteConstants.SPRITE_AIRPLANE, 800, 800, {frame: 3, destX: 1600, destY: 800}),
        // Its hot spot on the plane's
        savedSprite(SpriteConstants.SPRITE_HELICOPTER, 808, 824, {frame: 5, count: 1000, origX: 200, origY: 200}),
      ],
    },
    async run(trace) {
      await trace.moves(20);
      for (const crash of [Messages.PLANE_CRASHED, Messages.HELICOPTER_CRASHED]) {
        ensure(trace.heard(crash), "midair", crash);
      }
    },
  },
  {
    // Sprites set at the end of their way: a monster back where it set out from, the second time it heads there, and
    // dies; a tornado by the map's bottom right corner, which blows off it; and a ship sailing north off the top edge
    name: "edges", fixture: "town", point: "run",
    changes: {
      "sprites.list": [
        savedSprite(SpriteConstants.SPRITE_MONSTER, 480, 480,
                    {frame: 1, count: 1000, flag: 1, destX: 480, destY: 480, origX: 480, origY: 480}),
        // Its hot spot five pixels inside each edge, and the point it wrecks, east and south of it, off the map
        savedSprite(SpriteConstants.SPRITE_TORNADO, 120 * 16 - 45, 100 * 16 - 41, {frame: 1, count: 200}),
        savedSprite(SpriteConstants.SPRITE_SHIP, 60 * 16 - 47, 4, {frame: 1, newDir: 1, dir: 5, count: 5}),
      ],
    },
    async run(trace) {
      await trace.moves(60);
      for (const type of [SpriteConstants.SPRITE_MONSTER, SpriteConstants.SPRITE_TORNADO, SpriteConstants.SPRITE_SHIP]) {
        ensure(!trace.alive(type), "edges", `sprite ${type} leaving`);
      }
      ensure(!trace.heard(Messages.SHIP_CRASHED), "edges", "a ship leaving the map");
    },
  },
  {
    // A map of bare land, but for a seaport's centre, with power, and a river edge in the map's corner, with the river
    // on its two sides on the map: the fire the player sets finds nothing to burn; the monster finds no river and rises
    // in the middle of the map; the port's handler finds no channel on any edge to send a ship from; and the flood
    // finds nothing, and is called until it draws the corner, which floods nothing, one neighbour off the map and the
    // others river
    name: "bareMap", fixture: "town", point: "run", changes: {"sprites.list": []},
    tiles(map) {
      return [
        ...filterIn(map, (raw) => raw !== DIRT).map(([x, y]) => ({x, y, value: DIRT})),
        {x: BARE_PORT[0], y: BARE_PORT[1], value: PORT | ZONEBIT | POWERBIT | CONDBIT | BURNBIT},
        {x: 0, y: 0, value: FIRSTRIVEDGE},
        {x: 1, y: 0, value: RIVER},
        {x: 0, y: 1, value: RIVER},
      ];
    },
    async run(trace) {
      await trace.call("disasterManager.makeFire");
      ensure(!trace.heardLast(Messages.FIRE_REPORTED), "bareMap", "a fire finding nothing");
      await trace.call("spriteManager.makeMonster");
      await trace.moves(5);

      // Each edge is searched for a channel when its chance comes up
      const looked = trace.spying(trace.city._map, "getTile");
      const searched = (onEdge: (x: number, y: number) => boolean) => looked.some(([x, y]) => onEdge(x as number, y as number));
      const {width, height} = trace.city._map;
      const edges = [
        (_: number, y: number) => y === 0,
        (x: number) => x === 0,
        (_: number, y: number) => y === height - 1,
        (x: number) => x === width - 1,
      ];
      while (!edges.every((onEdge) => searched(onEdge))) {
        ensure(trace.calls.length < 100, "bareMap", "a port searching each edge for a channel");
        await trace.call("transport.portFound", ...BARE_PORT);
      }
      ensure(!trace.alive(SpriteConstants.SPRITE_SHIP), "bareMap", "a port finding no channel");

      await trace.call("disasterManager.makeFlood");
      ensure(!trace.heardLast(Messages.FLOODING_REPORTED), "bareMap", "a flood finding nothing");
      // The flood looks for a neighbour of the corner to the north, off the map, only once it has drawn the corner
      const bounded = trace.spying(trace.city._map, "testBounds");
      while (!bounded.some(([x, y]) => x === 0 && y === -1)) {
        ensure(trace.calls.length < 1000, "bareMap", "a flood drawing the map's corner");
        await trace.call("disasterManager.makeFlood");
      }
      ensure(!trace.heard(Messages.FLOODING_REPORTED), "bareMap", "a flood finding nothing to flood");
    },
  },
  {
    // The plane in the air crashes, then the planes made for each crash, until one is made by the map's east edge
    // and turns back west: their explosions light fires as they burn out
    name: "crash", fixture: "town", point: "run", changes: {},
    async run(trace) {
      await trace.call("disasterManager.makeCrash");
      await trace.moves(20);
      ensure(trace.heard(Messages.PLANE_CRASHED), "crash", "a plane crash");

      const made = trace.spying(trace.city.spriteManager, "generatePlane");
      // A plane made from the map's last 22 columns starts, 48 pixels east of its tile, in the last 20, and turns back
      while (!made.some(([x]) => (x as number) >= trace.city._map.width - 22)) {
        ensure(trace.calls.length < 1000, "crash", "a plane made by the east edge");
        await trace.call("disasterManager.makeCrash");
        await trace.moves(1);
      }
      await trace.moves(20);
    },
  },
  {
    // The suburb's nuclear plant melts down, and the explosions at its corners burn out
    name: "meltdown", fixture: "suburbBroke", point: "built", changes: {},
    async run(trace) {
      await trace.call("disasterManager.makeMeltdown");
      await trace.moves(20);
      ensure(trace.heard(Messages.NUCLEAR_MELTDOWN), "meltdown", "a meltdown");
    },
  },
  {
    // An earthquake, a flood, the random fires and the fires the player sets, and an explosion over a tile
    name: "calamities", fixture: "town", point: "run", changes: {},
    async run(trace) {
      await trace.call("disasterManager.makeEarthquake");
      await trace.call("disasterManager.makeFlood");
      for (let i = 0; i < 30; i++) {
        await trace.call("disasterManager.setFire");
      }
      for (let i = 0; i < 3; i++) {
        await trace.call("disasterManager.makeFire");
      }
      await trace.call("spriteManager.makeExplosion", 20, 15);
      // Over the map's corner, where some of its fires fall off the map, and off the map, where it is none
      await trace.call("spriteManager.makeExplosion", 0, 0);
      await trace.call("spriteManager.makeExplosion", -1, 0);
      await trace.moves(20);
      // With disasters disabled, the disasters' phase only counts the flood down
      await trace.call("disasterManager.doDisasters", 2);
      for (const subject of [Messages.EARTHQUAKE, Messages.FLOODING_REPORTED, Messages.FIRE_REPORTED]) {
        ensure(trace.heard(subject), "calamities", subject);
      }
    },
  },
  {
    // Random disasters in a polluted town: a hundred draws at the easy and medium levels, then the hard level's, the
    // sprites moving between them, until each of the disasters has been drawn. A random fire strikes one tile drawn
    // at random, and burns only a building, which few of the town's tiles are, so the branches are counted as they
    // are taken rather than by what they report.
    name: "randomDisasters", fixture: "town", point: "run",
    changes: {"disasters.disastersEnabled": true, "census.pollutionAverage": 100},
    async run(trace) {
      for (const gameLevel of [0, 1]) {
        for (let i = 0; i < 100; i++) {
          await trace.call("disasterManager.doDisasters", gameLevel);
        }
      }

      const {disasterManager, spriteManager} = trace.city;
      const drawn = [
        trace.spying(disasterManager, "setFire"),
        trace.spying(disasterManager, "makeFlood"),
        trace.spying(spriteManager, "makeTornado"),
        trace.spying(disasterManager, "makeEarthquake"),
        trace.spying(spriteManager, "makeMonster"),
      ];
      while (!drawn.every((branch) => branch.length > 0)) {
        ensure(trace.calls.length < 6000, "randomDisasters", "each random disaster");
        await trace.call("disasterManager.doDisasters", 2);
        await trace.moves(1);
      }
    },
  },
  {
    // Random disasters in a town whose pollution is the most that raises no monster: the hard level's draws until one
    // comes up on the monster's two branches, which then raise none
    name: "cleanAir", fixture: "town", point: "run",
    changes: {"disasters.disastersEnabled": true, "census.pollutionAverage": 60},
    async run(trace) {
      const draws = trace.drawing();
      let monsterDrawn = false;
      while (!monsterDrawn) {
        ensure(trace.calls.length < 5000, "cleanAir", "a monster drawn");
        draws.length = 0;
        await trace.call("disasterManager.doDisasters", 2);
        // The level's chance comes up first, then the disaster: 7 and 8 are the monster's
        monsterDrawn = draws[0]?.max === HARD_DISASTER_CHANCE && draws[0].result === 0 && draws[1]?.max === 8 &&
                       draws[1].result >= 7;
      }
      ensure(!trace.alive(SpriteConstants.SPRITE_MONSTER), "cleanAir", "no monster rising");
    },
  },
];
