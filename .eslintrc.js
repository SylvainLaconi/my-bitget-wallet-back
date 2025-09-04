module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: "module",
  },
  plugins: ["@typescript-eslint"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "prettier", // doit être en dernier pour désactiver les règles conflictuelles avec Prettier
  ],
  rules: {
    // tes règles personnalisées
    "@typescript-eslint/no-explicit-any": "off",
  },
};
