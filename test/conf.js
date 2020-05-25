'use strict';

let baseConfig = {
  user: 'root',
  database: 'testn',
  host: 'localhost',
  connectTimeout: 1000,
  port: 3306
};

if (process.env.TEST_HOST) baseConfig['host'] = process.env.TEST_HOST;
if (process.env.TEST_ZIP) baseConfig['compress'] = true;
if (process.env.TEST_USER) baseConfig['user'] = process.env.TEST_USER;
if (process.env.TEST_PASSWORD) baseConfig['password'] = process.env.TEST_PASSWORD;
if (process.env.TEST_DB) baseConfig['database'] = process.env.TEST_DB;
if (process.env.TEST_PORT) baseConfig['port'] = parseInt(process.env.TEST_PORT, 10);
if (process.env.TEST_SOCKET_PATH) baseConfig['socketPath'] = process.env.TEST_SOCKET_PATH;
if (process.env.TEST_DEBUG_LEN) baseConfig['debugLen'] = process.env.TEST_DEBUG_LEN;
if (process.env.TEST_COLLATION) baseConfig['collation'] = process.env.TEST_COLLATION;
if (process.env.TEST_LOG_PACKETS) baseConfig['logPackets'] = true;
if (process.env.TEST_SSL_CA) baseConfig['ssl'] = { ca: process.env.TEST_SSL_CA };
if (process.env.TEST_BULK) baseConfig['bulk'] = process.env.TEST_BULK;

module.exports.baseConfig = baseConfig;
