/** @type {import("eslint").Linter.Config} */
module.exports = {
  extends: ["@repo/eslint-config/library.js"],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: true,
  },
  ignorePatterns: ["src/index.d.ts"],
  globals: {
    globalThis: "readonly",
  },
  rules: {
    "turbo/no-undeclared-env-vars": [
      "error",
      {
        allowList: [
          "NODE_ENV",
          "DATABASE_URL",
          "TEST_DATABASE_URL",
          "ADMIN_EMAIL",
          "PROD_DB_DUMP_PATH",
        ],
      },
    ],
  },
};
