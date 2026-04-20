/** @type {import("jest").Config} **/
module.exports = {
  testEnvironment: "node",
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "tsconfig.test.json" }],
    "^.+\\.js$": ["ts-jest", { tsconfig: "tsconfig.test.json", diagnostics: false }],
  },
  transformIgnorePatterns: [
    "node_modules/(?!@noble/)",
  ],
};
