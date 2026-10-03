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

import * as path from "path";
import ts from "typescript";
import { OPTIONS, SRC, sourceModules } from "./helpers/importGraph";

// The city's worker has no window and no document: every TypeScript module it imports type-checks against the Web
// Worker library, which has neither. The simulation's JavaScript modules are held to less already
// (simulationImports.ts).

const WORKER = "cityWorker.ts";

describe("the worker's import graph", () => {

    // Checked as strictly as tsconfig.json checks them, since some of their types depend on it
    const program = ts.createProgram([path.join(SRC, WORKER)], {
        ...OPTIONS,
        lib: ["lib.es2020.d.ts", "lib.es2022.error.d.ts", "lib.webworker.d.ts"],
        strict: true,
    });
    const modules = sourceModules(program).filter((sourceFile) => sourceFile.fileName.endsWith(".ts"));

    // So the check below covers the modules the worker runs beside the simulation
    it("reaches the city host from the worker", () => {
        expect(modules.map((sourceFile) => path.relative(SRC, sourceFile.fileName)))
            .toEqual(expect.arrayContaining([WORKER, "cityWorkerHost.ts", "cityHost.ts", "commandQueue.ts"]));
    });

    it("uses nothing a worker lacks", () => {
        const problems = modules.flatMap((sourceFile) => program.getSemanticDiagnostics(sourceFile)).map((diagnostic) =>
            `${path.relative(SRC, diagnostic.file!.fileName)}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`);

        expect(problems).toEqual([]);
    });
});
