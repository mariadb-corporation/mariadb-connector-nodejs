//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2025 MariaDB Corporation Ab

/**
 * Field types
 * see https://mariadb.com/kb/en/library/resultset/#field-types
 */

export const DECIMAL = 0;
export const TINY = 1;
export const SHORT = 2;
export const INT = 3;
export const FLOAT = 4;
export const DOUBLE = 5;
export const NULL = 6;
export const TIMESTAMP = 7;
export const BIGINT = 8;
export const INT24 = 9;
export const DATE = 10;
export const TIME = 11;
export const DATETIME = 12;
export const YEAR = 13;
export const NEWDATE = 14;
export const VARCHAR = 15;
export const BIT = 16;
export const TIMESTAMP2 = 17;
export const DATETIME2 = 18;
export const TIME2 = 19;
export const JSON = 245; //only for MySQL
export const NEWDECIMAL = 246;
export const ENUM = 247;
export const SET = 248;
export const TINY_BLOB = 249;
export const MEDIUM_BLOB = 250;
export const LONG_BLOB = 251;
export const BLOB = 252;
export const VAR_STRING = 253;
export const STRING = 254;
export const GEOMETRY = 255;

const typeNames = [];
typeNames[0] = 'DECIMAL';
typeNames[1] = 'TINY';
typeNames[2] = 'SHORT';
typeNames[3] = 'INT';
typeNames[4] = 'FLOAT';
typeNames[5] = 'DOUBLE';
typeNames[6] = 'NULL';
typeNames[7] = 'TIMESTAMP';
typeNames[8] = 'BIGINT';
typeNames[9] = 'INT24';
typeNames[10] = 'DATE';
typeNames[11] = 'TIME';
typeNames[12] = 'DATETIME';
typeNames[13] = 'YEAR';
typeNames[14] = 'NEWDATE';
typeNames[15] = 'VARCHAR';
typeNames[16] = 'BIT';
typeNames[17] = 'TIMESTAMP2';
typeNames[18] = 'DATETIME2';
typeNames[19] = 'TIME2';
typeNames[245] = 'JSON';
typeNames[246] = 'NEWDECIMAL';
typeNames[247] = 'ENUM';
typeNames[248] = 'SET';
typeNames[249] = 'TINY_BLOB';
typeNames[250] = 'MEDIUM_BLOB';
typeNames[251] = 'LONG_BLOB';
typeNames[252] = 'BLOB';
typeNames[253] = 'VAR_STRING';
typeNames[254] = 'STRING';
typeNames[255] = 'GEOMETRY';

export const TYPES = typeNames;
