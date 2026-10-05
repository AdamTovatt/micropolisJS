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

import { execFileSync } from "child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { extname, join } from "path";

import { repositoryPath } from "./helpers/repository";

// Every source file, pages and stylesheets among them, opens with the GPL and Micropolis header in exactly one of its
// two forms, as the files of its language carry it, after a shebang line if it has one: a file new to the continuation
// credits the continuation, and a file derived from upstream's code keeps Graeme McCutcheon's credit with the
// continuation's notice that it was modified

const ROOT = repositoryPath(".");

const NEW_CREDIT = [
    "micropolisJS, continued by Adam Tovatt from Graeme McCutcheon's micropolisJS.",
    "Copyright (C) 2026 Adam Tovatt",
];

// Graeme McCutcheon's credit, the first line of upstream's header
const UPSTREAM_CREDIT = "micropolisJS. Adapted by Graeme McCutcheon from Micropolis.";

const DERIVED_CREDIT = [
    UPSTREAM_CREDIT,
    "Modified in Adam Tovatt's continuation of micropolisJS. Copyright (C) 2026 Adam Tovatt",
];

// The GPL, EA and Micropolis text both forms go on with, naming the site that serves the license. The pages name
// upstream's site on GitHub Pages, and every other file the site upstream's code was first served from.
function license(site: string): string[] {
    return [
        "",
        "This code is released under the GNU GPL v3, with some additional terms.",
        "Please see the files LICENSE and COPYING for details. Alternatively,",
        `consult ${site}/LICENSE and`,
        `${site}/COPYING`,
        "",
        "The name/term \"MICROPOLIS\" is a registered trademark of Micropolis (https://www.micropolis.com) GmbH",
        "(Micropolis Corporation, the \"licensor\") and is licensed here to the authors/publishers of the \"Micropolis\"",
        "city simulation game and its source code (the project or \"licensee(s)\") as a courtesy of the owner.",
        "",
    ];
}

const LICENSE = license("http://micropolisjs.graememcc.co.uk");
const PAGE_LICENSE = license("https://graememcc.github.io/micropolisJS");

// A notice in a block comment, as the C-family languages and CSS carry it
function blockHeader(notice: string[]): string {
    return [
        `/* ${notice[0]}`,
        ...notice.slice(1).map((line) => line === "" ? " *" : ` * ${line}`),
        " */",
    ].join("\n") + "\n";
}

// A notice in line comments, as Python carries it
function hashHeader(notice: string[]): string {
    return notice.map((line) => line === "" ? "#" : `# ${line}`).join("\n") + "\n";
}

// A notice in an HTML comment after the doctype, as the pages carry it
function pageHeader(notice: string[]): string {
    return [
        "<!DOCTYPE html>",
        "",
        "<!--",
        ...notice.map((line) => line === "" ? " *" : ` * ${line}`),
        " * -->",
    ].join("\n") + "\n";
}

// The two forms' notices on a license text, the new one first
function forms(licenseText: string[]): string[][] {
    return [[...NEW_CREDIT, ...licenseText], [...DERIVED_CREDIT, ...licenseText]];
}

const BLOCK_HEADERS = forms(LICENSE).map(blockHeader);
const HASH_HEADERS = forms(LICENSE).map(hashHeader);
const PAGE_HEADERS = forms(PAGE_LICENSE).map(pageHeader);

const HEADERS: Record<string, string[]> = {
    ".ts": BLOCK_HEADERS,
    ".js": BLOCK_HEADERS,
    ".cjs": BLOCK_HEADERS,
    ".cs": BLOCK_HEADERS,
    ".c": BLOCK_HEADERS,
    ".css": BLOCK_HEADERS,
    ".py": HASH_HEADERS,
    ".html": PAGE_HEADERS,
};

// The files of the languages above that git tracks under the root, by their paths from it, but for any deleted from the
// working tree
function sourceFiles(root: string): string[] {
    return execFileSync("git", ["ls-files", "-z"], {cwd: root, encoding: "utf8"})
        .split("\0")
        .filter((file) => extname(file) in HEADERS && existsSync(join(root, file)))
        .sort();
}

// Whether the text opens with one of the headers, after a shebang line if it has one, and carries no header after it.
// A file of CRLF lines reads as LF.
function carriesOneHeaderForm(text: string, headers: string[]): boolean {
    const lines = text.replace(/\r\n/g, "\n");
    const afterShebang = lines.startsWith("#!") ? lines.slice(lines.indexOf("\n") + 1) : lines;
    const opening = headers.find((header) => afterShebang.startsWith(header));
    if (opening === undefined) {
        return false;
    }

    const rest = afterShebang.slice(opening.length);
    return !headers.some((header) => rest.includes(header));
}

// The source files under the root that don't open with exactly one form of their language's header
function withoutOneHeaderForm(root: string): string[] {
    return sourceFiles(root)
        .filter((file) => !carriesOneHeaderForm(readFileSync(join(root, file), "utf8"), HEADERS[extname(file)]));
}

describe("the source files' headers", () => {

    it("are found missing in any language, in neither form or in both, and found whole after a shebang", () => {
        const [newBlock, derivedBlock] = BLOCK_HEADERS;
        const [newHash, derivedHash] = HASH_HEADERS;
        const [newPage, derivedPage] = PAGE_HEADERS;
        // The single header every file carried before the continuation's two forms
        const oldBlock = blockHeader([UPSTREAM_CREDIT, ...LICENSE]);
        const oldHash = hashHeader([UPSTREAM_CREDIT, ...LICENSE]);
        const oldPage = pageHeader([UPSTREAM_CREDIT, ...PAGE_LICENSE]);
        const root = mkdtempSync(join(tmpdir(), "headers-"));
        try {
            execFileSync("git", ["init", "--quiet"], {cwd: root});
            const files: Record<string, string> = {
                "new.ts": `${newBlock}\nexport {};\n`,
                "derived.ts": `${derivedBlock}\nexport {};\n`,
                "crlf.cs": `${derivedBlock}\nnamespace A { }\n`.replace(/\n/g, "\r\n"),
                "shebang.py": `#!/usr/bin/env python3\n${newHash}\nprint()\n`,
                "derived.py": `${derivedHash}\nprint()\n`,
                "shebangOnly.py": "#!/usr/bin/env python3\nprint()\n",
                "deleted.ts": "export {};\n",
                "missing.js": "export default {};\n",
                "missing.cjs": "module.exports = {};\n",
                "missing.c": "int main(void) { return 0; }\n",
                "otherLanguage.py": `${newBlock}\nprint()\n`,
                "cut.ts": derivedBlock.replace(" * http://micropolisjs.graememcc.co.uk/COPYING\n", ""),
                "late.ts": `export {};\n${newBlock}`,
                "old.ts": `${oldBlock}\nexport {};\n`,
                "old.py": `${oldHash}\nprint()\n`,
                "both.ts": `${newBlock}${derivedBlock}\nexport {};\n`,
                "bothLater.cs": `${derivedBlock}\nnamespace A { }\n${newBlock}`,
                "both.py": `${derivedHash}${newHash}\nprint()\n`,
                "mixedCredits.ts": blockHeader([...NEW_CREDIT, ...DERIVED_CREDIT, ...LICENSE]),
                "new.html": `${newPage}<html></html>\n`,
                "derived.html": `${derivedPage}<html></html>\n`,
                "old.html": `${oldPage}<html></html>\n`,
                "both.html": `${newPage}<html></html>\n${derivedPage}`,
                "otherSite.html": `${pageHeader([...DERIVED_CREDIT, ...LICENSE])}<html></html>\n`,
                "pageSite.ts": `${blockHeader([...NEW_CREDIT, ...PAGE_LICENSE])}\nexport {};\n`,
                "otherLanguage.html": `${derivedBlock}<html></html>\n`,
                "derived.css": `${derivedBlock}\n* { }\n`,
                "missing.css": "* { }\n",
                "notSource.json": "{}\n",
                "notSource.sql": "SELECT 1;\n",
            };
            Object.keys(files).forEach((file) => writeFileSync(join(root, file), files[file]));
            execFileSync("git", ["add", "."], {cwd: root});
            rmSync(join(root, "deleted.ts"));
            writeFileSync(join(root, "untracked.ts"), "export {};\n");

            expect(withoutOneHeaderForm(root)).toEqual([
                "both.html", "both.py", "both.ts", "bothLater.cs", "cut.ts", "late.ts", "missing.c", "missing.cjs",
                "missing.css", "missing.js", "mixedCredits.ts", "old.html", "old.py", "old.ts", "otherLanguage.html",
                "otherLanguage.py", "otherSite.html", "pageSite.ts", "shebangOnly.py",
            ]);
        } finally {
            rmSync(root, {recursive: true});
        }
    });

    it("open every source file of the repository", () => {
        // A scan that reads nothing finds nothing missing, so it must have read each language's files
        const extensions = new Set(sourceFiles(ROOT).map((file) => extname(file)));
        expect([...extensions].sort()).toEqual(Object.keys(HEADERS).sort());

        expect(withoutOneHeaderForm(ROOT)).toEqual([]);
    });
});
