import typescriptEslint from "@typescript-eslint/eslint-plugin";
import stylisticJs from "@stylistic/eslint-plugin";
import indentEmptyLines from "eslint-plugin-indent-empty-lines";
import globals from "globals";
import tsParser from "@typescript-eslint/parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import prettierPlugin from "eslint-plugin-prettier";
import prettierConfig from "eslint-config-prettier";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default [
  // JS / general language options
  {
    languageOptions: {
      globals: { ...globals.node },
      ecmaVersion: 2025,
      sourceType: "module",
    },
    plugins: {
      "@stylistic/js": stylisticJs,
      "indent-empty-lines": indentEmptyLines,
    },
    rules: {
      "@stylistic/js/keyword-spacing": ["error", { before: true, after: true }],
      "@stylistic/js/no-multiple-empty-lines": ["error", { max: 1, maxEOF: 1, maxBOF: 0 }],
      "@stylistic/js/space-before-blocks": ["error", "always"],
      "@stylistic/js/comma-spacing": ["error", { before: false, after: true }],
      "@stylistic/js/space-infix-ops": ["error"],
      "@stylistic/js/brace-style": ["error", "stroustrup"],
      "@stylistic/js/key-spacing": ["error"],
      "@stylistic/js/comma-dangle": ["error", {
        arrays: "always-multiline",
        objects: "always-multiline",
        imports: "always-multiline",
        exports: "always-multiline",
        functions: "always-multiline",
      }],
      "@/quotes": ["error", "double", { avoidEscape: true }],
      "@/semi": ["error", "always"],
      "indent-empty-lines/indent-empty-lines": ["error", 4],
    },
  },
  
  // TypeScript files with type-aware rules
  {
    files: ["*.ts", "*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: __dirname,
        ecmaVersion: 2025,
        sourceType: "module",
      },
      globals: { ...globals.node },
    },
    plugins: {
      "@typescript-eslint": typescriptEslint,
      prettier: prettierPlugin,
    },
    rules: {
      ...typescriptEslint.configs["recommended"].rules,
      ...typescriptEslint.configs["recommended-requiring-type-checking"].rules,
      "prettier/prettier": ["error", prettierConfig, { usePrettierrc: true }],
      // Your custom TS rules overrides
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/unbound-method": ["error", { ignoreStatic: true }],
      "@typescript-eslint/adjacent-overload-signatures": "error",
      "@typescript-eslint/array-type": ["error", { default: "array" }],
      "@typescript-eslint/dot-notation": "error",
      "@typescript-eslint/no-empty-function": "error",
      "@typescript-eslint/no-empty-interface": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-new": "error",
      "@typescript-eslint/no-namespace": "error",
      "@typescript-eslint/no-var-requires": "error",
      "@typescript-eslint/prefer-for-of": "error",
      "@typescript-eslint/prefer-function-type": "error",
      "@typescript-eslint/prefer-namespace-keyword": "error",
      "@typescript-eslint/triple-slash-reference": ["error", { path: "always", types: "prefer-import", lib: "always" }],
      "@typescript-eslint/unified-signatures": "error",
    },
  },
];
