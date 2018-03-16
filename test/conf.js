"use strict";

let baseConfig = { user: "root", database: "testn", host: "localhost", port: 3306 };
if (process.env.TEST_HOST) baseConfig["host"] = process.env.TEST_HOST;
if (process.env.TEST_USER) baseConfig["user"] = process.env.TEST_USER;
if (process.env.TEST_PASSWORD) baseConfig["password"] = process.env.TEST_PASSWORD;
if (process.env.TEST_DB) baseConfig["database"] = process.env.TEST_DB;
if (process.env.TEST_PORT) baseConfig["port"] = parseInt(process.env.TEST_PORT, 10);
global.longTest = process.env.TEST_LONG ? process.env.TEST_LONG : false;

module.exports.baseConfig = baseConfig;
