import typescriptEslint from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import security from 'eslint-plugin-security';

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
  // Security (SAST-lite) rules, scoped to the shipped connector code — the
  // same surface CodeQL analyzes. Test fixtures, tooling and benchmarks use
  // fs/regex freely and are not part of the attack surface, so linting them
  // for security only produces noise.
  {
    files: ['lib/**/*.js', 'promise.js', 'callback.js', 'check-node.js'],
    plugins: {
      security
    },
    rules: {
      ...security.configs.recommended.rules,
      // Very noisy in a driver: buffer/array index access and dynamic property
      // reads are pervasive and legitimate here, so this rule mostly reports
      // false positives that bury real findings. CodeQL covers genuine
      // injection sinks with proper dataflow analysis.
      'security/detect-object-injection': 'off'
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
