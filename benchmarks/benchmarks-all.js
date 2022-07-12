'use strict';

const fs = require('fs');
const createBenchSuite = require('./common-bench');

const launchBench = async function (path, list) {
  const elem = list.pop();
  const bench = require('./benchs/' + elem);
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
