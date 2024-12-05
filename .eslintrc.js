module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint", "react-hooks", "react-refresh", "simple-import-sort", "import"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/eslint-recommended",
    "plugin:@typescript-eslint/recommended",
    "prettier",
  ],
  rules: {
    "@typescript-eslint/ban-ts-comment": "off",
    "@typescript-eslint/consistent-type-imports": "error",
    "@typescript-eslint/no-empty-function": "off",
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      },
    ],
    "no-console": ["error", { allow: ["warn", "error"] }],
    "no-case-declarations": "off",
    "react-hooks/exhaustive-deps": "error",
    "react-hooks/rules-of-hooks": "error",
    "react-refresh/only-export-components": ["error", { allowConstantExport: true }],
    "simple-import-sort/imports": "error",
    "simple-import-sort/exports": "error",
    "import/first": "error",
    "import/newline-after-import": "error",
    "import/no-duplicates": "error",
  },
};
