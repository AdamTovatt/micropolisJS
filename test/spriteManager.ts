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
import { MapGenerator } from "../src/mapGenerator.js";
import * as Messages from "../src/messages";
import { Random } from "../src/random";
import { Simulation } from "../src/simulation.js";
import * as SpriteConstants from "../src/spriteConstants";
import { SpriteManager } from "../src/spriteManager.js";
import { SpriteUtils } from "../src/spriteUtils.js";
import { BLBNBIT, BULLBIT, BURNBIT } from "../src/tileFlags";
import { CHANNEL, DIRT, FIRE, LASTFIRE, LHRAIL, RIVER, TINYEXP, WOODS } from "../src/tileValues";
import { streamAlwaysDrawing } from "./helpers/streams";

type Sprite = Record<string, unknown> & {type: number, frame: number, x: number, y: number, count: number,
                                         dir: number, save(): object};

interface Manager {
    spriteCycle: number;
    spriteList: Sprite[];
    absDist: number;
    makeSprite(type: number, x: number, y: number): Sprite;
    makeExplosion(x: number, y: number): void;
    makeExplosionAt(x: number, y: number): void;
    makeMonster(): void;
    makeTornado(): void;
    makeShipHere(x: number, y: number): void;
    generateShip(): void;
    generateTrain(census: {totalPop: number}, x: number, y: number): void;
    getDir(orgX: number, orgY: number, destX: number, destY: number): number;
    getLiveSprites(): Sprite[];
    getBoatDistance(x: number, y: number): number;
    moveObjects(simData: object): void;
    save(saveData: object): void;
    load(saveData: object): void;
    addEventListener(event: string, listener: (data: unknown) => void): void;
}

function newManager(random = Random.simulationStream(7), map = new GameMap(120, 100)) {
    return new SpriteManager(map, random) as unknown as Manager;
}

// What a pass of the sprites reads of the city: no traffic for the helicopter, and whether disasters are on
function simData(disastersEnabled = false) {
    return {disasterManager: {disastersEnabled}, blockMaps: {trafficDensityMap: {worldGet: () => 0}}};
}

function types(manager: Manager) {
    return manager.spriteList.map((sprite) => sprite.type);
}

function listening(manager: Manager, event: string) {
    const heard: unknown[] = [];
    manager.addEventListener(event, (data) => heard.push(data));
    return heard;
}

function passes(manager: Manager, count: number, disastersEnabled = false) {
    for (let pass = 0; pass < count; pass++) {
        manager.moveObjects(simData(disastersEnabled));
    }
}

const TYPES = [SpriteConstants.SPRITE_TRAIN, SpriteConstants.SPRITE_HELICOPTER, SpriteConstants.SPRITE_AIRPLANE,
               SpriteConstants.SPRITE_SHIP, SpriteConstants.SPRITE_MONSTER, SpriteConstants.SPRITE_TORNADO,
               SpriteConstants.SPRITE_EXPLOSION];

// Sprite i starts at pixel (160 + 32i, 320 + 16i)
const startX = (i: number) => 160 + 32 * i;
const startY = (i: number) => 320 + 16 * i;

// One sprite of every type, each moved off its starting state
function makeSprites(manager: Manager) {
    TYPES.forEach((type, i) => {
        const sprite = manager.makeSprite(type, startX(i), startY(i));
        sprite.count = 17 + i;
        sprite.destX = 1000 + i;
        sprite.flag = 1;
    });
}

function managerWithSprites() {
    const manager = newManager();
    manager.spriteCycle = 41;
    makeSprites(manager);
    return manager;
}

function saved(manager: Manager) {
    const saveData = {};
    manager.save(saveData);
    return JSON.parse(JSON.stringify(saveData));
}

// The fields a sprite holds that are not saved, because they are not state: its references
const NOT_SAVED = ["map", "spriteManager", "random"];

function unsavedFields(sprite: Sprite) {
    const savedKeys = Object.keys(sprite.save());
    return Object.keys(sprite).filter((key) => !savedKeys.includes(key) && !NOT_SAVED.includes(key));
}

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

describe("the sprite manager", () => {

    it("restores every sprite, in order, with its state", () => {
        const original = managerWithSprites();
        const saveData = saved(original);

        const restored = newManager();
        restored.load(saveData);

        expect(saved(restored)).toEqual(saveData);
        expect(restored.spriteList.map((sprite) => sprite.constructor))
            .toEqual(original.spriteList.map((sprite) => sprite.constructor));
    });

    it("restores sprites without drawing from the stream, as their constructors do", () => {
        const saveData = saved(managerWithSprites());
        const random = Random.simulationStream(7);
        const before = random.getState();

        newManager(random).load(saveData);

        expect(random.getState()).toEqual(before);
    });

    it("gives a restored sprite its type's size, offsets and hot spot", () => {
        const original = managerWithSprites();
        const restored = newManager();
        restored.load(saved(original));

        const traits = (sprite: Sprite) =>
            [sprite.width, sprite.height, sprite.xOffset, sprite.yOffset, sprite.xHot, sprite.yHot];
        expect(restored.spriteList.map(traits)).toEqual(original.spriteList.map(traits));
        expect(traits(restored.spriteList.find((sprite) => sprite.type === SpriteConstants.SPRITE_MONSTER)!))
            .toEqual([48, 48, 24, 0, 40, 16]);
    });

    // A field a sprite holds but doesn't save would be lost on load, and the city would continue differently
    it("saves every field a new sprite holds", () => {
        managerWithSprites().spriteList.forEach((sprite) => {
            expect(unsavedFields(sprite)).toEqual([]);
        });
    });

    it("saves every field a sprite holds as it moves", () => {
        const city = new Simulation(MapGenerator(Random.mapStream(8)), Simulation.LEVEL_EASY, Simulation.SPEED_MED,
                                    8) as unknown as {spriteManager: Manager, _constructSimData(): object};
        const manager = city.spriteManager;
        makeSprites(manager);

        for (let move = 0; move < 300; move++) {
            manager.moveObjects(city._constructSimData());
            manager.spriteList.forEach((sprite) => {
                expect(unsavedFields(sprite)).toEqual([]);
            });
        }
    });

    it("fails on a saved sprite missing a field", () => {
        const saveData = saved(managerWithSprites());
        delete saveData.sprites.list[0].flag;

        expect(() => newManager().load(saveData)).toThrow("A saved sprite has no flag");
    });

    it("fails on a saved sprite of an unknown type", () => {
        const saveData = saved(managerWithSprites());
        saveData.sprites.list[0].type = 99;

        expect(() => newManager().load(saveData)).toThrow("unknown type 99");
    });
});

describe("the sprite list", () => {

    it("holds the newest sprite first", () => {
        const manager = newManager();

        manager.makeSprite(SpriteConstants.SPRITE_TRAIN, 400, 400);
        manager.makeSprite(SpriteConstants.SPRITE_SHIP, 400, 400);

        expect(types(manager)).toEqual([SpriteConstants.SPRITE_SHIP, SpriteConstants.SPRITE_TRAIN]);
    });

    it("starts a dead sprite of the type afresh where it stands, rather than adding one", () => {
        const manager = newManager();
        const train = manager.makeSprite(SpriteConstants.SPRITE_TRAIN, 400, 400);
        manager.makeSprite(SpriteConstants.SPRITE_SHIP, 400, 400);
        train.frame = 0;

        const made = manager.makeSprite(SpriteConstants.SPRITE_TRAIN, 800, 640);

        expect(made).toBe(train);
        expect(types(manager)).toEqual([SpriteConstants.SPRITE_SHIP, SpriteConstants.SPRITE_TRAIN]);
        expect([made.frame, made.x, made.y, made.dir]).toEqual([1, 800, 640, 4]);
    });

    it("adds every explosion", () => {
        const manager = newManager();

        manager.makeExplosionAt(400, 400);
        manager.makeExplosionAt(400, 400);

        expect(types(manager)).toEqual([SpriteConstants.SPRITE_EXPLOSION, SpriteConstants.SPRITE_EXPLOSION]);
    });

    // A tornado blown off the map dies as it moves, and the pass that reaches it next takes it out of the list. Until
    // then it is in the list, but not on the map.
    it("keeps a sprite that died this pass until the next pass reaches it", () => {
        const manager = newManager();
        const tornado = manager.makeSprite(SpriteConstants.SPRITE_TORNADO, -200, -200);

        passes(manager, 1);
        expect([manager.spriteList, tornado.frame, manager.getLiveSprites()]).toEqual([[tornado], 0, []]);

        passes(manager, 1);
        expect(manager.spriteList).toEqual([]);
    });
});

describe("getDir", () => {

    it("leaves the distance in absDist", () => {
        const manager = newManager();

        manager.getDir(10, 20, 110, 10);

        expect(manager.absDist).toBe(110);
    });

    // The original's test for a destination mostly across never holds, so it heads diagonally
    it("heads south-east, not east, for a destination mostly east", () => {
        expect(newManager().getDir(0, 0, 100, 10)).toBe(4);
    });

    it("heads south for a destination mostly south", () => {
        expect(newManager().getDir(0, 0, 10, 100)).toBe(5);
    });
});

describe("truncatingPixToWorld", () => {

    it.each([
        [-17, -1],
        [-16, -1],
        [-15, 0],
        [-1, 0],
        [0, 0],
        [15, 0],
        [16, 1],
    ])("puts pixel %i in tile %i, as C's division by 16 does", (pixel, tile) => {
        expect(SpriteUtils.truncatingPixToWorld(pixel)).toBe(tile);
    });
});

describe("making sprites", () => {

    it("makes a train only once the population passes 20", () => {
        const manager = newManager(streamAlwaysDrawing(0));

        manager.generateTrain({totalPop: 20}, 10, 10);
        expect(manager.spriteList).toEqual([]);

        manager.generateTrain({totalPop: 21}, 10, 10);
        expect(manager.spriteList.map((sprite) => [sprite.type, sprite.x, sprite.y]))
            .toEqual([[SpriteConstants.SPRITE_TRAIN, 160 - 39, 160 + 6]]);
    });

    // Every edge has its chance, with every draw 0. A ship on the top edge at (5, 0) starts 47 pixels west of it.
    it.each([
        ["without flags", 0, [[SpriteConstants.SPRITE_SHIP, 5 * 16 - 47, 0]]],
        ["with a flag", BULLBIT, []],
    ])("makes a ship from a channel on the map's edge only if it has no flags: a channel %s", (_, flags, made) => {
        const map = new GameMap(120, 100);
        map.setTile(5, 0, CHANNEL, flags);
        const manager = newManager(streamAlwaysDrawing(0), map);

        manager.generateShip();

        expect(manager.spriteList.map((sprite) => [sprite.type, sprite.x, sprite.y])).toEqual(made);
    });

    // Every draw is 20, so every try is the river tile at (30, 25); a monster that finds no river rises at (60, 50).
    // A monster from tile (x, y) starts 48 pixels east of it.
    it.each([
        ["without flags", 0, 30, 25],
        ["bulldozable", BULLBIT, 30, 25],
        ["with another flag", BURNBIT, 60, 50],
    ])("makes a monster from a river tile only if it is bare or bulldozable: a river %s", (_, flags, x, y) => {
        const map = new GameMap(120, 100);
        map.setTile(30, 25, RIVER, flags);
        const manager = newManager(streamAlwaysDrawing(20), map);

        manager.makeMonster();

        expect(manager.spriteList.map((sprite) => [sprite.x, sprite.y])).toEqual([[x * 16 + 48, y * 16]]);
    });

    it("sends a live monster back rather than make a second", () => {
        const manager = newManager();
        const sightings = listening(manager, Messages.MONSTER_SIGHTED);

        manager.makeMonster();
        manager.spriteList[0].count = 5;
        manager.makeMonster();

        expect(types(manager)).toEqual([SpriteConstants.SPRITE_MONSTER]);
        expect([manager.spriteList[0].count, sightings.length]).toEqual([1000, 1]);
    });

    it("gives a tornado already blowing more time, unannounced, rather than make a second", () => {
        const manager = newManager();
        const sightings = listening(manager, Messages.TORNADO_SIGHTED);

        manager.makeTornado();
        manager.spriteList[0].count = 5;
        manager.makeTornado();

        expect(types(manager)).toEqual([SpriteConstants.SPRITE_TORNADO]);
        expect([manager.spriteList[0].count, sightings.length]).toEqual([200, 1]);
    });
});

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

    it("measure the boat distance to live ships only", () => {
        const manager = newManager();
        const ship = manager.makeSprite(SpriteConstants.SPRITE_SHIP, 600, 500);

        // From the middle of tile (40, 30), (648, 488), to the ship's hot spot, (648, 500)
        expect(manager.getBoatDistance(40, 30)).toBe(12);

        ship.frame = 0;
        expect(manager.getBoatDistance(40, 30)).toBe(99999);
    });
});
