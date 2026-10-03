module.exports = {
  collectCoverage: true,
  collectCoverageFrom: [
    "src/**/*.ts",
    "test/**/*.ts",
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
  // Shared test code, imported by the suites
  testPathIgnorePatterns: ["/node_modules/", "/test/helpers/"],
  // The legacy JavaScript modules are ES modules too, so ts-jest compiles both (tsconfig's allowJs).
  transform: {
    "^.+\\.[jt]s$": "ts-jest"
  }
};
