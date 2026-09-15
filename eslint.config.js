const parser = require('@typescript-eslint/parser');

const config = [
  {
    ignores: ["node_modules/**", "dist/**"], // Folder yang akan diabaikan
    files: ["**/*.ts", "**/*.js"],           // File dengan ekstensi .ts dan .js akan dilint
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parser: parser, // Parser untuk TypeScript
    },
    plugins: {
      "@typescript-eslint": {}
    },
    rules: {
      "@typescript-eslint/interface-name-prefix": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/no-explicit-any": "off",
      // "no-console": "error" // Jika kamu ingin mengaktifkan aturan ini
    }
  }
];

module.exports = config;
