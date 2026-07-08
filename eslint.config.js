//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2025 MariaDB Corporation Ab

'use strict';

const prettierRecommended = require('eslint-plugin-prettier/recommended');
const tseslint = require('typescript-eslint');
const security = require('eslint-plugin-security');

// rules shared by JavaScript sources and TypeScript definitions
const sharedRules = {
  'linebreak-style': ['error', 'unix'],
  'max-len': ['error', { code: 120, ignoreStrings: true, ignoreTemplateLiterals: true }]
};

module.exports = tseslint.config(
  {
    ignores: ['node_modules/**', 'dist/**', 'coverage/**', '.nyc_output/**']
  },

  // prettier integration (turns off conflicting rules, enables prettier/prettier) for every file
  prettierRecommended,

  // JavaScript sources: lib, tests, tools, root
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module'
    },
    rules: sharedRules
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

  // TypeScript type definitions and type tests (types/*.ts)
  {
    files: ['**/*.ts'],
    extends: [tseslint.configs.recommended],
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 2021,
      sourceType: 'module'
    },
    rules: {
      ...sharedRules,
      // the published declaration files use `import x = require()` (the correct way to type
      // CommonJS modules), and the type tests use unused catch bindings and bare
      // property-access assertions — all legitimate here.
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-unused-expressions': 'off'
    }
  }
);
