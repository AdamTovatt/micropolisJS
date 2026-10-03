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

import { EventEmitter } from "../src/eventEmitter.js";
import { SPRITE_DYING, SPRITE_MOVED } from "../src/messages";
import { SpriteFollower, ViewState, isOutOfView } from "../src/monsterTV";
import type { TrackableSprite } from "../src/monsterTV";

// A sprite as the simulation's sprites are: decorated by the event emitter, which they move and die through
interface EmittingSprite extends TrackableSprite {
    _emitEvent(event: string, value?: unknown): void;
}

function newSprite(): EmittingSprite {
    return EventEmitter({}) as EmittingSprite;
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

    describe("following a sprite", () => {

        function newFollower() {
            const onMove = jest.fn();
            const onLost = jest.fn();
            return {follower: new SpriteFollower(onMove, onLost), onMove, onLost};
        }

        it("reports the sprite's moves", () => {
            const {follower, onMove} = newFollower();
            const sprite = newSprite();
            follower.follow(sprite);

            sprite._emitEvent(SPRITE_MOVED, {x: 30, y: 40});
            sprite._emitEvent(SPRITE_MOVED, {x: 31, y: 40});

            expect(onMove.mock.calls).toEqual([[{x: 30, y: 40}], [{x: 31, y: 40}]]);
        });

        it("reports the sprite's death once, and nothing after it", () => {
            const {follower, onMove, onLost} = newFollower();
            const sprite = newSprite();
            follower.follow(sprite);

            sprite._emitEvent(SPRITE_DYING);
            sprite._emitEvent(SPRITE_DYING);
            sprite._emitEvent(SPRITE_MOVED, {x: 30, y: 40});

            expect(onLost).toHaveBeenCalledTimes(1);
            expect(onMove).not.toHaveBeenCalled();
        });

        it("stops hearing a sprite once it follows another", () => {
            const {follower, onMove, onLost} = newFollower();
            const first = newSprite();
            const second = newSprite();
            follower.follow(first);
            follower.follow(second);

            first._emitEvent(SPRITE_MOVED, {x: 1, y: 1});
            first._emitEvent(SPRITE_DYING);
            second._emitEvent(SPRITE_MOVED, {x: 2, y: 2});

            expect(onMove.mock.calls).toEqual([[{x: 2, y: 2}]]);
            expect(onLost).not.toHaveBeenCalled();
        });

        it("follows a new sprite after the last one died", () => {
            const {follower, onMove, onLost} = newFollower();
            const first = newSprite();
            const second = newSprite();
            follower.follow(first);
            first._emitEvent(SPRITE_DYING);

            follower.follow(second);
            second._emitEvent(SPRITE_MOVED, {x: 2, y: 2});
            second._emitEvent(SPRITE_DYING);

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
            return {state, showing: () => calls.length > 0 && calls[calls.length - 1][0] === true};
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

        it("stays open when shown again", () => {
            const {state, showing} = newState();

            state.show();
            state.show();

            expect(showing()).toBe(true);
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
});
