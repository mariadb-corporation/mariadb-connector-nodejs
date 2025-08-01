import typescriptEslint from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';

export default [
  // JavaScript files
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parser: typescriptParser
    },
    rules: {
      'max-len': ['error', { code: 120 }],
      'linebreak-style': ['error', 'unix']
    }
  },
  // TypeScript files
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parser: typescriptParser
    },
    plugins: {
      '@typescript-eslint': typescriptEslint
    },
    rules: {
      'max-len': ['error', { code: 120 }],
      'linebreak-style': ['error', 'unix'],
      '@typescript-eslint/no-unused-vars': 'error'
    }
  }
];
