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
  // Shared test code, imported by the suites, and the script that records what the fake city source plays back
  testPathIgnorePatterns: ["/node_modules/", "/test/helpers/", "/test/recordings/"],
  // The suites that start the server, and the server's cities they play, take past the five-second default on a loaded
  // machine
  testTimeout: 30000,
  transform: {
    "^.+\\.ts$": "ts-jest"
  }
};
