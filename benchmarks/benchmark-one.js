//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2026 MariaDB plc

'use strict';

import runBenchSuite from './common-bench.js';

// usage: node benchmarks/benchmark-one.js [benchmark file in benchs/], default do_1_pool.js
const file = process.argv[2] || 'do_1_pool.js';
const bench = await import(`./benchs/${file}`);

await runBenchSuite(bench);
