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

import { GameMap } from "../../src/gameMap.js";
import { Random } from "../../src/random";
import { SpriteManager } from "../../src/spriteManager.js";

// A sprite manager on a map of its own, outside any city, and the passes of its sprites

export type Sprite = Record<string, unknown> & {type: number, frame: number, x: number, y: number, count: number,
                                                dir: number, save(): object};

export interface Manager {
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

export function newManager(random = Random.simulationStream(7), map = new GameMap(120, 100)) {
    return new SpriteManager(map, random) as unknown as Manager;
}

// What a pass of the sprites reads of the city: no traffic for the helicopter, and whether disasters are on
function simData(disastersEnabled = false) {
    return {disasterManager: {disastersEnabled}, blockMaps: {trafficDensityMap: {worldGet: () => 0}}};
}

export function types(manager: Manager) {
    return manager.spriteList.map((sprite) => sprite.type);
}

export function listening(manager: Manager, event: string) {
    const heard: unknown[] = [];
    manager.addEventListener(event, (data) => heard.push(data));
    return heard;
}

export function passes(manager: Manager, count: number, disastersEnabled = false) {
    for (let pass = 0; pass < count; pass++) {
        manager.moveObjects(simData(disastersEnabled));
    }
}
