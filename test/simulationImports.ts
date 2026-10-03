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

// A simulation module is any file simulation.js or mapGenerator.js imports, directly or through other modules. None
// may read the clock, an unseeded random source, the DOM or browser storage, or schedule work: what the simulation
// becomes must depend on its seed and its steps alone.

const SRC = path.resolve(__dirname, "../src");
const ROOTS = ["simulation.js", "mapGenerator.js"];

// The global object is banned too, as it reaches every other global by name: globalThis.Date, self.crypto
const FORBIDDEN_GLOBALS = new Set([
    "Date", "performance", "process", "crypto",
    "window", "document", "navigator", "self", "global", "globalThis", "$", "jQuery",
    "localStorage", "sessionStorage", "indexedDB",
    "setTimeout", "setInterval", "setImmediate", "queueMicrotask", "requestAnimationFrame", "requestIdleCallback",
    "require",
]);
const FORBIDDEN_MODULES = new Set(["jquery"]);

interface ParsedModule {
    imports: string[];
    forbidden: string[];
}

function parse(fileName: string, source: string): ParsedModule {
    const kind = fileName.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.JS;
    const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, kind);
    const imports: string[] = [];
    const forbidden: string[] = [];

    function report(node: ts.Node) {
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        forbidden.push(`${fileName}:${line} ${node.getText()}`);
    }

    // An identifier names a global unless it is a member name, as in foo.window or {window: 1}
    function isMemberName(node: ts.Identifier) {
        const parent = node.parent;
        return (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
               (ts.isPropertyAssignment(parent) && parent.name === node) ||
               (ts.isQualifiedName(parent) && parent.right === node);
    }

    // Or unless the module declares that name itself, as in the common var self = this
    const declared = new Set<string>();
    function collectDeclarations(node: ts.Node) {
        if ((ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isFunctionDeclaration(node) ||
             ts.isClassDeclaration(node) || ts.isImportClause(node) || ts.isImportSpecifier(node) ||
             ts.isNamespaceImport(node)) && node.name && ts.isIdentifier(node.name)) {
            declared.add(node.name.text);
        }
        ts.forEachChild(node, collectDeclarations);
    }
    collectDeclarations(sourceFile);

    function isMathRandom(node: ts.Node) {
        if (ts.isPropertyAccessExpression(node)) {
            return ts.isIdentifier(node.expression) && node.expression.text === "Math" && node.name.text === "random";
        }
        return ts.isElementAccessExpression(node) && ts.isIdentifier(node.expression) &&
               node.expression.text === "Math" && ts.isStringLiteralLike(node.argumentExpression) &&
               node.argumentExpression.text === "random";
    }

    function visit(node: ts.Node) {
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier &&
            ts.isStringLiteral(node.moduleSpecifier)) {
            imports.push(node.moduleSpecifier.text);
            if (FORBIDDEN_MODULES.has(node.moduleSpecifier.text)) {
                report(node);
            }
        } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
            // A dynamic import would hide a module from the graph
            report(node);
        } else if (isMathRandom(node)) {
            report(node);
        } else if (ts.isIdentifier(node) && FORBIDDEN_GLOBALS.has(node.text) && !isMemberName(node) &&
                   !declared.has(node.text)) {
            report(node);
        }

        ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return {imports, forbidden};
}

// JavaScript modules name the extension of what they import; TypeScript modules leave it off for TypeScript files
function resolve(fromFile: string, specifier: string): string {
    const base = path.resolve(path.dirname(fromFile), specifier);
    const candidates = path.extname(specifier) ? [base] : [`${base}.ts`, `${base}.js`];
    const found = candidates.find((candidate) => fs.existsSync(candidate));
    if (!found) {
        throw new Error(`${fromFile} imports ${specifier}, which resolves to no file`);
    }
    return found;
}

// Every simulation module, as a path relative to src, with the forbidden references in it
function simulationModules(): Map<string, string[]> {
    const modules = new Map<string, string[]>();
    const pending = ROOTS.map((root) => path.join(SRC, root));

    while (pending.length > 0) {
        const file = pending.pop()!;
        const name = path.relative(SRC, file);
        if (modules.has(name)) {
            continue;
        }

        const parsed = parse(name, fs.readFileSync(file, "utf8"));
        modules.set(name, parsed.forbidden);
        for (const specifier of parsed.imports) {
            if (specifier.startsWith(".")) {
                pending.push(resolve(file, specifier));
            }
        }
    }

    return modules;
}

describe("the simulation's import graph", () => {

    describe("the reference finder", () => {

        it.each([
            ["Math.random", "var r = Math.random();"],
            ["Math['random']", "var r = Math['random']();"],
            ["Date", "var d = new Date();"],
            ["performance.now", "var t = performance.now();"],
            ["process", "var t = process.hrtime();"],
            ["crypto", "crypto.getRandomValues(a);"],
            ["window", "var w = window.innerWidth;"],
            ["document", "document.body.appendChild(e);"],
            ["navigator", "var l = navigator.language;"],
            ["self", "var d = self.Date;"],
            ["global", "var d = global.Date;"],
            ["globalThis", "var d = globalThis.Date;"],
            ["$", "$('#map').hide();"],
            ["jQuery", "jQuery('#map').hide();"],
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
            ["an import of jQuery", "import jq from 'jquery';"],
            ["a dynamic import", "import('./game.js').then(f);"],
        ])("finds %s", (_, source) => {
            expect(parse("module.js", source).forbidden).toHaveLength(1);
        });

        it.each([
            ["a comment", "// Math.random, Date and window are banned here"],
            ["a string", "var s = 'window document';"],
            ["a member name", "var w = city.window; var d = {document: 1};"],
            ["the simulation's stream", "var r = simData.random.getRandom(5);"],
            ["a module's own variable named like a global", "var self = this; f(function() { self.x = 1; });"],
        ])("ignores %s", (_, source) => {
            expect(parse("module.js", source).forbidden).toEqual([]);
        });

        it("reads a module's static imports and re-exports", () => {
            const source = "import { Tile } from './tile.ts';\nexport { Random } from './random';";

            expect(parse("module.ts", source).imports).toEqual(["./tile.ts", "./random"]);
        });
    });

    it("reaches the simulation's subsystems from its roots", () => {
        const modules = simulationModules();

        // boatSprite.js is reached only through spriteManager.js
        for (const name of [...ROOTS, "random.ts", "miscTiles.js", "spriteManager.js", "boatSprite.js"]) {
            expect(modules.has(name)).toBe(true);
        }
    });

    it("reads no clock, unseeded randomness, DOM, browser storage or timers in any simulation module", () => {
        const references = Array.from(simulationModules().values()).flat();

        expect(references).toEqual([]);
    });
});
