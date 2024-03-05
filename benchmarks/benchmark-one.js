//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

const fs = require('fs');
const createBenchSuite = require('./common-bench');

const launchBench = async function (path) {
  const bench = require('./benchs/select_1000_rows.js');
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
