/** @type {import("jest").Config} **/
module.exports = {
  testEnvironment: "node",
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "tsconfig.test.json" }],
    "^.+\\.js$": ["ts-jest", { tsconfig: "tsconfig.test.json", diagnostics: false }],
  },
  // Source uses nodenext-style `.js` extensions on relative imports; strip them so
  // Jest's resolver finds the `.ts` sources at runtime.
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  transformIgnorePatterns: [
    "node_modules/(?!@noble/)",
  ],
};
