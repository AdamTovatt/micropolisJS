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

import { Command, LOCAL_PLAYER } from "../../src/protocol";
import { plainSavedState } from "../../src/stateHash";
import { ANIMBIT, BLBNBIT, BULLBIT, BURNBIT } from "../../src/tileFlags";
import {
    BRWH, DIRT, FIRE, FIRESTATION, FLOOD, FREEZ, HBRDG0, HBRDG1, HBRDG2, HBRDG3, HBRIDGE, POWERPLANT, RADTILE,
    RIVER, ROADS, STADIUM, TINYEXP, WOODS,
} from "../../src/tileValues";
import { GameMapInstance, Simulation } from "../city";
import { RUN_STEPS } from "./fixture";
import type { DerivedFixture } from "./index";
import { suburb } from "./suburb";

// The suburb as built, with the tiles the infrastructure handlers' rarer branches need written onto open land east of
// it, as no command places them: fires, a flood, radiation and explosions, a stadium with its own plant, a fire station
// whose road is in the next block, two drawbridges over the river's channel, one open, and a field of bridges. A flood
// starts with it, which spreads for a number of cycles. Each scene is laid out in a strip of the map scan's own, an
// eighth of the map's columns, away from the town's and from each other's handlers, so the unit snapshots of a scene
// register few families. The flood is the exception: it spreads over the dirt and woods west of its strip, into the
// stadium's. Nothing that burns leads from a fire to a zone that explodes when it catches, so the city creates no
// sprite, as a "branch" fixture must, or the snapshot generator fails.

// The first column of each scene's strip
export const FIRE_STRIP = 60;
export const BRIDGE_STRIP = 75;
export const STADIUM_STRIP = 90;
export const RADIATION_STRIP = 105;

// The flood spreads for this many cycles, then recedes
const FLOOD_CYCLES = 30;

function clear(map: GameMapInstance, x0: number, y0: number, x1: number, y1: number): void {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      map.setTile(x, y, DIRT, 0);
    }
  }
}

function row(map: GameMapInstance, value: number, flags: number, x0: number, x1: number, y: number): void {
  for (let x = x0; x <= x1; x++) {
    map.setTile(x, y, value, flags);
  }
}

function writeScenes(map: GameMapInstance): void {
  // A row of fires between a row of woods and an empty residential zone, which is already burning on the four tiles
  // beside its centre, and catches once a fire spreads into the centre. A fire station two tiles of dirt away, out of
  // the fires' reach, covers them; its first perimeter tile is a road in the block above its own. Four explosions are
  // cleared to rubble.
  const fire = FIRE_STRIP;
  clear(map, fire, 50, fire + 14, 68);
  row(map, WOODS, BLBNBIT, fire + 1, fire + 10, 57);
  row(map, FIRE, ANIMBIT, fire + 1, fire + 10, 58);
  map.putZone(fire + 3, 60, FREEZ, 3);
  for (const [x, y] of [[fire + 2, 60], [fire + 3, 59], [fire + 4, 60], [fire + 3, 61]]) {
    map.setTile(x, y, FIRE, ANIMBIT);
  }
  map.putZone(fire + 8, 64, FIRESTATION, 3);
  map.setTile(fire + 7, 62, ROADS, BULLBIT | BURNBIT);
  row(map, TINYEXP, ANIMBIT | BULLBIT, fire + 1, fire + 4, 52);

  // A block of road, and below it bridges over water, all of which wear away once the year end has cut the roads'
  // funding: a road to rubble, a bridge to water. Further south, a closed drawbridge across the channel on row 50 and
  // an open one on row 48, as the road tool builds a bridge and doBridge opens one. The channel, in column 79 from row
  // 47 to 50, is seed 8's own.
  const bridge = BRIDGE_STRIP;
  for (let y = 1; y <= 5; y++) {
    row(map, ROADS, BULLBIT | BURNBIT, bridge, bridge + 9, y);
  }

  row(map, RIVER, 0, bridge, bridge + 7, 6);
  for (let y = 7; y <= 10; y++) {
    row(map, HBRIDGE, BULLBIT, bridge, bridge + 7, y);
  }
  row(map, RIVER, 0, bridge, bridge + 7, 11);

  row(map, HBRIDGE, BULLBIT, bridge + 2, bridge + 6, 50);
  map.setTile(bridge + 2, 47, HBRDG1, BULLBIT);
  map.setTile(bridge + 6, 47, HBRDG3, BULLBIT);
  map.setTile(bridge + 2, 48, HBRDG0, BULLBIT);
  map.setTile(bridge + 3, 48, RIVER, 0);
  map.setTile(bridge + 4, 48, BRWH, BULLBIT);
  map.setTile(bridge + 5, 48, RIVER, 0);
  map.setTile(bridge + 6, 48, HBRDG2, BULLBIT);

  // A stadium powered by the coal plant beside it, which plays a game every 32 cycles
  const stadium = STADIUM_STRIP;
  clear(map, stadium + 3, 39, stadium + 14, 46);
  map.putZone(stadium + 6, 42, POWERPLANT, 4);
  map.putZone(stadium + 10, 42, STADIUM, 4);

  // A field of radiation, which decays a tile at a time, and south of it a flood, which spreads into the empty
  // residential zone below it, then recedes
  const radiation = RADIATION_STRIP;
  clear(map, radiation, 36, radiation + 14, 80);
  for (let y = 38; y <= 57; y++) {
    row(map, RADTILE, 0, radiation, radiation + 14, y);
  }
  row(map, FLOOD, 0, radiation + 5, radiation + 9, 72);
  map.putZone(radiation + 7, 74, FREEZ, 3);
}

export const disasters: DerivedFixture = {
  from: suburb,
  save(city: Simulation): object {
    writeScenes(city.getMap());

    const saved = plainSavedState(city) as {disasters: {floodCount: number}};
    saved.disasters.floodCount = FLOOD_CYCLES;
    return saved;
  },
  description: "The suburb with fires, a flood, radiation, explosions, a stadium, a fire station and bridges written in",
  // From the first year end, the fire station works at a share of its effect, and the roads wear away
  entries: [
    {type: "setAutoBudget", on: false},
    {type: "setBudget", road: 50, fire: 50, police: 100, tax: 7},
  ].map((command) => ({step: 0, player: LOCAL_PLAYER, command: command as Command})),
  checkpoints: [
    {step: 0, hash: "5db15b9cb829a11f4679b315e90506ae6c5bc00f170476c9339f6345954664c7"},
    {step: RUN_STEPS, hash: "b6799fba4f81bbcedc3406a74355b41d3d9bec3e235bc5e0a543b2b702b4735f"},
  ],
};
