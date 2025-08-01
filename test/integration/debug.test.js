//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

import fs from 'node:fs';
import os from 'node:os';

import path from 'node:path';
import util from 'node:util';
import winston from 'winston';
import { createConnection, isMaxscale } from '../base.js';
import Conf from '../conf.js';
import { assert, describe, test, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';

describe.sequential('debug', () => {
  const smallFileName = path.join(os.tmpdir(), 'smallLocalInfileDebug.txt');

  let permitLocalInfile = true;
  let logger;
  let setNameAddition = 0;
  let fileIncrement = 0;
  let shareConn;
  beforeAll(async () => {
    shareConn = await createConnection(Conf.baseConfig);
    try {
      fs.unlinkSync(path.join(os.tmpdir(), 'combined*.txt'));
    } catch (e) {}
    const rows = await shareConn.query('select @@local_infile');
    permitLocalInfile = rows[0]['@@local_infile'] === 1 || rows[0]['@@local_infile'] === 1n;
    fs.writeFileSync(smallFileName, '1,hello\n2,world\n', 'utf8');
    await new Promise(function (resolve, reject) {
      //ensure that debug from the previous test is written to the console
      setTimeout(resolve, 1000);
    });
    setNameAddition = 1221;
  });
  afterAll(async () => {
    fs.unlinkSync(smallFileName);
    await shareConn.query('DROP TABLE IF EXISTS debugVoid');
    await shareConn.end();
    shareConn = null;
  });

  beforeEach(async function () {
    let tmpLogFile = path.join(os.tmpdir(), 'combined' + ++fileIncrement + '.txt');
    logger = winston.createLogger({
      transports: [new winston.transports.File({ filename: tmpLogFile })]
    });
    await shareConn.query('DROP TABLE IF EXISTS debugVoid');
  });

  //ensure that debug from the previous test is written to console
  afterEach(async function () {
    let tmpLogFile = path.join(os.tmpdir(), 'combined' + fileIncrement + '.txt');
    await closeLogger(logger);
    try {
      fs.unlinkSync(tmpLogFile);
    } catch (e) {}
  });

  test('select request debug', async function () {
    await testQueryDebug(false);
  });

  test('select request debug compress', async function () {
    await testQueryDebug(true);
  });

  async function testQueryDebug(compress) {
    const conn = await createConnection({
      compress: compress,
      prepareCacheLength: 0,
      logger: {
        network: null,
        query: (msg) => logger.info(msg),
        error: (msg) => logger.info(msg)
      }
    });
    await conn.query('CREATE TABLE debugVoid (val int)');
    if (compress && !isMaxscale(shareConn)) {
      conn.debugCompress((msg) => logger.info(msg));
    } else {
      conn.debug((msg) => logger.info(msg));
    }
    await conn.query('SELECT 2');
    if (compress && !isMaxscale(shareConn)) {
      conn.debugCompress(false);
    } else {
      conn.debug(false);
    }
    await conn.query('SELECT 3');
    const prepare = await conn.prepare('SELECT ?');
    await prepare.execute(['t']).then((res) => prepare.close());
    await conn.batch('INSERT INTO debugVoid VALUES (?)', [[1], [2]]);
    await conn.end();

    //wait 100ms to ensure the stream has been written
    await new Promise((resolve) => new setTimeout(resolve, 100));
    const serverVersion = conn.serverVersion();
    if (isMaxscale(shareConn)) compress = false;
    const rangeWithEOF = compress ? [1500, 2000] : [1800, 4250];
    const rangeWithoutEOF = compress ? [1500, 2000] : [2350, 3250];
    const data = fs.readFileSync(path.join(os.tmpdir(), 'combined' + fileIncrement + '.txt'), 'utf8');
    console.log(data);
    assert.isTrue(data.includes('QUERY: SELECT 3'));
    assert.isTrue(data.includes('PREPARE:'));
    assert.isTrue(data.includes('EXECUTE:'));
    assert.isTrue(data.includes("SELECT ? - parameters:['t']"));
    assert.isTrue(data.includes('CLOSE PREPARE:'));
    if (conn.info.isMariaDB() && conn.info.hasMinVersion(10, 2, 2)) {
      assert.isTrue(data.includes('BULK:'));
      assert.isTrue(data.includes('INSERT INTO debugVoid VALUES (?) - parameters:[[1],[2]]'));
    }
    assert.isTrue(data.includes('QUIT'));
    if (
      ((conn.info.isMariaDB() && conn.info.hasMinVersion(10, 2, 2)) ||
        (!conn.info.isMariaDB() && conn.info.hasMinVersion(5, 7, 5))) &&
      !isMaxscale(shareConn)
    ) {
      assert(
        data.length > rangeWithoutEOF[0] && data.length < rangeWithoutEOF[1],
        'wrong data length : ' +
          data.length +
          ' expected value between ' +
          rangeWithoutEOF[0] +
          ' and ' +
          rangeWithoutEOF[1] +
          '.' +
          '\n server version : ' +
          serverVersion +
          '\n data :\n' +
          data
      );
    } else {
      //EOF Packet make exchange bigger
      assert(
        data.length > rangeWithEOF[0] && data.length < rangeWithEOF[1],
        'wrong data length : ' +
          data.length +
          ' expected value between ' +
          rangeWithEOF[0] +
          ' and ' +
          rangeWithEOF[1] +
          '.' +
          '\n server version : ' +
          serverVersion +
          '\n data :\n' +
          data
      );
    }
  }

  test('select big request (compressed data) debug', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();

    const buf = Buffer.alloc(5000, 'z');
    const conn = await createConnection({ compress: true, debugCompress: true, logger: (msg) => logger.info(msg) });
    await conn.query('SELECT ?', buf);
    await new Promise((resolve, reject) => {
      //wait 100ms to ensure the stream has been written
      setTimeout(async () => {
        await conn.end();
        const serverVersion = conn.serverVersion();
        const data = fs.readFileSync(path.join(os.tmpdir(), 'combined' + fileIncrement + '.txt'), 'utf8');
        let range = [8900, 12000 + setNameAddition];
        assert(
          data.length > range[0] && data.length < range[1],
          'wrong data length : ' +
            data.length +
            ' expected value between ' +
            range[0] +
            ' and ' +
            range[1] +
            '.' +
            '\n server version : ' +
            serverVersion +
            '\n data :\n' +
            data
        );
        resolve();
      }, 100);
    });
  });

  test('load local infile debug', async ({ skip }) => {
    if (!permitLocalInfile) return skip();
    await testLocalInfileDebug(false);
  });

  test('load local infile debug compress', async ({ skip }) => {
    if (!permitLocalInfile) return skip();
    await testLocalInfileDebug(true);
  });

  test('debug goes to log id not logger set', async function () {
    const initialStdOut = console.log;
    let data = '';
    console.log = function () {
      data += util.format.apply(null, arguments) + '\n';
    };

    try {
      const conn = await createConnection({ debug: true });
      const res = await conn.query("SELECT '1'");
      await conn.end();
      const range = [3600, 5800 + setNameAddition];
      assert(
        data.length > range[0] && data.length < range[1],
        'wrong data length : ' +
          data.length +
          ' expected value between ' +
          range[0] +
          ' and ' +
          range[1] +
          '.' +
          '\n data :\n' +
          data
      );
    } finally {
      console.log = initialStdOut;
    }
  });

  async function testLocalInfileDebug(compress) {
    const conn = await createConnection({
      permitLocalInfile: true,
      debug: true,
      compress: compress,
      logger: (msg) => logger.info(msg)
    });
    await conn.query('DROP TABLE IF EXISTS smallLocalInfile');
    await conn.query('CREATE TABLE smallLocalInfile(id int, test varchar(100))');
    await conn.query(
      "LOAD DATA LOCAL INFILE '" +
        smallFileName.replace(/\\/g, '/') +
        "' INTO TABLE smallLocalInfile FIELDS TERMINATED BY ',' (id, test)"
    );
    await conn.end();
    await new Promise((resolve, reject) => {
      //wait 100ms to ensure stream has been written
      setTimeout(() => {
        const data = fs.readFileSync(path.join(os.tmpdir(), 'combined' + fileIncrement + '.txt'), 'utf8');
        const serverVersion = conn.serverVersion();
        const range = [7500, 11000 + (Conf.baseConfig.ssl ? 800 : 0) + setNameAddition];
        assert(
          data.length > range[0] && data.length < range[1],
          'wrong data length : ' +
            data.length +
            ' expected value between ' +
            range[0] +
            ' and ' +
            range[1] +
            '.' +
            '\n server version : ' +
            serverVersion +
            '\n data :\n' +
            data
        );
        resolve();
      }, 500);
    });
  }

  test('fast path command debug', async function () {
    await testPingDebug(false);
  });

  test('fast path commanddebug compress', async function () {
    await testPingDebug(true);
  });

  async function testPingDebug(compress) {
    const conn = await createConnection({
      compress: compress,
      logger: {
        network: null,
        query: (msg) => logger.info(msg),
        error: (msg) => logger.info(msg)
      }
    });
    await conn.ping(1000);
    await conn.end();

    //wait 100ms to ensure stream has been written
    await new Promise(function (resolve) {
      setTimeout(resolve, 100);
    });
    const serverVersion = conn.serverVersion();
    if (isMaxscale(shareConn)) compress = false;
    const range = compress ? [60, 180] : [60, 170];
    const data = fs.readFileSync(path.join(os.tmpdir(), 'combined' + fileIncrement + '.txt'), 'utf8');
    assert.isTrue(data.includes('PING'));
    assert.isTrue(data.includes('QUIT'));

    assert(
      data.length > range[0] && data.length < range[1],
      'wrong data length : ' +
        data.length +
        ' expected value between ' +
        range[0] +
        ' and ' +
        range[1] +
        '.' +
        '\n server version : ' +
        serverVersion +
        '\n data :\n' +
        data
    );
  }
});

const closeLogger = async function (logger) {
  const promises = [];

  // close all transports -- transports dont use promises...
  // syslog close function emits 'closed' when done
  // daily-rotate-file close function emits 'finish' when done
  for (const transport of logger.transports) {
    if (transport.close) {
      const promise = new Promise((resolve) => {
        transport.once('closed', () => {
          resolve();
        });
        transport.once('finish', () => {
          resolve();
        });
      });
      promises.push(promise);
      // transport.close();  <-- invoked by logger.close()
    }
  }

  logger.close();
  return Promise.all(promises);
};
