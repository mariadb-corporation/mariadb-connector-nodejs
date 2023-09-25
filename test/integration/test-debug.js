//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2023 MariaDB Corporation Ab

'use strict';

const base = require('../base.js');
const { assert } = require('chai');
const fs = require('fs');
const os = require('os');
const path = require('path');
const util = require('util');
const winston = require('winston');
const { isXpand } = require('../base');
const Conf = require('../conf');

describe('debug', () => {
  const smallFileName = path.join(os.tmpdir(), 'smallLocalInfileDebug.txt');

  let permitLocalInfile = true;
  let tmpLogFile = path.join(os.tmpdir(), 'combined.txt');
  let logger;

  before(function (done) {
    if (!isXpand()) {
      try {
        fs.unlinkSync(tmpLogFile);
      } catch (e) {}
      shareConn
        .query('select @@local_infile')
        .then((rows) => {
          permitLocalInfile = rows[0]['@@local_infile'] === 1 || rows[0]['@@local_infile'] === 1n;
          return new Promise(function (resolve, reject) {
            fs.writeFile(smallFileName, '1,hello\n2,world\n', 'utf8', function (err) {
              if (err) reject(err);
              else resolve();
            });
          });
        })
        .then(() => {
          //ensure that debug from previous test are written to console
          setTimeout(() => {
            done();
          }, 1000);
        })
        .catch(done);
    } else done();
  });

  beforeEach(async function () {
    logger = winston.createLogger({
      transports: [new winston.transports.File({ filename: tmpLogFile })]
    });
    await shareConn.query('DROP TABLE IF EXISTS debugVoid');
  });

  //ensure that debug from previous test are written to console
  afterEach(() => {
    logger.close();
    try {
      fs.unlinkSync(tmpLogFile);
    } catch (e) {}
  });

  after(async function () {
    if (!isXpand()) {
      fs.unlinkSync(smallFileName);
      await shareConn.query('DROP TABLE IF EXISTS debugVoid');
    }
  });

  it('select request debug', function (done) {
    testQueryDebug(false, done);
  });

  it('select request debug compress', function (done) {
    if (isXpand()) this.skip();
    testQueryDebug(true, done);
  });

  function testQueryDebug(compress, done) {
    base
      .createConnection({
        compress: compress,
        prepareCacheLength: 0,
        logger: {
          network: null,
          query: (msg) => logger.info(msg),
          error: (msg) => logger.info(msg)
        }
      })
      .then((conn) => {
        conn
          .query('CREATE TABLE debugVoid (val int)')
          .then(() => {
            if (
              compress &&
              process.env.srv !== 'maxscale' &&
              process.env.srv !== 'skysql' &&
              process.env.srv !== 'skysql-ha'
            ) {
              conn.debugCompress((msg) => logger.info(msg));
            } else {
              conn.debug((msg) => logger.info(msg));
            }
            return conn.query('SELECT 2');
          })
          .then(() => {
            if (
              compress &&
              process.env.srv !== 'maxscale' &&
              process.env.srv !== 'skysql' &&
              process.env.srv !== 'skysql-ha'
            ) {
              conn.debugCompress(false);
            } else {
              conn.debug(false);
            }
            return conn.query('SELECT 3');
          })
          .then(() => {
            return conn.prepare('SELECT ?');
          })
          .then((prepare) => {
            return prepare.execute(['t']).then((res) => prepare.close());
          })
          .then(() => {
            return conn.batch('INSERT INTO debugVoid VALUES (?)', [[1], [2]]);
          })
          .then(() => {
            return conn.end();
          })
          .then(() => {
            //wait 100ms to ensure stream has been written
            setTimeout(() => {
              const serverVersion = conn.serverVersion();
              if (process.env.srv === 'maxscale' || process.env.srv === 'skysql' || process.env.srv === 'skysql-ha')
                compress = false;
              const rangeWithEOF = compress ? [1500, 2000] : [1800, 4250];
              const rangeWithoutEOF = compress ? [1500, 2000] : [2350, 3250];
              const data = fs.readFileSync(tmpLogFile, 'utf8');
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
                process.env.srv !== 'maxscale' &&
                process.env.srv !== 'skysql' &&
                process.env.srv !== 'skysql-ha'
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
              done();
            }, 100);
          })
          .catch(done);
      })
      .catch(done);
  }

  it('select big request (compressed data) debug', function (done) {
    if (process.env.srv === 'maxscale' || process.env.srv === 'skysql' || process.env.srv === 'skysql-ha' || isXpand())
      this.skip();

    const buf = Buffer.alloc(5000, 'z');
    base
      .createConnection({ compress: true, debugCompress: true, logger: (msg) => logger.info(msg) })
      .then((conn) => {
        conn
          .query('SELECT ?', buf)
          .then((rows) => {
            //wait 100ms to ensure stream has been written
            setTimeout(() => {
              conn
                .end()
                .then(() => {
                  const serverVersion = conn.serverVersion();
                  const data = fs.readFileSync(tmpLogFile, 'utf8');
                  let range = [9500, 12000];
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
                  done();
                })
                .catch(done);
            }, 100);
          })
          .catch(done);
      })
      .catch(done);
  });

  it('load local infile debug', function (done) {
    if (!permitLocalInfile) this.skip();
    if (isXpand()) this.skip();
    testLocalInfileDebug(false, done);
  });

  it('load local infile debug compress', function (done) {
    if (!permitLocalInfile) this.skip();
    if (isXpand()) this.skip();
    testLocalInfileDebug(true, done);
  });

  it('debug goes to log id not logger set', async function () {
    const initialStdOut = console.log;
    let data = '';
    console.log = function () {
      data += util.format.apply(null, arguments) + '\n';
    };

    try {
      const conn = await base.createConnection({ debug: true });
      const res = await conn.query("SELECT '1'");
      conn.end();
      const range = [3700, 5800];
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

  function testLocalInfileDebug(compress, done) {
    base
      .createConnection({
        permitLocalInfile: true,
        debug: true,
        compress: compress,
        logger: (msg) => logger.info(msg)
      })
      .then((conn) => {
        conn
          .query('DROP TABLE IF EXISTS smallLocalInfile')
          .then(() => {
            return conn.query('CREATE TABLE smallLocalInfile(id int, test varchar(100))');
          })
          .then(() => {
            return conn.query(
              "LOAD DATA LOCAL INFILE '" +
                smallFileName.replace(/\\/g, '/') +
                "' INTO TABLE smallLocalInfile FIELDS TERMINATED BY ',' (id, test)"
            );
          })
          .then(() => {
            conn.end();
            //wait 100ms to ensure stream has been written
            setTimeout(() => {
              const data = fs.readFileSync(tmpLogFile, 'utf8');
              const serverVersion = conn.serverVersion();
              const range = [7500, 10000 + (Conf.baseConfig.ssl ? 800 : 0)];
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
              done();
            }, 500);
          })
          .catch(done);
      })
      .catch(done);
  }

  it('fast path command debug', async function () {
    if (isXpand()) this.skip();
    await testPingDebug(false);
  });

  it('fast path commanddebug compress', async function () {
    if (isXpand()) this.skip();
    await testPingDebug(true);
  });

  async function testPingDebug(compress) {
    const conn = await base.createConnection({
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
    if (process.env.srv === 'maxscale' || process.env.srv === 'skysql' || process.env.srv === 'skysql-ha')
      compress = false;
    const range = compress ? [90, 180] : [90, 170];
    const data = fs.readFileSync(tmpLogFile, 'utf8');
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
