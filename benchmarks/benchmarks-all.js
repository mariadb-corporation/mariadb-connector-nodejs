'use strict';

import fs from 'node:fs/promises';
import runBenchSuite from './common-bench.js';

async function resolveBenchsPath() {
  for (const candidate of ['./benchs', './benchmarks/benchs']) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {}
  }
  throw new Error('Cannot locate benchmarks/benchs directory');
}

const path = await resolveBenchsPath();
const list = (await fs.readdir(path)).sort();
for (const elem of list) {
  const bench = await import(`./benchs/${elem}`);
  await runBenchSuite(bench);
}
