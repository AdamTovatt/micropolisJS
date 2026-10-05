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

import * as path from "path";
import ts from "typescript";

// The modules of src/ that a set of roots reaches through their imports, as the TypeScript checker resolves them:
// type-only imports included, since they too tie a module to another

export const SRC = path.resolve(__dirname, "../../src");

const OPTIONS: ts.CompilerOptions = {
    // So a JavaScript module under src/ is found, which the page's graph must not hold
    allowJs: true,
    lib: ["lib.es2020.d.ts", "lib.dom.d.ts"],
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: true,
    target: ts.ScriptTarget.ES2020,
    // No ambient Node or Jest declarations: require, process and the like resolve to nothing
    types: [],
};

// The modules of src/ the roots reach, the roots included, as paths relative to src
export function modulesReachedFrom(roots: string[]): string[] {
    const program = ts.createProgram(roots.map((root) => path.join(SRC, root)), OPTIONS);
    return program.getSourceFiles()
        .filter((sourceFile) => !sourceFile.isDeclarationFile && sourceFile.fileName.startsWith(SRC + path.sep))
        .map((sourceFile) => path.relative(SRC, sourceFile.fileName));
}
