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

// The contrast of two colours, as WCAG 2 defines it

// WCAG AA's least ratio for normal text
export const AA_NORMAL_TEXT = 4.5;

// The relative luminance of a colour written #rrggbb
export function luminance(hex: string): number {
    if (!/^#[0-9a-f]{6}$/i.test(hex)) {
        throw new Error(`Not a colour written #rrggbb: ${hex}`);
    }

    const [r, g, b] = [1, 3, 5].map((at) => {
        const channel = parseInt(hex.slice(at, at + 2), 16) / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });

    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// The colour a see-through colour written #rrggbbaa, or an opaque one written #rrggbb, makes laid over an opaque one, as
// #rrggbb, each channel rounded to a whole number as a browser draws it
export function laidOver(top: string, under: string): string {
    if (!/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(top) || !/^#[0-9a-f]{6}$/i.test(under)) {
        throw new Error(`Not a colour written #rrggbbaa over one written #rrggbb: ${top} over ${under}`);
    }

    const alpha = top.length === 9 ? parseInt(top.slice(7, 9), 16) / 255 : 1;
    return "#" + [1, 3, 5].map((at) => {
        const channel = parseInt(top.slice(at, at + 2), 16) * alpha + parseInt(under.slice(at, at + 2), 16) * (1 - alpha);
        return Math.round(channel).toString(16).padStart(2, "0");
    }).join("");
}

// A colour as a browser computes it, rgb(r, g, b) or rgba(r, g, b, a), written #rrggbb, or #rrggbbaa where it is
// see-through
export function cssColour(computed: string): string {
    const match = /^rgba?\(([^)]+)\)$/.exec(computed.trim());
    const parts = match?.[1].split(/[\s,/]+/).filter((part) => part !== "").map(Number) ?? [];
    if (parts.length < 3 || parts.length > 4 || parts.some((part) => !Number.isFinite(part))) {
        throw new Error(`Not a colour written rgb() or rgba(): ${computed}`);
    }

    const [r, g, b, a = 1] = parts;
    const hex = (value: number) => Math.round(value).toString(16).padStart(2, "0");
    return `#${hex(r)}${hex(g)}${hex(b)}${a < 1 ? hex(a * 255) : ""}`;
}

// The contrast ratio of two colours written #rrggbb, from 1 to 21, whichever is the lighter
export function contrastRatio(a: string, b: string): number {
    const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (light + 0.05) / (dark + 0.05);
}
