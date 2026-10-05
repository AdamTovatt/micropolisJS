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
import { join } from "path";

// A path from the repository root, for the files the TypeScript and C# tests share
export function repositoryPath(relativePath: string): string {
    return join(__dirname, "../..", relativePath);
}

// The JSON of a file the TypeScript and C# tests share, read in place by its path from the repository root
export function repositoryJson<T>(relativePath: string): T {
    return JSON.parse(readFileSync(repositoryPath(relativePath), "utf8")) as T;
}
