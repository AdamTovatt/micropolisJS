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
import { Random } from "../src/random";
import { Simulation } from "../src/simulation.js";
import * as SpriteConstants from "../src/spriteConstants";
import { SpriteManager } from "../src/spriteManager.js";

type Sprite = Record<string, unknown> & {getSaveProps(): string[]};

interface Manager {
    spriteCycle: number;
    spriteList: Sprite[];
    makeSprite(type: number, x: number, y: number): Sprite;
    moveObjects(simData: object): void;
    save(saveData: object): void;
    load(saveData: object): void;
}

const newManager = (random: Random) => new SpriteManager(new GameMap(120, 100), random) as unknown as Manager;

const TYPES = [SpriteConstants.SPRITE_TRAIN, SpriteConstants.SPRITE_HELICOPTER, SpriteConstants.SPRITE_AIRPLANE,
               SpriteConstants.SPRITE_SHIP, SpriteConstants.SPRITE_MONSTER, SpriteConstants.SPRITE_TORNADO,
               SpriteConstants.SPRITE_EXPLOSION];

const MONSTER = TYPES.indexOf(SpriteConstants.SPRITE_MONSTER);

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

    manager.spriteList[MONSTER]._seenLand = true;
}

function managerWithSprites() {
    const manager = newManager(Random.simulationStream(7));
    manager.spriteCycle = 41;
    makeSprites(manager);
    return manager;
}

function saved(manager: Manager) {
    const saveData = {};
    manager.save(saveData);
    return JSON.parse(JSON.stringify(saveData));
}

// The fields a sprite holds that are not saved, because they are not state: its references, and its world position,
// which its pixel position sets
const NOT_SAVED = ["map", "spriteManager", "random", "worldX", "worldY"];

function unsavedFields(sprite: Sprite) {
    return Object.keys(sprite).filter((key) => !sprite.getSaveProps().includes(key) && !NOT_SAVED.includes(key));
}

describe("the sprite manager", () => {

    it("restores every sprite, in order, with its state", () => {
        const original = managerWithSprites();
        const saveData = saved(original);

        const restored = newManager(Random.simulationStream(7));
        restored.load(saveData);

        expect(saved(restored)).toEqual(saveData);
        expect(restored.spriteList.map((sprite) => sprite.constructor))
            .toEqual(original.spriteList.map((sprite) => sprite.constructor));
        expect(restored.spriteList[MONSTER]._seenLand).toBe(true);
    });

    it("restores sprites without drawing from the stream, as their constructors do", () => {
        const saveData = saved(managerWithSprites());
        const random = Random.simulationStream(7);
        const before = random.getState();

        newManager(random).load(saveData);

        expect(random.getState()).toEqual(before);
    });

    it("restores the world position from the pixel position", () => {
        const restored = newManager(Random.simulationStream(7));
        restored.load(saved(managerWithSprites()));

        // A tile is 16 pixels
        const train = restored.spriteList[0];
        expect([train.worldX, train.worldY]).toEqual([startX(0) >> 4, startY(0) >> 4]);
    });

    it("gives a restored sprite its type's size and offsets", () => {
        const original = managerWithSprites();
        const restored = newManager(Random.simulationStream(7));
        restored.load(saved(original));

        const geometry = (sprite: Sprite) => [sprite.width, sprite.height, sprite.xOffset, sprite.yOffset];
        expect(restored.spriteList.map(geometry)).toEqual(original.spriteList.map(geometry));
        expect(geometry(restored.spriteList[MONSTER])).toEqual([48, 48, -24, -24]);
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
        delete saveData.sprites.list[MONSTER]._seenLand;

        expect(() => newManager(Random.simulationStream(7)).load(saveData)).toThrow("A saved sprite has no _seenLand");
    });

    it("fails on a saved sprite of an unknown type", () => {
        const saveData = saved(managerWithSprites());
        saveData.sprites.list[0].type = 99;

        expect(() => newManager(Random.simulationStream(7)).load(saveData)).toThrow("unknown type 99");
    });
});
