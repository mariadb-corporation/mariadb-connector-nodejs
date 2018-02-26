"use strict";

let baseConfig = { user: "root", database: "testn", host: "localhost", port: 3306 };
if (process.env.TEST_HOST) baseConfig["host"] = process.env.TEST_HOST;
if (process.env.TEST_USER) baseConfig["user"] = process.env.TEST_USER;
if (process.env.TEST_PASSWORD) baseConfig["password"] = process.env.TEST_PASSWORD;
if (process.env.TEST_DB) baseConfig["database"] = process.env.TEST_DB;
if (process.env.TEST_PORT) baseConfig["port"] = process.env.TEST_PORT;
global.longTest = process.env.TEST_LONG ? process.env.TEST_PORT : false;

module.exports.baseConfig = baseConfig;
