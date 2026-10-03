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

import * as fs from "fs";
import * as path from "path";
import ts from "typescript";

// The modules of src/ that a set of roots reaches through their imports, as the TypeScript checker resolves them:
// type-only imports included, since they too tie a module to another

export const SRC = path.resolve(__dirname, "../../src");

// The roots of the simulation: what the city becomes is what these and everything they import compute. Every *Tool.js
// edits the map. The query tool, which only asks the simulation about a tile, is client code in queryTool.ts.
// cityTools.ts holds the map-editing tools and their costs, which the browser and the headless fixtures share.
export const SIMULATION_ROOTS = ["simulation.js", "mapGenerator.js", "cityTools.ts",
                                 ...fs.readdirSync(SRC).filter((file) => file.endsWith("Tool.js"))];

export const OPTIONS: ts.CompilerOptions = {
    allowJs: true,
    allowImportingTsExtensions: true,
    lib: ["lib.es2020.d.ts", "lib.dom.d.ts"],
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: true,
    target: ts.ScriptTarget.ES2020,
    // No ambient Node or Jest declarations: require, process and the like resolve to nothing
    types: [],
};

// A program over the given roots, which may name in-memory files that exist nowhere on disk
export function createProgram(roots: string[], inMemory = new Map<string, string>()): ts.Program {
    const host = ts.createCompilerHost(OPTIONS);
    const getSourceFile = host.getSourceFile;
    const fileExists = host.fileExists;
    const readFile = host.readFile;

    host.getSourceFile = (fileName, languageVersion, ...rest) => inMemory.has(fileName)
        ? ts.createSourceFile(fileName, inMemory.get(fileName)!, languageVersion, true)
        : getSourceFile(fileName, languageVersion, ...rest);
    host.fileExists = (fileName) => inMemory.has(fileName) || fileExists(fileName);
    host.readFile = (fileName) => inMemory.get(fileName) ?? readFile(fileName);

    return ts.createProgram(roots, OPTIONS, host);
}

// The modules of src/ in the program, declaration files aside
export function sourceModules(program: ts.Program): ts.SourceFile[] {
    return program.getSourceFiles().filter((sourceFile) => !sourceFile.isDeclarationFile &&
                                                           sourceFile.fileName.startsWith(SRC + path.sep));
}

// The modules of src/ the roots reach, the roots included, as paths relative to src
export function modulesReachedFrom(roots: string[]): string[] {
    const program = createProgram(roots.map((root) => path.join(SRC, root)));
    return sourceModules(program).map((sourceFile) => path.relative(SRC, sourceFile.fileName));
}
