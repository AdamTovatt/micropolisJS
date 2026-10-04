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

import { GameMap } from "../src/gameMap.js";
import * as Messages from "../src/messages";
import { Random } from "../src/random";
import * as SpriteConstants from "../src/spriteConstants";
import { BLBNBIT } from "../src/tileFlags";
import { CHANNEL, DIRT, FIRE, LASTFIRE, LHRAIL, RIVER, TINYEXP, WOODS } from "../src/tileValues";
import { listening, newManager, passes, types } from "./helpers/spriteManagers";
import { streamAlwaysDrawing } from "./helpers/streams";

// The tiles whose value changed from those given, as [x, y, value]
function changedTiles(map: InstanceType<typeof GameMap>, before: (x: number, y: number) => number) {
    const changed: number[][] = [];
    for (let x = 0; x < map.width; x++) {
        for (let y = 0; y < map.height; y++) {
            if (map.getTileValue(x, y) !== before(x, y)) {
                changed.push([x, y, map.getTileValue(x, y)]);
            }
        }
    }
    return changed;
}

describe("the sprites", () => {

    // The explosion's hot spot is the middle of tile (10, 10). It burns out after six frames, a frame every second
    // pass: twelve passes. On bare dirt, which burns, the fires light it and its four diagonal neighbours.
    it("light fires on five tiles when an explosion burns out", () => {
        const map = new GameMap(120, 100);
        const manager = newManager(Random.simulationStream(7), map);
        manager.makeExplosion(10, 10);

        passes(manager, 12);

        const changed = changedTiles(map, () => DIRT);
        expect(changed.map(([x, y]) => [x, y])).toEqual([[9, 9], [9, 11], [10, 10], [11, 9], [11, 11]]);
        expect(changed.filter(([, , value]) => value < FIRE || value > LASTFIRE)).toEqual([]);
    });

    // The plane, the newest, moves first, with its hot spot on the helicopter's
    it.each([
        ["on", true, 2],
        ["off", false, 0],
    ])("collide in the air when disasters are %s", (_, disastersEnabled, crashes) => {
        const manager = newManager();
        const heard = [listening(manager, Messages.PLANE_CRASHED), listening(manager, Messages.HELICOPTER_CRASHED)];
        manager.makeSprite(SpriteConstants.SPRITE_HELICOPTER, 108, 124);
        manager.makeSprite(SpriteConstants.SPRITE_AIRPLANE, 100, 100);

        passes(manager, 1, disastersEnabled);

        expect(types(manager).filter((type) => type === SpriteConstants.SPRITE_EXPLOSION).length).toBe(crashes);
        expect(heard.flat().length).toBe(crashes);
    });

    // The train made for tile (10, 10) is at (121, 166) and stands still until the fourth pass, when it looks for
    // track 16 pixels each way from 48 pixels east of where it is: in tiles (10, 9), (11, 10), (10, 11) and (9, 10).
    it("finds track from 48 pixels east of where it is", () => {
        const map = new GameMap(120, 100);
        map.setTile(11, 10, LHRAIL, 0);
        const manager = newManager(streamAlwaysDrawing(0), map);
        manager.generateTrain({totalPop: 21}, 10, 10);

        passes(manager, 4);

        expect(manager.spriteList.map((sprite) => [sprite.frame, sprite.dir])).toEqual([[2, 1]]);
    });

    // A ship from the left edge's tile (0, 20) is at (-47, 320): it looks for water from 47 pixels east of where it is,
    // and wrecks 48 pixels east, on its own tile. Every draw is 0.
    it.each([
        ["sails into the channel east of it", CHANNEL, 0, [[3, 7]], WOODS],
        ["wrecks where there is no water", DIRT, 0, [], TINYEXP],
    ])("%s", (_, east, flags, ships, wreck) => {
        const map = new GameMap(120, 100);
        map.setTile(1, 20, east, flags);
        map.setTile(0, 20, WOODS, BLBNBIT);
        const manager = newManager(streamAlwaysDrawing(0), map);
        manager.makeShipHere(0, 20);

        passes(manager, 1);

        const live = manager.getLiveSprites().filter((sprite) => sprite.type === SpriteConstants.SPRITE_SHIP);
        expect(live.map((sprite) => [sprite.frame, sprite.dir])).toEqual(ships);
        expect(map.getTileValue(0, 20)).toBe(wreck);
    });

    // A tornado at (160, 160) moves 3 pixels south, when every draw is 3, and strikes 48 pixels east and 40 south of
    // where it is: tile (13, 12), and not the tile under its hot spot, (12, 12)
    it("strikes 48 pixels east and 40 south of a tornado", () => {
        const map = new GameMap(120, 100);
        map.setTile(12, 12, WOODS, BLBNBIT);
        map.setTile(13, 12, WOODS, BLBNBIT);
        const manager = newManager(streamAlwaysDrawing(3), map);
        manager.makeSprite(SpriteConstants.SPRITE_TORNADO, 160, 160);

        passes(manager, 1);

        expect(changedTiles(map, (x, y) => x >= 12 && x <= 13 && y === 12 ? WOODS : DIRT))
            .toEqual([[13, 12, TINYEXP]]);
    });

    // A monster at (208, 160) heads south-east to the map's middle without turning, to (210, 162): it stands on the tile
    // under its hot spot, 40 pixels east and 16 south, (15, 11), and strikes 48 pixels east and 16 south, (16, 11)
    it.each([
        ["strikes 48 pixels east and 16 south of a monster", WOODS, BLBNBIT, 5, [[16, 11, TINYEXP]]],
        ["drowns a monster whose hot spot is in the river", RIVER, 0, 0, [[16, 11, TINYEXP]]],
    ])("%s", (_, standing, flags, frame, changed) => {
        const map = new GameMap(120, 100);
        map.setTile(15, 11, standing, flags);
        map.setTile(16, 11, WOODS, BLBNBIT);
        const manager = newManager(streamAlwaysDrawing(5), map);
        const monster = manager.makeSprite(SpriteConstants.SPRITE_MONSTER, 208, 160);

        passes(manager, 1);

        expect([monster.x, monster.y, monster.frame]).toEqual([210, 162, frame]);
        expect(changedTiles(map, (x, y) => x === 15 && y === 11 ? standing : x === 16 && y === 11 ? WOODS : DIRT))
            .toEqual(changed);
    });
});
