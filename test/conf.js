//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2025 MariaDB Corporation Ab

'use strict';

import { getEnv } from './base.js';

export const baseConfig = {
  user: 'root',
  database: 'testn',
  host: 'localhost',
  connectTimeout: 2000,
  port: 3306,
  password: null
};

if (getEnv('TEST_DB_HOST')) baseConfig['host'] = getEnv('TEST_DB_HOST');
if (getEnv('TEST_DB_USER')) baseConfig['user'] = getEnv('TEST_DB_USER');
if (getEnv('TEST_DB_PASSWORD')) baseConfig['password'] = getEnv('TEST_DB_PASSWORD');
if (getEnv('TEST_DB_DATABASE')) baseConfig['database'] = getEnv('TEST_DB_DATABASE');
if (getEnv('TEST_DB_PORT')) baseConfig['port'] = parseInt(getEnv('TEST_DB_PORT'), 10);
if (getEnv('TEST_REQUIRE_TLS') === '1')
  baseConfig['ssl'] = { ca: getEnv('TEST_DB_SERVER_CERT'), rejectUnauthorized: false };
if (getEnv('TEST_ZIP')) baseConfig['compress'] = true;
if (getEnv('TEST_SOCKET_PATH')) baseConfig['socketPath'] = getEnv('TEST_SOCKET_PATH');
if (getEnv('TEST_DEBUG_LEN')) baseConfig['debugLen'] = getEnv('TEST_DEBUG_LEN');
if (getEnv('TEST_COLLATION')) baseConfig['collation'] = getEnv('TEST_COLLATION');
if (getEnv('TEST_LOG_PACKETS')) baseConfig['logPackets'] = true;
if (getEnv('TEST_BULK')) baseConfig['bulk'] = getEnv('TEST_BULK');
if (getEnv('DB_TYPE') === 'mysql') baseConfig['allowPublicKeyRetrieval'] = true;
if (getEnv('TEST_TRACE') === 'true') baseConfig['trace'] = true;
export default { baseConfig };
