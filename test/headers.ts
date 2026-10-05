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

import { execFileSync } from "child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { extname, join } from "path";

import { repositoryPath } from "./helpers/repository";

// Every source file opens with the GPL and Micropolis header, exactly as the files of its language carry it, after a
// shebang line if it has one

const ROOT = repositoryPath(".");

const NOTICE = [
    "micropolisJS. Adapted by Graeme McCutcheon from Micropolis.",
    "",
    "This code is released under the GNU GPL v3, with some additional terms.",
    "Please see the files LICENSE and COPYING for details. Alternatively,",
    "consult http://micropolisjs.graememcc.co.uk/LICENSE and",
    "http://micropolisjs.graememcc.co.uk/COPYING",
    "",
    "The name/term \"MICROPOLIS\" is a registered trademark of Micropolis (https://www.micropolis.com) GmbH",
    "(Micropolis Corporation, the \"licensor\") and is licensed here to the authors/publishers of the \"Micropolis\"",
    "city simulation game and its source code (the project or \"licensee(s)\") as a courtesy of the owner.",
    "",
];

// The notice in a block comment, as the C-family languages carry it
const BLOCK_HEADER = [
    `/* ${NOTICE[0]}`,
    ...NOTICE.slice(1).map((line) => line === "" ? " *" : ` * ${line}`),
    " */",
].join("\n") + "\n";

// The notice in line comments, as Python carries it
const HASH_HEADER = NOTICE.map((line) => line === "" ? "#" : `# ${line}`).join("\n") + "\n";

const HEADERS: Record<string, string> = {
    ".ts": BLOCK_HEADER,
    ".js": BLOCK_HEADER,
    ".cjs": BLOCK_HEADER,
    ".cs": BLOCK_HEADER,
    ".c": BLOCK_HEADER,
    ".py": HASH_HEADER,
};

// The files of the languages above that git tracks under the root, by their paths from it, but for any deleted from the
// working tree
function sourceFiles(root: string): string[] {
    return execFileSync("git", ["ls-files", "-z"], {cwd: root, encoding: "utf8"})
        .split("\0")
        .filter((file) => extname(file) in HEADERS && existsSync(join(root, file)))
        .sort();
}

// Whether the text opens with the header, after a shebang line if it has one. A file of CRLF lines reads as LF.
function opensWithHeader(text: string, header: string): boolean {
    const lines = text.replace(/\r\n/g, "\n");
    const afterShebang = lines.startsWith("#!") ? lines.slice(lines.indexOf("\n") + 1) : lines;
    return afterShebang.startsWith(header);
}

// The source files under the root that don't open with their language's header
function headerless(root: string): string[] {
    return sourceFiles(root)
        .filter((file) => !opensWithHeader(readFileSync(join(root, file), "utf8"), HEADERS[extname(file)]));
}

describe("the source files' headers", () => {

    it("are found missing in any language, and found whole after a shebang", () => {
        const root = mkdtempSync(join(tmpdir(), "headers-"));
        try {
            execFileSync("git", ["init", "--quiet"], {cwd: root});
            const files: Record<string, string> = {
                "whole.ts": `${BLOCK_HEADER}\nexport {};\n`,
                "crlf.cs": `${BLOCK_HEADER}\nnamespace A { }\n`.replace(/\n/g, "\r\n"),
                "shebang.py": `#!/usr/bin/env python3\n${HASH_HEADER}\nprint()\n`,
                "shebangOnly.py": "#!/usr/bin/env python3\nprint()\n",
                "deleted.ts": "export {};\n",
                "missing.js": "export default {};\n",
                "missing.cjs": "module.exports = {};\n",
                "missing.c": "int main(void) { return 0; }\n",
                "otherLanguage.py": `${BLOCK_HEADER}\nprint()\n`,
                "cut.ts": BLOCK_HEADER.replace(" * http://micropolisjs.graememcc.co.uk/COPYING\n", ""),
                "late.ts": `export {};\n${BLOCK_HEADER}`,
                "notSource.json": "{}\n",
            };
            Object.keys(files).forEach((file) => writeFileSync(join(root, file), files[file]));
            execFileSync("git", ["add", "."], {cwd: root});
            rmSync(join(root, "deleted.ts"));
            writeFileSync(join(root, "untracked.ts"), "export {};\n");

            expect(headerless(root)).toEqual(
                ["cut.ts", "late.ts", "missing.c", "missing.cjs", "missing.js", "otherLanguage.py", "shebangOnly.py"]);
        } finally {
            rmSync(root, {recursive: true});
        }
    });

    it("open every source file of the repository", () => {
        // A scan that reads nothing finds nothing missing, so it must have read each language's files
        const extensions = new Set(sourceFiles(ROOT).map((file) => extname(file)));
        expect([...extensions].sort()).toEqual(Object.keys(HEADERS).sort());

        expect(headerless(ROOT)).toEqual([]);
    });
});
