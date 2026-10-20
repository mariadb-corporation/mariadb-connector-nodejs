//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2026 MariaDB plc

'use strict';

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

// Each benchmark runs in its own process: the drivers share the process, and the heap left by a
// benchmark (a batch of 100 inserts, thousands of 1000-row results) slowed the following ones by
// up to a quarter, for every driver, so the figures depended on the order of the files.
const dir = path.dirname(fileURLToPath(import.meta.url));
const runner = path.join(dir, 'benchmark-one.js');
const list = (await fs.readdir(path.join(dir, 'benchs'))).sort();

for (const file of list) {
  const code = await new Promise((resolve) => {
    spawn(process.execPath, [runner, file], { stdio: 'inherit', env: process.env }).on('close', resolve);
  });
  if (code !== 0) {
    console.error(`benchmark ${file} exited with code ${code}`);
    process.exit(code);
  }
}
