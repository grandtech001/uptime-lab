// Flat config. Lints all three services from the repo root so CI has one
// lint entry point: `npm run lint`.
const globals = require("globals")

module.exports = [
  {
    ignores: ["**/node_modules/**", "**/coverage/**"],
  },
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "commonjs",
      globals: {
        ...globals.node,
        fetch: "readonly",
        AbortSignal: "readonly",
      },
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-constant-condition": ["error", { checkLoops: false }],
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
]
