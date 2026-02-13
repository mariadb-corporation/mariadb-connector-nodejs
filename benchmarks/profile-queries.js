//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2025 MariaDB Corporation Ab

'use strict';

import * as mariadb from '../promise.js';
import conf from '../test/conf.js';

const config = Object.assign({}, conf.baseConfig);
const query = process.argv[2] || 'DO 1';
const iterations = parseInt(process.argv[3] || '10000', 10);

console.log(`Profiling: "${query}" x ${iterations}`);

const conn = await mariadb.createConnection(config);

// warmup
for (let i = 0; i < 100; i++) {
  await conn.query(query);
}

const start = process.hrtime.bigint();
for (let i = 0; i < iterations; i++) {
  await conn.query(query);
}
const elapsed = Number(process.hrtime.bigint() - start) / 1e6;
console.log(
  `${iterations} iterations in ${elapsed.toFixed(0)}ms (${(iterations / (elapsed / 1000)).toFixed(0)} ops/s)`
);

await conn.end();
