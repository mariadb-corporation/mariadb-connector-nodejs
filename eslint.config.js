//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2025 MariaDB Corporation Ab

'use strict';

const prettierRecommended = require('eslint-plugin-prettier/recommended');
const tseslint = require('typescript-eslint');

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

  // TypeScript type definitions and type tests (types/*.ts)
  {
    files: ['**/*.ts'],
    extends: [tseslint.configs.recommended],
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 2021,
      sourceType: 'module'
    },
    rules: sharedRules
  }
);
