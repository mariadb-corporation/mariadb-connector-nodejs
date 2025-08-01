'use strict';

import fs from 'node:fs';
import createBenchSuite from './common-bench.js';

const launchBench = async function (path, list) {
  const elem = list.pop();
  const bench = await import('./benchs/' + elem);
  const suite = await createBenchSuite(bench);
  if (list.length > 0) {
    suite.on('complete', () => launchBench(path, list));
  }
  suite.run();
};

let path = './benchs';
fs.access(path, async function (err) {
  if (err) {
    path = './benchmarks/benchs';
    fs.access(path, async function (err) {
      fs.readdir(path, async function (err, list) {
        if (err) {
          console.log(err);
          return;
        }
        await launchBench(path, list.reverse());
      });
    });
  } else {
    fs.readdir(path, async function (err, list) {
      await launchBench(path, list.reverse());
    });
  }
});
