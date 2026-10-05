/* micropolisJS. Adapted by Graeme McCutcheon from Micropolis.
 * Modified in Adam Tovatt's continuation of micropolisJS. Copyright (C) 2026 Adam Tovatt
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

module.exports = {
  // Coverage is collected only when asked for, by npm run test:coverage, and of the client alone
  collectCoverageFrom: [
    "src/**/*.ts",
  ],
  coverageReporters: ["json", "lcov", "text", "html"],
  moduleFileExtensions: [
    "ts",
    "js",
  ],
  roots: [
    "<rootDir>/src",
    "<rootDir>/test",
  ],
  testEnvironment: "node",
  testMatch: ["**/test/*.ts", "**/test/**/*.ts"],
  // Shared test code, imported by the suites, and the script that records what the fake city source plays back
  testPathIgnorePatterns: ["/node_modules/", "/test/helpers/", "/test/recordings/"],
  // The suites that start the server, and the server's cities they play, take past the five-second default on a loaded
  // machine
  testTimeout: 30000,
  transform: {
    "^.+\\.ts$": "ts-jest"
  }
};
