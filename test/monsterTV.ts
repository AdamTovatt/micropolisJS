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

import { SpriteFollower, ViewState, isOutOfView, renderView, spriteTile } from "../src/monsterTV";
import type { ViewElement } from "../src/monsterTV";
import { SpriteView } from "../src/protocol";
import { SPRITE_MONSTER, SPRITE_TORNADO, SPRITE_TRAIN } from "../src/spriteConstants";

// A sprite of the type whose square is centred on map tile (x, y), as a sprites message gives it
function spriteOver(type: number, x: number, y: number): SpriteView {
    return {type, frame: 1, x: x * 16 + 8 - 24, y: y * 16 + 8 - 24, width: 48};
}

describe("monsterTV", () => {

    describe("deciding to centre on a sprite again", () => {

        const MIN = {x: 10, y: 20};
        const MAX = {x: 21, y: 27};

        it("leaves the view where it is while the sprite is inside it", () => {
            expect(isOutOfView({x: 10, y: 20}, MIN, MAX)).toBe(false);
            expect(isOutOfView({x: 15, y: 23}, MIN, MAX)).toBe(false);
            expect(isOutOfView({x: 20, y: 26}, MIN, MAX)).toBe(false);
        });

        it("centres again once the sprite passes the view's first row or column", () => {
            expect(isOutOfView({x: 9, y: 23}, MIN, MAX)).toBe(true);
            expect(isOutOfView({x: 15, y: 19}, MIN, MAX)).toBe(true);
        });

        it("centres again once the sprite reaches the view's last row or column, which may be partly in view", () => {
            expect(isOutOfView({x: 21, y: 23}, MIN, MAX)).toBe(true);
            expect(isOutOfView({x: 15, y: 27}, MIN, MAX)).toBe(true);
        });
    });

    describe("the tile a sprite is over", () => {

        it("is the tile under the middle of its square", () => {
            expect(spriteTile(spriteOver(SPRITE_MONSTER, 30, 40))).toEqual({x: 30, y: 40});
            expect(spriteTile({type: SPRITE_TRAIN, frame: 1, x: 100, y: 200, width: 32})).toEqual({x: 7, y: 13});
        });

        // The tornado's funnel is drawn rising from where it is (tornadoSprite.js draws it 40 pixels up and 24 left of
        // its position): the view centres on the funnel, a tile above the ground it stands on
        it("is the tile under the tornado's funnel, a tile above its position", () => {
            const position = {x: 30 * 16 + 8, y: 40 * 16 + 8};
            const tornado = {type: SPRITE_TORNADO, frame: 1, x: position.x - 24, y: position.y - 40, width: 48};

            expect(spriteTile(tornado)).toEqual({x: 30, y: 39});
        });
    });

    describe("following a sprite", () => {

        function newFollower() {
            const onMove = jest.fn();
            const onLost = jest.fn();
            return {follower: new SpriteFollower(onMove, onLost), onMove, onLost};
        }

        it("reports nothing until it follows a sprite", () => {
            const {follower, onMove, onLost} = newFollower();

            follower.update([spriteOver(SPRITE_MONSTER, 30, 40)]);

            expect(onMove).not.toHaveBeenCalled();
            expect(onLost).not.toHaveBeenCalled();
        });

        it("reports where the sprite of its type is each time the sprites move", () => {
            const {follower, onMove} = newFollower();
            follower.follow(SPRITE_MONSTER);

            follower.update([spriteOver(SPRITE_TRAIN, 1, 1), spriteOver(SPRITE_MONSTER, 30, 40)]);
            follower.update([spriteOver(SPRITE_MONSTER, 31, 40)]);

            expect(onMove.mock.calls).toEqual([[{x: 30, y: 40}], [{x: 31, y: 40}]]);
        });

        it("reports the sprite gone once, and nothing after it", () => {
            const {follower, onMove, onLost} = newFollower();
            follower.follow(SPRITE_MONSTER);

            follower.update([spriteOver(SPRITE_TRAIN, 1, 1)]);
            follower.update([]);
            follower.update([spriteOver(SPRITE_MONSTER, 30, 40)]);

            expect(onLost).toHaveBeenCalledTimes(1);
            expect(onMove).not.toHaveBeenCalled();
        });

        it("follows only the last type it was told to", () => {
            const {follower, onMove, onLost} = newFollower();
            follower.follow(SPRITE_MONSTER);
            follower.follow(SPRITE_TORNADO);

            follower.update([spriteOver(SPRITE_MONSTER, 1, 1), spriteOver(SPRITE_TORNADO, 2, 2)]);

            expect(onMove.mock.calls).toEqual([[{x: 2, y: 2}]]);
            expect(onLost).not.toHaveBeenCalled();
        });

        it("follows a new sprite after the last one was gone", () => {
            const {follower, onMove, onLost} = newFollower();
            follower.follow(SPRITE_MONSTER);
            follower.update([]);

            follower.follow(SPRITE_TORNADO);
            follower.update([spriteOver(SPRITE_TORNADO, 2, 2)]);
            follower.update([]);

            expect(onMove.mock.calls).toEqual([[{x: 2, y: 2}]]);
            expect(onLost).toHaveBeenCalledTimes(2);
        });
    });

    describe("opening and closing the view", () => {

        // The view's state, and whether the view shows as it last rendered it
        function newState() {
            const render = jest.fn();
            const state = new ViewState(render);
            const calls = render.mock.calls;
            return {state, render, showing: () => calls.length > 0 && calls[calls.length - 1][0] === true};
        }

        beforeEach(() => {
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it("starts closed", () => {
            const {state, showing} = newState();

            expect(state.isOpen).toBe(false);
            expect(showing()).toBe(false);
        });

        it("opens to show", () => {
            const {state, showing} = newState();

            state.show();

            expect(state.isOpen).toBe(true);
            expect(showing()).toBe(true);
        });

        it("stays open when shown again, opening once: each opening makes the view's WebGL context", () => {
            const {state, render, showing} = newState();

            state.show();
            state.show();

            expect(showing()).toBe(true);
            expect(render).toHaveBeenCalledTimes(1);
        });

        it("closes when asked", () => {
            const {state, showing} = newState();
            state.show();

            state.close();

            expect(state.isOpen).toBe(false);
            expect(showing()).toBe(false);
        });

        it("closes ten seconds after it's asked to close later", () => {
            const {state, showing} = newState();
            state.show();

            state.closeLater();
            jest.advanceTimersByTime(9999);
            expect(showing()).toBe(true);

            jest.advanceTimersByTime(1);
            expect(state.isOpen).toBe(false);
            expect(showing()).toBe(false);
        });

        it("stays closed when closed before it would close by itself", () => {
            const {state, showing} = newState();
            state.show();
            state.closeLater();

            state.close();
            jest.advanceTimersByTime(10000);

            expect(state.isOpen).toBe(false);
            expect(showing()).toBe(false);
        });

        it("forgets closing later once closed", () => {
            const {state, render} = newState();
            state.show();
            state.closeLater();
            state.close();
            const rendered = render.mock.calls.length;

            jest.advanceTimersByTime(10000);

            expect(render).toHaveBeenCalledTimes(rendered);
        });

        it("stays open when shown again before it closes", () => {
            const {state, showing} = newState();
            state.show();
            state.closeLater();

            jest.advanceTimersByTime(5000);
            state.show();
            jest.advanceTimersByTime(10000);

            expect(state.isOpen).toBe(true);
            expect(showing()).toBe(true);
        });
    });

    describe("rendering the view", () => {

        // The view's element: its display, and its classes
        function newElement() {
            const classes = new Set<string>();
            const element: ViewElement = {
                style: {display: ""},
                classList: {
                    toggle(token: string, force: boolean) {
                        if (force) {
                            classes.add(token);
                        } else {
                            classes.delete(token);
                        }
                        return force;
                    },
                },
            };
            return {element, classes};
        }

        it("shows an open view, marked as showing", () => {
            const {element, classes} = newElement();

            renderView(element, true);

            expect(element.style.display).toBe("block");
            expect(Array.from(classes)).toEqual(["showing"]);
        });

        it("hides a closed view, no longer marked as showing", () => {
            const {element, classes} = newElement();
            renderView(element, true);

            renderView(element, false);

            expect(element.style.display).toBe("none");
            expect(classes.size).toBe(0);
        });

        it("stays hidden when closed again", () => {
            const {element, classes} = newElement();
            renderView(element, true);
            renderView(element, false);

            renderView(element, false);

            expect(element.style.display).toBe("none");
            expect(classes.size).toBe(0);
        });
    });
});
