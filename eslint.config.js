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
    // The game: bundled by webpack and run in the browser.
    files: ["src/**/*.js"],
    languageOptions: {
      globals: globals.browser,
    },
  },
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
    files: ["test/**/*.ts"],
    languageOptions: {
      globals: globals.jest,
    },
  },
);
