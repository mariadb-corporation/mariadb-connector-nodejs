//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2025 MariaDB Corporation Ab

'use strict';

// Generates the CommonJS type declarations (types/*.d.cts) from the ESM ones (types/*.d.ts).
// A .d.cts file is identical to its .d.ts source except that relative import specifiers use the
// `.cjs` extension. The .d.cts files are published (see package.json "exports" / "files") so that
// `require()` consumers resolve types under CommonJS semantics; generating them from the single
// hand-edited .d.ts source stops the two copies drifting apart.
//
//   node tools/generate-cts.js            (re)generate types/*.d.cts
//   node tools/generate-cts.js --check    exit non-zero if any .d.cts is out of sync

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const typesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'types');
const modules = ['index', 'callback', 'share'];
const banner = '// AUTO-GENERATED from the matching .d.ts by tools/generate-cts.js — do not edit.\n';

// Rewrite relative `from './x.js'` specifiers to `.cjs`; bare and `node:` imports are left as-is.
const toCommonJs = (src) => banner + src.replace(/(from\s+['"]\.\/[^'"]+)\.js(['"])/g, '$1.cjs$2');

const check = process.argv.includes('--check');
let drift = false;

for (const name of modules) {
  const generated = toCommonJs(readFileSync(join(typesDir, `${name}.d.ts`), 'utf8'));
  const target = join(typesDir, `${name}.d.cts`);
  if (check) {
    const current = existsSync(target) ? readFileSync(target, 'utf8') : '';
    if (current !== generated) {
      drift = true;
      console.error(`✗ types/${name}.d.cts is out of sync with types/${name}.d.ts`);
    }
  } else {
    writeFileSync(target, generated);
    console.log(`✓ generated types/${name}.d.cts`);
  }
}

if (check && drift) {
  console.error('\nRun `npm run build:types` and commit the regenerated files.');
  process.exit(1);
}
