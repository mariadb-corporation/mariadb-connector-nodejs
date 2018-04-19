"use strict";

let baseConfig = {
  user: "root",
  database: "testn",
  host: "localhost",
  port: 3306
};

if (process.env.TEST_HOST) baseConfig["host"] = process.env.TEST_HOST;
if (process.env.ZIP) baseConfig["compress"] = true;
if (process.env.TEST_USER) baseConfig["user"] = process.env.TEST_USER;
if (process.env.TEST_PASSWORD) baseConfig["password"] = process.env.TEST_PASSWORD;
if (process.env.TEST_DB) baseConfig["database"] = process.env.TEST_DB;
if (process.env.TEST_PORT) baseConfig["port"] = parseInt(process.env.TEST_PORT, 10);
if (process.env.TEST_SOCKET_PATH) baseConfig["socketPath"] = process.env.TEST_SOCKET_PATH;
if (process.env.TEST_DEBUG_LEN) baseConfig["debugLen"] = process.env.TEST_DEBUG_LEN;

module.exports.baseConfig = baseConfig;
