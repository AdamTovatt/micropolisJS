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
import * as os from "os";
import * as path from "path";
import ts from "typescript";

// The client works on the DOM directly: jQuery is not a dependency, and no module may import it

const SRC = path.resolve(__dirname, "../src");

// Each module under the directory, at any depth, by its path from there, with what it imports: its imports and
// re-exports, and its dynamic imports and requires
function modulesUnder(root: string): {file: string, imports: string[]}[] {
    return fs.readdirSync(root, {recursive: true, encoding: "utf8"})
        .filter((file) => /\.[jt]s$/.test(file))
        .map((file) => ({
            file: file.split(path.sep).join("/"),
            imports: ts.preProcessFile(fs.readFileSync(path.join(root, file), "utf8"), true, true).importedFiles
                .map((imported) => imported.fileName),
        }));
}

function isJquery(specifier: string): boolean {
    return specifier === "jquery" || specifier.startsWith("jquery/");
}

// The modules under the directory that import jQuery
function jqueryImporters(root: string): string[] {
    return modulesUnder(root).filter(({imports}) => imports.some(isJquery)).map(({file}) => file);
}

describe("jQuery", () => {

    it("is found however a module imports it, at any depth", () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "noJquery-"));
        try {
            const files: Record<string, string> = {
                "imports.ts": "import $ from 'jquery';",
                "reexports.ts": "export { default } from 'jquery';",
                "dynamic.ts": "const $ = await import('jquery');",
                "requires.js": "const $ = require('jquery');",
                "nested/slim.js": "import $ from 'jquery/dist/jquery.slim.js';",
                "nested/clean.ts": "import { Text } from './text';",
                "notAModule.css": "@import 'jquery';",
            };
            fs.mkdirSync(path.join(root, "nested"));
            Object.keys(files).forEach((file) => fs.writeFileSync(path.join(root, file), files[file]));

            expect(jqueryImporters(root).sort())
                .toEqual(["dynamic.ts", "imports.ts", "nested/slim.js", "reexports.ts", "requires.js"]);
        } finally {
            fs.rmSync(root, {recursive: true});
        }
    });

    it("is imported by no module in src/", () => {
        // The entry point imports the splash screen, so a scan that misses it read nothing
        expect(modulesUnder(SRC).find(({file}) => file === "micropolis.ts")?.imports).toContain("./splashScreen");

        expect(jqueryImporters(SRC)).toEqual([]);
    });
});
