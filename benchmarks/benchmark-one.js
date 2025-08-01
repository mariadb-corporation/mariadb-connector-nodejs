//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

import fs from 'fs';
import createBenchSuite from './common-bench.js';
import * as bench from './benchs/do_1_pool.js';

const launchBench = async function (path) {
  const suite = await createBenchSuite(bench);
  suite.run();
};

fs.access('./benchs', async function (err) {
  if (err) {
    fs.access('./benchmarks/benchs', async function (err) {
      await launchBench('./benchmarks/benchs');
    });
  } else {
    await launchBench('./benchs');
  }
});
