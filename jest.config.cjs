module.exports = {
  collectCoverage: true,
  collectCoverageFrom: [
    "src/**/*.ts",
    "test/**/*.ts",
    // The page's entry point starts the city's worker through import.meta, which only an ES module may use: webpack
    // builds it as one, and ts-jest, compiling to CommonJS, can't. No test runs it.
    "!src/micropolis.ts",
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
  // Several suites replay cities for a few seconds each, past the five-second default on a loaded machine
  testTimeout: 30000,
  // The legacy JavaScript modules are ES modules too, so ts-jest compiles both (tsconfig's allowJs).
  transform: {
    "^.+\\.[jt]s$": "ts-jest"
  }
};
