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

// A simulation module is any file the simulation, the map generator or a map-editing tool imports, directly or
// through other modules. What the city becomes must depend on its seed, its steps and the edits applied to it alone,
// so a simulation module may use only pure, portable built-ins: no clock, no unseeded randomness, no DOM, storage,
// timers or packages, and no Math function whose result can differ between runtimes.

const SRC = path.resolve(__dirname, "../src");

// Every tool but the query tool edits the map; the query tool only reads it to fill the query window
const ROOTS = ["simulation.js", "mapGenerator.js",
               ...fs.readdirSync(SRC).filter((file) => file.endsWith("Tool.js") && file !== "queryTool.js")];

// The globals a simulation module may use. Any other global, whether the environment defines it or not, is a finding.
const PURE_GLOBALS = new Set([
    "Array", "BigInt", "Boolean", "Error", "Infinity", "JSON", "Map", "NaN", "Number", "Object", "RangeError", "Set",
    "String", "Symbol", "TypeError", "WeakMap", "WeakSet", "arguments", "console", "isFinite", "isNaN", "parseInt",
    "undefined",
]);

// The Math functions whose results are exact on every runtime. Math may be used only as Math.<one of these>.
const PORTABLE_MATH = new Set(["abs", "ceil", "clz32", "floor", "imul", "max", "min", "round", "sign", "trunc"]);

const OPTIONS: ts.CompilerOptions = {
    allowJs: true,
    allowImportingTsExtensions: true,
    lib: ["lib.es2020.d.ts", "lib.dom.d.ts"],
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: true,
    target: ts.ScriptTarget.ES2020,
    // No ambient Node or Jest declarations: require, process and the like resolve to nothing, and are findings
    types: [],
};

// A program over the given roots, which may name in-memory files that exist nowhere on disk
function createProgram(roots: string[], inMemory = new Map<string, string>()): ts.Program {
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

// The references in a module that a simulation module must not make, each as file:line text
function findForbidden(program: ts.Program, sourceFile: ts.SourceFile): string[] {
    const checker = program.getTypeChecker();
    const fileName = path.relative(SRC, sourceFile.fileName);
    const forbidden: string[] = [];

    function report(node: ts.Node, what = node.getText()) {
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        forbidden.push(`${fileName}:${line} ${what}`);
    }

    // A member name, as in foo.window or {window: 1}, names no global
    function isMemberName(node: ts.Identifier) {
        const parent = node.parent;
        return ((ts.isPropertyAccessExpression(parent) || ts.isPropertyAssignment(parent) ||
                 ts.isMethodDeclaration(parent) || ts.isPropertyDeclaration(parent) ||
                 ts.isGetAccessorDeclaration(parent) || ts.isSetAccessorDeclaration(parent)) && parent.name === node) ||
               (ts.isBindingElement(parent) && parent.propertyName === node);
    }

    // A global is a name the module and its imports never declare: one from the environment, or from nowhere
    function isGlobal(node: ts.Identifier) {
        const parent = node.parent;
        const symbol = ts.isShorthandPropertyAssignment(parent) && parent.name === node
            ? checker.getShorthandAssignmentValueSymbol(parent)
            : checker.getSymbolAtLocation(node);
        const declarations = symbol?.declarations ?? [];
        return declarations.every((declaration) => program.isSourceFileDefaultLibrary(declaration.getSourceFile()));
    }

    function visit(node: ts.Node): void {
        // Types vanish at run time
        if (ts.isTypeNode(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) {
            return;
        }

        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier &&
            ts.isStringLiteral(node.moduleSpecifier)) {
            const specifier = node.moduleSpecifier.text;
            if (!specifier.startsWith(".")) {
                report(node, `imports the package ${specifier}`);
            } else if (!ts.resolveModuleName(specifier, sourceFile.fileName, OPTIONS, ts.sys).resolvedModule) {
                // An import that resolves to nothing would hide its module from the graph
                report(node, `imports ${specifier}, which resolves to no file`);
            }
        } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
            // So would a dynamic import
            report(node);
        } else if (ts.isBinaryExpression(node) && (node.operatorToken.kind === ts.SyntaxKind.AsteriskAsteriskToken ||
                   node.operatorToken.kind === ts.SyntaxKind.AsteriskAsteriskEqualsToken)) {
            // Exponentiation is Math.pow
            report(node);
        } else if (ts.isIdentifier(node) && !isMemberName(node) && isGlobal(node)) {
            const parent = node.parent;
            if (node.text === "Math") {
                const portable = ts.isPropertyAccessExpression(parent) && parent.expression === node &&
                                 PORTABLE_MATH.has(parent.name.text);
                if (!portable) {
                    report(parent);
                }
            } else if (!PURE_GLOBALS.has(node.text)) {
                report(node);
            }
        }

        ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return forbidden;
}

// Every simulation module, as a path relative to src, with the forbidden references in it
function simulationModules(): Map<string, string[]> {
    const program = createProgram(ROOTS.map((root) => path.join(SRC, root)));
    const modules = new Map<string, string[]>();

    for (const sourceFile of program.getSourceFiles()) {
        if (!sourceFile.isDeclarationFile && sourceFile.fileName.startsWith(SRC + path.sep)) {
            modules.set(path.relative(SRC, sourceFile.fileName), findForbidden(program, sourceFile));
        }
    }

    return modules;
}

describe("the simulation's import graph", () => {

    describe("the reference finder", () => {

        const FINDS: [string, string][] = [
            ["Math.random", "var r = Math.random();"],
            ["Math['random']", "var r = Math['random']();"],
            ["Math.sqrt", "var r = Math.sqrt(2);"],
            ["Math passed around", "var m = Math; m.floor(1);"],
            ["exponentiation", "var r = 3 ** 0.5;"],
            ["Date", "var d = new Date();"],
            ["performance.now", "var t = performance.now();"],
            ["process", "var t = process.hrtime();"],
            ["crypto", "crypto.getRandomValues(a);"],
            ["window", "var w = window.innerWidth;"],
            ["window in a shorthand property", "var o = {window};"],
            ["document", "document.body.appendChild(e);"],
            ["navigator", "var l = navigator.language;"],
            ["self", "var d = self.location;"],
            ["global", "var g = global;"],
            ["globalThis", "var g = globalThis;"],
            ["$", "$('#map').hide();"],
            ["jQuery", "jQuery('#map').hide();"],
            ["fetch", "fetch('/city');"],
            ["localStorage", "localStorage.getItem('game');"],
            ["sessionStorage", "sessionStorage.getItem('game');"],
            ["indexedDB", "indexedDB.open('game');"],
            ["setTimeout", "setTimeout(f, 0);"],
            ["setInterval", "setInterval(f, 10);"],
            ["setImmediate", "setImmediate(f);"],
            ["queueMicrotask", "queueMicrotask(f);"],
            ["requestAnimationFrame", "requestAnimationFrame(f);"],
            ["requestIdleCallback", "requestIdleCallback(f);"],
            ["require", "var g = require('./game.js');"],
            ["a global behind another function's local of the same name",
             "function g() { var performance = 1; return performance; } var t = performance.now();"],
            ["an import of a package", "import jq from 'jquery';"],
            ["an import that resolves to no file", "import { x } from './missing.js';"],
            ["a dynamic import", "import('./game.js').then(f);"],
        ];

        const IGNORES: [string, string][] = [
            ["a comment", "// Math.random, Date and window are banned here"],
            ["a string", "var s = 'window document';"],
            ["a member name", "var w = a.window; var d = {document: 1};"],
            ["the simulation's stream", "var r = a.random.getRandom(5);"],
            ["a module's own variable named like a global", "var self = this; f(function() { self.x = 1; });"],
            ["portable Math", "var m = Math.floor(Math.max(a, 1));"],
            ["pure built-ins", "var s = new Map(); var k = Object.keys(JSON.parse('{}'));"],
        ];

        // Each snippet is a module of its own in one program, with a, e and f declared for it to use
        const snippetPath = (i: number) => path.join(SRC, "__snippets__", `snippet${i}.js`);
        const snippets = [...FINDS, ...IGNORES];
        const program = createProgram(
            snippets.map((_, i) => snippetPath(i)),
            new Map(snippets.map(([, source], i) => [snippetPath(i), `var a, e, f;\n${source}\nexport {};\n`])));
        const findings = (i: number) => findForbidden(program, program.getSourceFile(snippetPath(i))!);

        it.each(FINDS.map(([name], i) => [name, i]))("finds %s", (_, i) => {
            expect(findings(i)).toHaveLength(1);
        });

        it.each(IGNORES.map(([name], i) => [name, FINDS.length + i]))("ignores %s", (_, i) => {
            expect(findings(i)).toEqual([]);
        });
    });

    it("reaches the simulation's subsystems and the editing tools from its roots", () => {
        const modules = simulationModules();

        // boatSprite.js is reached only through spriteManager.js, and worldEffects.js only through the tools
        for (const name of ["simulation.js", "mapGenerator.js", "random.ts", "miscTiles.js", "boatSprite.js",
                            "bulldozerTool.js", "parkTool.js", "worldEffects.js"]) {
            expect(modules.has(name)).toBe(true);
        }
    });

    it("uses only pure, portable built-ins in every simulation module", () => {
        const references = Array.from(simulationModules().values()).flat();

        expect(references).toEqual([]);
    });
});
