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

// The rules of a stylesheet, read as far as the tests need: each rule's selector and its declarations, and whether it
// is under an @media query. The rules of any other at-rule, such as @keyframes or @font-face, are left out.

export interface StyleRule {
    selector: string;
    // Each declaration's property and value, in order
    declarations: [string, string][];
    media: boolean;
}

// The text between the brace at the index and the brace that closes it, and the index after that one
function block(css: string, open: number): {inner: string, end: number} {
    let depth = 0;
    for (let at = open; at < css.length; at++) {
        if (css[at] === "{") {
            depth++;
        } else if (css[at] === "}") {
            depth--;
            if (depth === 0) {
                return {inner: css.slice(open + 1, at), end: at + 1};
            }
        }
    }

    throw new Error("The stylesheet has a brace that never closes");
}

function rulesIn(css: string, media: boolean): StyleRule[] {
    const found: StyleRule[] = [];
    let at = 0;

    while (at < css.length) {
        const open = css.indexOf("{", at);
        if (open === -1) {
            break;
        }

        // An at-rule with no block, such as @import
        const statement = css.indexOf(";", at);
        if (statement !== -1 && statement < open && css.slice(at, statement).trim().startsWith("@")) {
            at = statement + 1;
            continue;
        }

        const prelude = css.slice(at, open).trim();
        const {inner, end} = block(css, open);
        if (prelude.startsWith("@media")) {
            found.push(...rulesIn(inner, true));
        } else if (!prelude.startsWith("@")) {
            const declarations = inner.split(";").map((declaration) => declaration.trim())
                .filter((declaration) => declaration !== "")
                .map((declaration): [string, string] => {
                    const colon = declaration.indexOf(":");
                    return [declaration.slice(0, colon).trim(), declaration.slice(colon + 1).trim()];
                });
            found.push({selector: prelude, declarations, media});
        }
        at = end;
    }

    return found;
}

export function styleRules(css: string): StyleRule[] {
    return rulesIn(css.replace(/\/\*[\s\S]*?\*\//g, ""), false);
}
