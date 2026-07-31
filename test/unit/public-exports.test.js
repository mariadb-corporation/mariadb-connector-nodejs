//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2026 MariaDB Corporation Ab

'use strict';

import { assert, describe, test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import * as promiseApi from '../../promise.js';
import * as callbackApi from '../../callback.js';

// A declaration promising a value the entry point does not export is only found by whoever imports
// it: `import { X } from 'mariadb'` is a hard SyntaxError in ESM, and `undefined` in CJS. That is how
// `SqlError` reached a release bound to the module namespace object instead of the class (#348), and
// how `StreamCallback` was declared as a function while being a callback type. Both directions are
// checked here: nothing declared may be missing at runtime, nothing exported may be undeclared.

// the public API, as the entry points must expose it
const EXPECTED = {
  SqlError: 'function',
  Types: 'object',
  TypeNumbers: 'object',
  createConnection: 'function',
  createPool: 'function',
  createPoolCluster: 'function',
  defaultOptions: 'function',
  importFile: 'function',
  version: 'string'
};

// members of `declare const _default` in index.d.ts / callback.d.ts
const DEFAULT_MEMBERS = [
  'version',
  'SqlError',
  'defaultOptions',
  'createConnection',
  'createPool',
  'createPoolCluster',
  'importFile'
];

const typesDir = path.resolve('types');
const readTypes = (file) => fs.readFileSync(path.join(typesDir, file), 'utf8');

/**
 * Names a .d.ts declares as values - a type alias, an interface or a `const enum` (erased by
 * TypeScript) declares no value and is therefore not expected at runtime.
 */
const declaredValues = (dts) => {
  const names = new Set();
  for (const [, name] of dts.matchAll(/^export (?:function|enum) (\w+)/gm)) names.add(name);
  // `export const X: T` declares a value, `export const enum X {` does not (it is erased)
  for (const [, name] of dts.matchAll(/^export const (\w+)\s*:/gm)) names.add(name);
  return names;
};

describe.concurrent('public API exports', () => {
  for (const [label, api] of [
    ['promise', promiseApi],
    ['callback', callbackApi]
  ]) {
    test(`${label} API exports exactly the documented values`, () => {
      for (const [name, kind] of Object.entries(EXPECTED)) {
        assert.strictEqual(typeof api[name], kind, `${label}: '${name}' must be a ${kind}`);
      }
      const unexpected = Object.keys(api).filter((k) => k !== 'default' && !(k in EXPECTED));
      assert.deepEqual(unexpected, [], `${label}: undocumented export(s)`);
    });

    // the default export carries what `declare const _default` lists - Types/TypeNumbers are
    // named exports only, in the declarations as well as at runtime
    test(`${label} default export holds exactly its declared members`, () => {
      for (const name of DEFAULT_MEMBERS) {
        assert.strictEqual(typeof api.default[name], EXPECTED[name], `${label}: default.${name}`);
      }
      assert.deepEqual(Object.keys(api.default).sort(), [...DEFAULT_MEMBERS].sort(), `${label}: default export drift`);
    });
  }

  test('SqlError is the class the driver throws, not a namespace object', () => {
    for (const [label, api] of [
      ['promise', promiseApi],
      ['callback', callbackApi]
    ]) {
      assert.isTrue(new api.SqlError('x') instanceof api.SqlError, `${label}: instanceof fails`);
      assert.isFalse(new Error('x') instanceof api.SqlError, `${label}: plain Error matches`);
    }
  });

  test('every value declared by the type definitions exists at runtime', () => {
    // share.d.ts is re-exported by both entry declarations (`export * from './share.js'`)
    for (const file of ['share.d.ts', 'index.d.ts', 'callback.d.ts']) {
      const api = file === 'callback.d.ts' ? callbackApi : promiseApi;
      for (const name of declaredValues(readTypes(file))) {
        assert.isTrue(name in api, `${file} declares value '${name}', missing from the runtime exports`);
      }
    }
  });
});
