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

import { STYLE_PROPERTIES } from "../src/rci";
import { AA_NORMAL_TEXT, contrastRatio, laidOver } from "./helpers/contrast";
import { repositoryPath } from "./helpers/repository";
import { StyleRule, styleRules } from "./helpers/stylesheet";

// The page's colours, the --hud- properties the stylesheet's :root gives, which the HUD, the windows and the screens
// before a city opens all take theirs from: every text colour, --hud-<name>-text, meets WCAG AA's 4.5:1
// for normal text against its background, --hud-<name>-background. A see-through background is laid over its ground,
// --hud-<name>-ground, where it names one, and over the map where it doesn't, which the ratio must hold over at its
// darkest and its lightest, pure black and pure white, as the map shows through unchanged. Every text and
// background colour a rule of theirs sets is one of them, so no rule sets one the ratio was never checked for, and a rule
// setting a text colour sets its background too, unless that background is another pair's, which an enclosing element
// paints. Borders, outlines and shadows carry no text, and are left out. What the browser paints in each state, a
// button's under the pointer among them, the end-to-end layout check measures (e2e/layoutCheck.ts).

// Custom properties by name, as :root sets them
type Colours = ReadonlyMap<string, string>;

// The declarations that set a text or background colour
const COLOUR_PROPERTIES = ["color", "background-color", "background"];

const STYLESHEET = styleRules(readFileSync(repositoryPath("css/style.css"), "utf8"));
const INDEX = readFileSync(repositoryPath("index.html"), "utf8");

// Everything the page shows in its wrapper: the HUD's panels over the map, the windows and the screens before a city
// opens
const WRAPPER = /<div id="wrapper">[\s\S]*<\/body>/.exec(INDEX)![0];

// What the wrapper's markup names: each element's id, as #id, and each class it has, as .class. A class the client's
// code gives an element there is styled under the id of the element it is in.
const WRAPPER_NAMES = new Set([
    ...Array.from(WRAPPER.matchAll(/\sid="([\w-]+)"/g), (match) => `#${match[1]}`),
    ...Array.from(WRAPPER.matchAll(/\sclass="([^"]*)"/g), (match) => match[1].split(/\s+/)).flat()
        .filter((name) => name !== "").map((name) => `.${name}`),
]);

// The custom properties :root sets outside any at-rule, by name
const ROOT_PROPERTIES = new Map(STYLESHEET.filter((rule) => rule.selector === ":root" && rule.atRules.length === 0)
    .flatMap((rule) => rule.declarations).filter(([name]) => name.startsWith("--")));

// The HUD's colours among them
const HUD_COLOURS: Colours = new Map(Array.from(ROOT_PROPERTIES).filter(([name]) => name.startsWith("--hud-")));

// The darkest and the lightest the map can be under a see-through background
const MAP_EXTREMES = ["#000000", "#ffffff"];

// The property a value names, or null for a value that names none
function named(value: string): string | null {
    return /^var\((--hud-[\w-]+)\)$/.exec(value)?.[1] ?? null;
}

// The colour a HUD property is, as #rrggbb, or #rrggbbaa for a see-through one, through any property it names
function resolve(colours: Colours, value: string, seen: string[] = []): string {
    const reference = named(value);
    if (reference !== null) {
        const referenced = colours.get(reference);
        if (referenced === undefined || seen.includes(reference)) {
            throw new Error(`${reference} names no HUD colour`);
        }

        return resolve(colours, referenced, [...seen, reference]);
    }

    if (!/^#[0-9a-f]{6}([0-9a-f]{2})?$/.test(value)) {
        throw new Error(`A HUD colour is #rrggbb or #rrggbbaa, or another HUD colour, not ${value}`);
    }

    return value;
}

// The colours a background is painted in, from its own down to the map's: its colour, then its ground's, and so on. A
// background written as another is that one, with that one's ground.
function layers(colours: Colours, background: string, seen: string[] = []): string[] {
    const value = colours.get(background);
    if (value === undefined || seen.includes(background)) {
        throw new Error(`${background} names no HUD background`);
    }

    const reference = named(value);
    if (reference !== null) {
        return layers(colours, reference, [...seen, background]);
    }

    const ground = colours.get(background.replace(/-background$/, "-ground"));
    if (ground === undefined) {
        return [resolve(colours, value)];
    }

    const under = named(ground);
    if (under === null || !under.endsWith("-background")) {
        throw new Error(`The ground of ${background} is another background, not ${ground}`);
    }

    return [resolve(colours, value), ...layers(colours, under, [...seen, background])];
}

// What the background looks like over each of the map's extremes, as #rrggbb
function seenOver(colours: Colours, background: string): string[] {
    return MAP_EXTREMES.map((map) => layers(colours, background).reduceRight((under, top) => laidOver(top, under), map));
}

// The name of each pair of a text colour and its background
function pairNames(colours: Colours): string[] {
    return Array.from(colours.keys()).filter((name) => name.endsWith("-text"))
        .map((name) => name.slice(0, -"-text".length));
}

function escaped(name: string): string {
    return name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Whether the rule's selector names any part of the wrapper
function isWrapperRule(rule: StyleRule): boolean {
    return Array.from(WRAPPER_NAMES).some((name) => new RegExp(`${escaped(name)}(?![\\w-])`).test(rule.selector));
}

// The pair a declaration's value names, for the end given, -text or -background, or undefined for none
function pairOf(value: string | undefined, end: string): string | undefined {
    return value === undefined ? undefined : new RegExp(`^var\\((--hud-[\\w-]+)-${end}\\)$`).exec(value)?.[1];
}

// What is wrong with the colours the rules set: a text or background colour that isn't one of the colours, and a text
// colour set on a background other than its own, or on none where its own background is not another pair's
function ruleProblems(rules: StyleRule[], colours: Colours): string[] {
    return rules.flatMap((rule) => {
        const set = rule.declarations.filter(([name]) => COLOUR_PROPERTIES.includes(name));
        const loose = set.filter(([, value]) => !/^var\(--hud-[\w-]+\)$/.test(value))
            .map(([name, value]) => `${rule.selector} sets ${name}: ${value}`);

        const text = set.find(([name]) => name === "color")?.[1];
        const background = set.find(([name]) => name !== "color")?.[1];
        const pair = pairOf(text, "text");
        const painted = pair !== undefined && named(colours.get(`${pair}-background`) ?? "") !== null;
        const unmatched = text !== undefined && pair !== pairOf(background, "background") &&
            !(background === undefined && painted) ?
            [`${rule.selector} sets ${text} on ${background ?? "no background"}`] : [];

        return [...loose, ...unmatched];
    });
}

// The tools of the tool buttons the page has
function tools(): string[] {
    return Array.from(INDEX.matchAll(/data-tool="(\w+)"/g), (match) => match[1]);
}

describe("the HUD's colours", () => {

    it("are each a text colour, its background, its background's ground, or a fill, written as #rrggbb, as " +
       "#rrggbbaa or as another of them", () => {
        const misnamed = Array.from(HUD_COLOURS.keys())
            .filter((name) => !/-(text|background|ground|fill)$/.test(name));
        const unpaired = Array.from(HUD_COLOURS.keys()).filter((name) => /-(background|ground)$/.test(name))
            .filter((name) => !HUD_COLOURS.has(name.replace(/-(background|ground)$/, "-text")));
        const seeThroughText = Array.from(HUD_COLOURS.keys()).filter((name) => name.endsWith("-text"))
            .filter((name) => resolve(HUD_COLOURS, HUD_COLOURS.get(name)!).length !== 7);

        expect(HUD_COLOURS.size).toBeGreaterThan(0);
        expect(misnamed).toEqual([]);
        expect(unpaired).toEqual([]);
        expect(seeThroughText).toEqual([]);
        HUD_COLOURS.forEach((value) => resolve(HUD_COLOURS, value));
    });

    it("give every text WCAG AA's contrast against its background, over the darkest and the lightest map", () => {
        const failing = pairNames(HUD_COLOURS).flatMap((pair) => {
            if (!HUD_COLOURS.has(`${pair}-background`)) {
                return [`${pair}: no background`];
            }

            const text = resolve(HUD_COLOURS, HUD_COLOURS.get(`${pair}-text`)!);
            return seenOver(HUD_COLOURS, `${pair}-background`).flatMap((background, at) => {
                const ratio = contrastRatio(text, background);
                return ratio >= AA_NORMAL_TEXT ? [] : [`${pair}: ${ratio.toFixed(2)}:1 over ${MAP_EXTREMES[at]}`];
            });
        });

        expect(failing).toEqual([]);
    });

    // So the checks below can't pass by finding nothing to check
    it("are found in the rules for the page's wrapper, as the markup names its parts", () => {
        const found = STYLESHEET.filter(isWrapperRule).map((rule) => rule.selector);

        expect(found).toEqual(expect.arrayContaining([
            "#notifications.bad", "#statusPanel .statusCap", "#splashCityList .splashCityId", "#portButton", ".hudPanel",
            ".hudButton", ".hudPanel .foldTitle", ".hudWindow, .hudScreen", ".hudWindowTitle", ".hudField",
            "#flagsTable th", "#signInError",
        ]));
    });

    it("are the only text and background colours those rules set, a text colour with its background unless an " +
       "enclosing element paints it", () => {
        expect(ruleProblems(STYLESHEET.filter(isWrapperRule), HUD_COLOURS)).toEqual([]);
    });

    it("give each tool button its own accent along its top, which is its outline on the map", () => {
        const sets = (selector: string, name: string, value: string) => STYLESHEET.some((rule) =>
            rule.selector.split(",").map((s) => s.trim()).includes(selector) &&
            rule.declarations.some(([declared, set]) => declared === name && set === value));

        const unset = tools().filter((tool) =>
            !HUD_COLOURS.has(`--hud-tool-${tool}-fill`) ||
            !sets(`#${tool}Button`, "border-top-color", `var(--hud-tool-${tool}-fill)`));

        // Every tool button is found, so none goes unchecked
        expect(tools()).toHaveLength(Array.from(INDEX.matchAll(/class="toolButton\b/g)).length);
        expect(tools().length).toBeGreaterThan(0);
        expect(unset).toEqual([]);
    });

    // The meter reads them as the page starts, and fails then on one the stylesheet doesn't set
    it("give the demand meter every colour it draws in, and the font", () => {
        const {bars, font, ...others} = STYLE_PROPERTIES;

        expect([...bars, ...Object.values(others)].filter((name) => !HUD_COLOURS.has(name))).toEqual([]);
        expect(ROOT_PROPERTIES.has(font)).toBe(true);
    });
});

// The checks above, on colours and rules planted for them, so neither can pass by reporting nothing
describe("the HUD's colour checks", () => {

    const PLANTED: Colours = new Map([
        ["--hud-base-text", "#ffffff"],
        ["--hud-base-background", "#000000"],
        ["--hud-glass-text", "#ffffff"],
        ["--hud-glass-background", "#ffffff80"],
        ["--hud-glass-ground", "var(--hud-base-background)"],
        ["--hud-on-glass-text", "#cccccc"],
        ["--hud-on-glass-background", "var(--hud-glass-background)"],
        ["--hud-loose-text", "#ffffff"],
        ["--hud-loose-background", "#ffffff80"],
    ]);

    it("lay a see-through background over its ground, and that over the map", () => {
        expect(layers(PLANTED, "--hud-glass-background")).toEqual(["#ffffff80", "#000000"]);
        expect(seenOver(PLANTED, "--hud-glass-background")).toEqual(["#808080", "#808080"]);
    });

    it("take a background written as another for that one, with its ground", () => {
        expect(layers(PLANTED, "--hud-on-glass-background")).toEqual(layers(PLANTED, "--hud-glass-background"));
    });

    it("lay a see-through background that names no ground over the map", () => {
        expect(layers(PLANTED, "--hud-loose-background")).toEqual(["#ffffff80"]);
        expect(seenOver(PLANTED, "--hud-loose-background")).toEqual(["#808080", "#ffffff"]);
    });

    it("pass a text colour set with its own background, or alone where an enclosing element paints its background", () => {
        expect(ruleProblems([
            {selector: "#paired", declarations: [["color", "var(--hud-base-text)"],
                                                 ["background-color", "var(--hud-base-background)"]], atRules: []},
            {selector: "#painted", declarations: [["color", "var(--hud-on-glass-text)"]], atRules: []},
        ], PLANTED)).toEqual([]);
    });

    it("report a text colour alone whose background no enclosing element paints, one on another's background, and " +
       "a colour that isn't one of the HUD's", () => {
        expect(ruleProblems([
            {selector: "#alone", declarations: [["color", "var(--hud-glass-text)"]], atRules: []},
            {selector: "#crossed", declarations: [["color", "var(--hud-base-text)"],
                                                  ["background-color", "var(--hud-glass-background)"]], atRules: []},
            {selector: "#loose", declarations: [["background-color", "#123456"]], atRules: []},
        ], PLANTED)).toEqual([
            "#alone sets var(--hud-glass-text) on no background",
            "#crossed sets var(--hud-base-text) on var(--hud-glass-background)",
            "#loose sets background-color: #123456",
        ]);
    });
});
