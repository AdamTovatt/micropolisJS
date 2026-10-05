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

import { readFileSync } from "fs";

import { AA_NORMAL_TEXT, contrastRatio } from "./helpers/contrast";
import { repositoryPath } from "./helpers/repository";
import { StyleRule, styleRules } from "./helpers/stylesheet";

// The HUD's colours, as the stylesheet's :root gives them: every text colour, --hud-<name>-text, meets WCAG AA's 4.5:1
// for normal text against its background, --hud-<name>-background, which the rule setting the text colour sets too.
// Every text and background colour a HUD rule sets is one of them, so no rule sets one the ratio was never checked
// for. Borders and outlines carry no text, and are left out.

// The declarations that set a text or background colour
const COLOUR_PROPERTIES = ["color", "background-color", "background"];

const STYLESHEET = styleRules(readFileSync(repositoryPath("css/style.css"), "utf8"));
const INDEX = readFileSync(repositoryPath("index.html"), "utf8");

// The HUD is everything in the page's main element, outside the windows
const MAIN = /<main[\s\S]*<\/main>/.exec(INDEX)![0];

// What the HUD's markup names: each element's id, as #id, and each class it has, as .class. A class the client's code
// gives a HUD element is styled under the id of the element it is in.
const HUD_NAMES = new Set([
    ...Array.from(MAIN.matchAll(/\sid="([\w-]+)"/g), (match) => `#${match[1]}`),
    ...Array.from(MAIN.matchAll(/\sclass="([^"]*)"/g), (match) => match[1].split(/\s+/)).flat()
        .filter((name) => name !== "").map((name) => `.${name}`),
]);

// The HUD's colours, as :root gives them outside any query, by name
const HUD_COLOURS = new Map(STYLESHEET.filter((rule) => rule.selector === ":root" && !rule.media)
    .flatMap((rule) => rule.declarations).filter(([name]) => name.startsWith("--hud-")));

// The colour a HUD property is, as #rrggbb, through any property it names
function resolve(value: string, seen: string[] = []): string {
    const reference = /^var\((--hud-[\w-]+)\)$/.exec(value);
    if (reference !== null) {
        const named = HUD_COLOURS.get(reference[1]);
        if (named === undefined || seen.includes(reference[1])) {
            throw new Error(`${value} names no HUD colour`);
        }

        return resolve(named, [...seen, reference[1]]);
    }

    if (!/^#[0-9a-f]{6}$/.test(value)) {
        throw new Error(`A HUD colour is #rrggbb, or another HUD colour, not ${value}`);
    }

    return value;
}

// The name of each pair of a text colour and its background
function pairNames(): string[] {
    return Array.from(HUD_COLOURS.keys()).filter((name) => name.endsWith("-text"))
        .map((name) => name.slice(0, -"-text".length));
}

function escaped(name: string): string {
    return name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Whether the rule's selector names any part of the HUD
function isHudRule(rule: StyleRule): boolean {
    return Array.from(HUD_NAMES).some((name) => new RegExp(`${escaped(name)}(?![\\w-])`).test(rule.selector));
}

// The pair a declaration's value names, for the end given, -text or -background, or undefined for none
function pairOf(value: string | undefined, end: string): string | undefined {
    return value === undefined ? undefined : new RegExp(`^var\\((--hud-[\\w-]+)-${end}\\)$`).exec(value)?.[1];
}

// The tools of the tool buttons the page has
function tools(): string[] {
    return Array.from(INDEX.matchAll(/data-tool="(\w+)"/g), (match) => match[1]);
}

describe("the HUD's colours", () => {

    it("are each a text colour, its background, or a fill, written as #rrggbb or as another of them", () => {
        const misnamed = Array.from(HUD_COLOURS.keys())
            .filter((name) => !/-(text|background|fill)$/.test(name));
        const unpaired = Array.from(HUD_COLOURS.keys()).filter((name) => name.endsWith("-background"))
            .filter((name) => !HUD_COLOURS.has(name.replace(/-background$/, "-text")));

        expect(HUD_COLOURS.size).toBeGreaterThan(0);
        expect(misnamed).toEqual([]);
        expect(unpaired).toEqual([]);
        HUD_COLOURS.forEach((value) => resolve(value));
    });

    it("give every text WCAG AA's contrast against its background", () => {
        const failing = pairNames().flatMap((pair) => {
            const background = HUD_COLOURS.get(`${pair}-background`);
            if (background === undefined) {
                return [`${pair}: no background`];
            }

            const ratio = contrastRatio(resolve(HUD_COLOURS.get(`${pair}-text`)!), resolve(background));
            return ratio >= AA_NORMAL_TEXT ? [] : [`${pair}: ${ratio.toFixed(2)}:1`];
        });

        expect(failing).toEqual([]);
    });

    // So the checks below can't pass by finding nothing to check
    it("are found in the HUD's rules, as the markup names its parts", () => {
        const found = STYLESHEET.filter(isHudRule).map((rule) => rule.selector);

        expect(found).toEqual(expect.arrayContaining([
            ".cancel, #debugRequest, #pauseRequest, .foldButton", "#notifications.bad", "#statusPanel .statusCap",
            "#splashCityList .splashCityId", "#portButton", ".mintcream, .neutral",
        ]));
    });

    it("are the only text and background colours the HUD's rules set, a text colour with its background", () => {
        const problems = STYLESHEET.filter(isHudRule).flatMap((rule) => {
            const colours = rule.declarations.filter(([name]) => COLOUR_PROPERTIES.includes(name));
            const loose = colours.filter(([, value]) => !/^var\(--hud-[\w-]+\)$/.test(value))
                .map(([name, value]) => `${rule.selector} sets ${name}: ${value}`);

            const text = colours.find(([name]) => name === "color")?.[1];
            const background = colours.find(([name]) => name !== "color")?.[1];
            const unmatched = text !== undefined && pairOf(text, "text") !== pairOf(background, "background") ?
                [`${rule.selector} sets ${text} on ${background ?? "no background"}`] : [];

            return [...loose, ...unmatched];
        });

        expect(problems).toEqual([]);
    });

    it("give each tool button its own pair, whose background is its outline on the map", () => {
        const sets = (selector: string, name: string, value: string) => STYLESHEET.some((rule) =>
            rule.selector.split(",").map((s) => s.trim()).includes(selector) &&
            rule.declarations.some(([declared, set]) => declared === name && set === value));

        const unset = tools().filter((tool) =>
            !sets(`#${tool}Button`, "color", `var(--hud-tool-${tool}-text)`) ||
            !sets(`#${tool}Button`, "background-color", `var(--hud-tool-${tool}-background)`));

        // Every tool button is found, so none goes unchecked
        expect(tools()).toHaveLength(Array.from(INDEX.matchAll(/class="toolButton\b/g)).length);
        expect(tools().length).toBeGreaterThan(0);
        expect(unset).toEqual([]);
    });
});
