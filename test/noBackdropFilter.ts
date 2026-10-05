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

import * as fs from "fs";
import * as path from "path";

import { repositoryPath } from "./helpers/repository";
import { styleRules } from "./helpers/stylesheet";

// No element of the page blurs what lies behind it: the browser draws a backdrop filter again whenever what is under it
// changes, which over the map, with cars on it, is every frame. So no rule of the stylesheet sets one, with or without a
// vendor prefix, under any at-rule, a keyframe's included, not even to none; and since a page's markup or the client's
// code could set one on an element too, neither names one at all.

const STYLESHEET = fs.readFileSync(repositoryPath("css/style.css"), "utf8");

// The client's modules, by their path under src/, and the pages, by their path in the repository's root
const MODULES = fs.readdirSync(repositoryPath("src"), {recursive: true, encoding: "utf8"})
    .filter((file) => /\.[jt]s$/.test(file)).map((file) => path.join("src", file));
const PAGES = fs.readdirSync(repositoryPath(".")).filter((file) => file.endsWith(".html"));

// A backdrop filter, as a stylesheet's property or a script's name for it, with any vendor prefix
const BACKDROP_PROPERTY = /^(-[a-z]+-)?backdrop-filter$/i;
const BACKDROP_NAME = /backdrop-?filter/i;

// Each backdrop filter a stylesheet's rules set, as the at-rules it is under, its selector, its property and its value
function backdropFilters(css: string): string[] {
    return styleRules(css).flatMap(({selector, declarations, atRules}) => declarations
        .filter(([property]) => BACKDROP_PROPERTY.test(property))
        .map(([property, value]) => [...atRules, selector, `${property}: ${value}`].join(" > ")));
}

// The files, by their path in the repository, whose text names a backdrop filter
function namingBackdropFilters(files: string[]): string[] {
    return files.filter((file) => BACKDROP_NAME.test(fs.readFileSync(repositoryPath(file), "utf8")));
}

describe("backdrop filters", () => {

    it("are found in any rule of a stylesheet, prefixed or not, under any at-rule and set to none, but not in a " +
       "comment or a condition", () => {
        const planted = `
            .panel { color: red; backdrop-filter: blur(4px) saturate(1.1); }
            .glass{-webkit-backdrop-filter:blur(2px)}
            /* .commented { backdrop-filter: blur(1px); } */
            @supports ( backdrop-filter: blur(1px)) {
                .supported {
                    BACKDROP-FILTER: none;
                }
                @media (min-width: 1px) { .both { margin: 0; backdrop-filter: var(--blur) } }
            }
            @keyframes fade { to { backdrop-filter: blur(3px); } }
            .other { --panel-blur: blur(10px); filter: blur(1px); }
        `;

        expect(backdropFilters(planted)).toEqual([
            ".panel > backdrop-filter: blur(4px) saturate(1.1)",
            ".glass > -webkit-backdrop-filter: blur(2px)",
            "@supports ( backdrop-filter: blur(1px)) > .supported > BACKDROP-FILTER: none",
            "@supports ( backdrop-filter: blur(1px)) > @media (min-width: 1px) > .both > backdrop-filter: var(--blur)",
            "@keyframes fade > to > backdrop-filter: blur(3px)",
        ]);
    });

    it("can't be set in a rule nested in another, which the stylesheet's reading refuses", () => {
        expect(() => backdropFilters(".outer { .inner { backdrop-filter: blur(1px); } }"))
            .toThrow("The stylesheet nests a rule in .outer");
    });

    it("are set by no rule of the page's stylesheet", () => {
        // The panel's rule is read from it, so a check that passes read the stylesheet
        expect(styleRules(STYLESHEET).map(({selector}) => selector)).toContain(".hudPanel");

        expect(backdropFilters(STYLESHEET)).toEqual([]);
    });

    it("are named by no module of the client's and no page", () => {
        // The entry point and the game's page are among them, so a check that passes read them
        expect(MODULES).toContain(path.join("src", "micropolis.ts"));
        expect(PAGES).toContain("index.html");

        expect(namingBackdropFilters([...MODULES, ...PAGES])).toEqual([]);
    });

    it("are named however a script or a page's markup sets one", () => {
        expect([
            "element.style.backdropFilter = 'blur(4px)';",
            "element.style.webkitBackdropFilter = 'blur(4px)';",
            "element.style.setProperty('-webkit-backdrop-filter', 'blur(4px)');",
            "<div style=\"backdrop-filter: blur(4px)\"></div>",
            "<style>.panel { backdrop-filter: blur(4px); }</style>",
            "element.style.filter = 'blur(4px)';",
        ].map((text) => BACKDROP_NAME.test(text))).toEqual([true, true, true, true, true, false]);
    });
});
