/* micropolisJS, continued by Adam Tovatt from Graeme McCutcheon's micropolisJS.
 * Copyright (C) 2026 Adam Tovatt
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

import { readFileSync } from "fs";

import { WALKWAY_KINDS } from "../src/protocol";
import { WalkwayKindChoice } from "../src/walkwayKinds";
import { repositoryPath } from "./helpers/repository";
import { RULES } from "./helpers/ruleConstants";

// A kind's button as the choice reads it: the kind its data-kind names, the clicks it hears and whether it shows as
// pressed
class FakeButton {
    readonly dataset: {kind?: string};
    readonly attributes = new Map<string, string>();
    private readonly clicks: ((e: {preventDefault(): void}) => void)[] = [];

    constructor(kind: string) {
        this.dataset = {kind};
    }

    addEventListener(_: "click", listener: (e: {preventDefault(): void}) => void): void {
        this.clicks.push(listener);
    }

    setAttribute(name: string, value: string): void {
        this.attributes.set(name, value);
    }

    click(): void {
        this.clicks.forEach((listener) => listener({preventDefault: () => {}}));
    }
}

// The strip of the kinds' buttons given, and whether it is hidden
class FakeStrip {
    hidden = true;
    readonly classList = {toggle: (_: string, on: boolean) => this.hidden = on};

    constructor(readonly buttons: FakeButton[]) {}

    querySelectorAll(): FakeButton[] {
        return this.buttons;
    }
}

function choiceOn(kinds: readonly string[]): {strip: FakeStrip, choice: WalkwayKindChoice} {
    const strip = new FakeStrip(kinds.map((kind) => new FakeButton(kind)));
    return {strip, choice: new WalkwayKindChoice(strip as unknown as HTMLElement)};
}

describe("the Walkway tool's choice of kind", () => {

    it("lays a path until another kind's button is pressed, and marks the kind chosen pressed", () => {
        const {strip, choice} = choiceOn(WALKWAY_KINDS);
        const first = choice.kind;
        strip.buttons.find((button) => button.dataset.kind === "underpass")!.click();

        expect([first, choice.kind, strip.buttons.map((button) => [button.dataset.kind, button.attributes.get("aria-pressed")])])
            .toEqual(["path", "underpass", WALKWAY_KINDS.map((kind) => [kind, String(kind === "underpass")])]);
    });

    it("shows its strip only while the Walkway tool is held", () => {
        const {strip, choice} = choiceOn(WALKWAY_KINDS);
        const shown: boolean[] = [];
        for (const tool of ["walkway", "road", null, "walkway"] as const) {
            choice.showFor(tool);
            shown.push(!strip.hidden);
        }

        expect(shown).toEqual([true, false, false, true]);
    });

    it("fails on a button that names no kind, and on a kind no button offers", () => {
        expect(() => choiceOn([...WALKWAY_KINDS, "bridge"])).toThrow("A walkway kind button names no kind: bridge");
        expect(() => choiceOn(["path", "underpass"])).toThrow("No walkway kind button offers these kinds: footbridge");
    });

    // The page's strip offers each kind at the rules' price, a path's a ninth and the others' a tile
    it("offers each kind on the page at what the rules charge for it", () => {
        const page = readFileSync(repositoryPath("index.html"), "utf8");
        const offered = WALKWAY_KINDS.map((kind) =>
            new RegExp(`data-kind="${kind}"[^>]*>.*?<span class="toolCost">([^<]*)</span>`).exec(page)?.[1]);

        expect(offered).toEqual(WALKWAY_KINDS.map((kind) =>
            `$${RULES.walkwayCosts[kind]} a ${kind === "path" ? "ninth" : "tile"}`));
    });
});
