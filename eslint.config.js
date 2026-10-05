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

import { defineConfig } from "eslint/config";
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
  {
    ignores: ["coverage/", "dist/"],
  },
  js.configs.recommended,
  {
    // Build and tool configuration, run by Node.
    files: ["*.js", "*.cjs"],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ["**/*.ts"],
    extends: [tseslint.configs.recommended],
    rules: {
      // Members are public by default, so the modifier is never written out
      "@typescript-eslint/explicit-member-accessibility": ["error", {accessibility: "no-public"}],
      // Interface names carry no I prefix
      "@typescript-eslint/naming-convention": ["error", {
        selector: "interface",
        format: null,
        custom: {regex: "^I[A-Z]", match: false},
      }],
    },
  },
  {
    // A promise nobody awaits fails silently, so each is awaited, handled, or marked void with the reason nothing
    // waits on it. These rules read types, through the project service from tsconfig.json.
    files: ["src/**/*.ts", "test/**/*.ts", "e2e/**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
    },
  },
  {
    files: ["test/**/*.ts"],
    languageOptions: {
      globals: globals.jest,
    },
  },
);
