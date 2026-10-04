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

import type { CitySource } from "../src/citySource";
import { CityState } from "../src/cityState";
import { SPEEDS } from "../src/protocol";
import { SpeedControl } from "../src/speedControl";
import { expectPlayedThrough, playback } from "./helpers/fakeCitySource";
import { BranchName, openNewCity } from "./recordings/scenarios";

// A new city, held, on a source playing back the branch of the recording, with the client's copy of the city. apply
// applies the commands sent, and has the city send what they changed.
async function newGame(branch: BranchName<"newCity">) {
    const source = playback("newCity", branch);
    const state = new CityState(source);
    await openNewCity(source);

    const speed = () => state.current("settings").speed;
    return {source, state, speed, apply: () => source.driver.flush()};
}

// A speed control over the city, as the game builds one as it starts: it sends its commands through the source, and
// follows the settings records the client's copy of the city receives. shown is every paused state the pause button
// has been shown, in order, and sent every speed the control sent.
function control({source, state}: {source: CitySource, state: CityState}) {
    const shown: boolean[] = [];
    const sent: number[] = [];
    const speedControl = new SpeedControl(state.current("settings").speed, (speed) => {
        sent.push(speed);
        source.send({type: "setSpeed", speed});
    }, (paused) => shown.push(paused));
    state.on("settings", (settings) => speedControl.showSpeed(settings.speed));

    return {speedControl, shown, sent};
}

describe("the speed control", () => {

    afterEach(expectPlayedThrough);

    it("pauses a new game and resumes it at medium", async () => {
        const game = await newGame("pause, flush, medium, flush");
        const {speedControl, shown} = control(game);

        speedControl.togglePause();
        await game.apply();
        const paused = game.speed();
        speedControl.togglePause();
        await game.apply();

        expect([paused, game.speed()]).toEqual([SPEEDS.paused, SPEEDS.medium]);
        expect(shown).toEqual([false, true, false]);
    });

    // The button shows the city's speed, so a pause shows once the city has applied it
    it("shows the speed the city has, not the one the player asked for", async () => {
        const game = await newGame("pause");
        const {speedControl, shown} = control(game);

        speedControl.togglePause();

        expect(game.speed()).toBe(SPEEDS.medium);
        expect(shown).toEqual([false]);
    });

    // As for a game saved paused, which starts paused
    it("shows a city paused as the game starts as paused, and resumes it at medium with one Play", async () => {
        const game = await newGame("pause, flush, medium, flush");
        game.source.send({type: "setSpeed", speed: SPEEDS.paused});
        await game.apply();
        const {speedControl, shown} = control(game);

        speedControl.togglePause();
        await game.apply();

        expect(game.speed()).toBe(SPEEDS.medium);
        expect(shown).toEqual([true, false]);
    });

    // As for a game saved running, which starts at the speed it was saved at
    it("resumes a city running as the game starts at the speed it ran at", async () => {
        const game = await newGame("slow, flush, pause, flush, slow, flush");
        game.source.send({type: "setSpeed", speed: SPEEDS.slow});
        await game.apply();
        const {speedControl} = control(game);

        speedControl.togglePause();
        await game.apply();
        speedControl.togglePause();
        await game.apply();

        expect(game.speed()).toBe(SPEEDS.slow);
    });

    it("runs at the speed Settings chooses", async () => {
        const game = await newGame("fast, flush");
        const {speedControl, shown} = control(game);

        speedControl.setRunningSpeed(SPEEDS.fast);
        await game.apply();

        expect(game.speed()).toBe(SPEEDS.fast);
        expect(speedControl.getRunningSpeed()).toBe(SPEEDS.fast);
        expect(shown).toEqual([false, false]);
    });

    // The settings window sends its speed whenever it closes, changed or not
    it("sends nothing when Settings closes at the speed the city already runs at", async () => {
        const game = await newGame("nothing");
        const {speedControl, sent} = control(game);

        speedControl.setRunningSpeed(SPEEDS.medium);

        expect(sent).toEqual([]);
    });

    it("keeps a paused game paused when Settings chooses a speed, and resumes it at that speed", async () => {
        const game = await newGame("pause, flush, flush, fast, flush");
        const {speedControl, shown} = control(game);
        speedControl.togglePause();
        await game.apply();

        speedControl.setRunningSpeed(SPEEDS.fast);
        await game.apply();
        const whilePaused = game.speed();
        speedControl.togglePause();
        await game.apply();

        expect([whilePaused, game.speed()]).toEqual([SPEEDS.paused, SPEEDS.fast]);
        expect(shown).toEqual([false, true, false]);
    });

    // As a replayed log or another player may: Play then resumes at the speed the city last ran at. The other player's
    // commands reach this source only as what the city sends once it applies them.
    it("follows a speed set by another player's command", async () => {
        const game = await newGame("another player's slow, flush, another player's pause, flush, slow, flush");
        const {speedControl, shown} = control(game);
        const players: string[] = [];
        game.state.on("commandResult", ({result}) => players.push(result.player));

        await game.apply();
        await game.apply();
        speedControl.togglePause();
        await game.apply();

        expect(game.speed()).toBe(SPEEDS.slow);
        expect(shown).toEqual([false, false, true, false]);
        expect(players.map((player) => player === game.source.player)).toEqual([false, false, true]);
    });

    // A settings record carries auto-budget and disasters beside the speed
    it("shows nothing new when a setting other than the speed changes", async () => {
        const game = await newGame("auto-budget off, flush");
        const {shown} = control(game);

        game.source.send({type: "setAutoBudget", on: false});
        await game.apply();

        expect(shown).toEqual([false]);
    });
});
