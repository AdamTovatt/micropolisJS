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
import { SpriteUtils } from "../src/spriteUtils.js";
import { BULLBIT, BURNBIT } from "../src/tileFlags";
import { CHANNEL, RIVER } from "../src/tileValues";
import { listening, Manager, newManager, passes, Sprite, types } from "./helpers/spriteManagers";
import { streamAlwaysDrawing } from "./helpers/streams";

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
        expect(manager.spriteList[0].count).toBe(1000);
        // A sighting names the sprite to follow by its type, which is plain data
        expect(sightings).toEqual([expect.objectContaining({sprite: SpriteConstants.SPRITE_MONSTER})]);
    });

    it("gives a tornado already blowing more time, unannounced, rather than make a second", () => {
        const manager = newManager();
        const sightings = listening(manager, Messages.TORNADO_SIGHTED);

        manager.makeTornado();
        manager.spriteList[0].count = 5;
        manager.makeTornado();

        expect(types(manager)).toEqual([SpriteConstants.SPRITE_TORNADO]);
        expect(manager.spriteList[0].count).toBe(200);
        expect(sightings).toEqual([expect.objectContaining({sprite: SpriteConstants.SPRITE_TORNADO})]);
    });
});

describe("getBoatDistance", () => {

    it("measures the distance to live ships only", () => {
        const manager = newManager();
        const ship = manager.makeSprite(SpriteConstants.SPRITE_SHIP, 600, 500);

        // From the middle of tile (40, 30), (648, 488), to the ship's hot spot, (648, 500)
        expect(manager.getBoatDistance(40, 30)).toBe(12);

        ship.frame = 0;
        expect(manager.getBoatDistance(40, 30)).toBe(99999);
    });
});
