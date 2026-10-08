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

import RULE_CONSTANTS from "../../conformance/ruleConstants.json";
import type { ToolName } from "../../src/protocol";

// The rules' numbers the client's tests count with, as the fixture tool writes them from the C# rules to
// conformance/ruleConstants.json (conformance/README.md), so no test copies one that could drift from the rules

interface RuleConstants {
    // The steps a unit of city time takes at each running speed
    stepsPerCityTime: {slow: number, medium: number, fast: number};
    cityTimesPerYear: number;
    // The steps a hosted city takes a second, and the steps of its step clock between a station's departures
    stepsPerSecond: number;
    departureInterval: number;
    toolCosts: Record<ToolName, number>;
    // The advisor conditions' messages, in the order the status record lists them
    advisorConditions: string[];
    // Each sprite type, as the state messages number it, with its frames, counting from 1
    spriteTypes: {type: number, name: string, frames: number}[];
    // The tiles along each side of a block of the fire department's cover map
    fireCoverBlockSize: number;
    // The map's size in tiles
    mapSize: {width: number, height: number};
}

// Imported as a module rather than read from a path, since the recorder and the end-to-end suite run it as an ES
// module, which has no __dirname for repositoryPath
export const RULES: RuleConstants = RULE_CONSTANTS;

// A sprite type's number, by its name
export function spriteType(name: string): number {
    const type = RULES.spriteTypes.find((each) => each.name === name);
    if (type === undefined) {
        throw new Error(`No sprite type ${name}`);
    }

    return type.type;
}
