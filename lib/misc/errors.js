//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2025 MariaDB Corporation Ab

'use strict';
import ErrorCodes from '../const/error-code.js';

export default class SqlError extends Error {
  constructor(msg, sql, fatal, info, sqlState, errno, additionalStack, addHeader = undefined, cause) {
    super(
      (addHeader !== false
        ? `(conn:${info && info.threadId ? info.threadId : -1}, no: ${errno ? errno : -1}, SQLState: ${sqlState}) `
        : '') +
        msg +
        (sql ? '\nsql: ' + sql : ''),
      cause
    );
    this.name = 'SqlError';
    this.sqlMessage = msg;
    this.sql = sql;
    this.fatal = fatal;
    this.errno = errno;
    this.sqlState = sqlState;
    if (errno > 45000 && errno < 46000) {
      //driver error
      this.code = getClientErrorKey(errno) || 'UNKNOWN';
    } else {
      this.code = ErrorCodes[this.errno] || 'UNKNOWN';
    }
    if (additionalStack) {
      //adding caller stack, removing initial "Error:\n"
      this.stack += '\n From event:\n' + additionalStack.substring(additionalStack.indexOf('\n') + 1);
    }
  }

  get text() {
    return this.sqlMessage;
  }
}

/**
 * Error factory, so error gets connection information.
 *
 * @param msg               current error message
 * @param errno             error number
 * @param info              connection information
 * @param sqlState          sql state
 * @param sql               sql command
 * @param fatal             is error fatal
 * @param additionalStack   additional stack trace to see
 * @param addHeader         add connection information
 * @param cause             add cause
 * @returns {Error} the error
 */
export function createError(
  msg,
  errno,
  info = null,
  sqlState = 'HY000',
  sql = null,
  fatal = false,
  additionalStack = undefined,
  addHeader = undefined,
  cause = undefined
) {
  if (cause) return new SqlError(msg, sql, fatal, info, sqlState, errno, additionalStack, addHeader, { cause: cause });
  return new SqlError(msg, sql, fatal, info, sqlState, errno, additionalStack, addHeader, cause);
}

/**
 * Fatal error factory, so error gets connection information.
 *
 * @param msg               current error message
 * @param errno             error number
 * @param info              connection information
 * @param sqlState          sql state
 * @param sql               sql command
 * @param additionalStack   additional stack trace to see
 * @param addHeader         add connection information
 * @returns {Error} the error
 */
export function createFatalError(
  msg,
  errno,
  info = null,
  sqlState = '08S01',
  sql = null,
  additionalStack = undefined,
  addHeader = undefined
) {
  return new SqlError(msg, sql, true, info, sqlState, errno, additionalStack, addHeader);
}

/********************************************************************************
 * Driver-specific errors
 ********************************************************************************/

export const client = {
  ER_CONNECTION_ALREADY_CLOSED: 45001,
  ER_MYSQL_CHANGE_USER_BUG: 45003,
  ER_CMD_NOT_EXECUTED_DESTROYED: 45004,
  ER_NULL_CHAR_ESCAPEID: 45005,
  ER_NULL_ESCAPEID: 45006,
  ER_NOT_IMPLEMENTED_FORMAT: 45007,
  ER_NODE_NOT_SUPPORTED_TLS: 45008,
  ER_SOCKET_UNEXPECTED_CLOSE: 45009,
  ER_UNEXPECTED_PACKET: 45011,
  ER_CONNECTION_TIMEOUT: 45012,
  ER_CMD_CONNECTION_CLOSED: 45013,
  ER_CHANGE_USER_BAD_PACKET: 45014,
  ER_PING_BAD_PACKET: 45015,
  ER_MISSING_PARAMETER: 45016,
  ER_PARAMETER_UNDEFINED: 45017,
  ER_PLACEHOLDER_UNDEFINED: 45018,
  ER_SOCKET: 45019,
  ER_EOF_EXPECTED: 45020,
  ER_LOCAL_INFILE_DISABLED: 45021,
  ER_LOCAL_INFILE_NOT_READABLE: 45022,
  ER_SERVER_SSL_DISABLED: 45023,
  ER_AUTHENTICATION_BAD_PACKET: 45024,
  ER_AUTHENTICATION_PLUGIN_NOT_SUPPORTED: 45025,
  ER_SOCKET_TIMEOUT: 45026,
  ER_POOL_ALREADY_CLOSED: 45027,
  ER_GET_CONNECTION_TIMEOUT: 45028,
  ER_SETTING_SESSION_ERROR: 45029,
  ER_INITIAL_SQL_ERROR: 45030,
  ER_BATCH_WITH_NO_VALUES: 45031,
  ER_RESET_BAD_PACKET: 45032,
  ER_WRONG_IANA_TIMEZONE: 45033,
  ER_LOCAL_INFILE_WRONG_FILENAME: 45034,
  ER_ADD_CONNECTION_CLOSED_POOL: 45035,
  ER_WRONG_AUTO_TIMEZONE: 45036,
  ER_CLOSING_POOL: 45037,
  ER_TIMEOUT_NOT_SUPPORTED: 45038,
  ER_INITIAL_TIMEOUT_ERROR: 45039,
  ER_DUPLICATE_FIELD: 45040,
  ER_PING_TIMEOUT: 45042,
  ER_BAD_PARAMETER_VALUE: 45043,
  ER_CANNOT_RETRIEVE_RSA_KEY: 45044,
  ER_MINIMUM_NODE_VERSION_REQUIRED: 45045,
  ER_MAX_ALLOWED_PACKET: 45046,
  ER_NOT_SUPPORTED_AUTH_PLUGIN: 45047,
  ER_COMPRESSION_NOT_SUPPORTED: 45048,
  ER_UNDEFINED_SQL: 45049,
  ER_PARSING_PRECISION: 45050,
  ER_PREPARE_CLOSED: 45051,
  ER_MISSING_SQL_PARAMETER: 45052,
  ER_MISSING_SQL_FILE: 45053,
  ER_SQL_FILE_ERROR: 45054,
  ER_MISSING_DATABASE_PARAMETER: 45055,
  ER_SELF_SIGNED: 45056,
  ER_SELF_SIGNED_NO_PWD: 45057,
  ER_PRIVATE_FIELDS_USE: 45058,
  ER_TLS_IDENTITY_ERROR: 45059,
  ER_POOL_NOT_INITIALIZED: 45060,
  ER_POOL_NO_CONNECTION: 45061,
  ER_SELF_SIGNED_BAD_PLUGIN: 45062,
  ER_SELF_SIGNED_SHA256: 45063
};

export function getClientErrorKey(errno) {
  for (const [key, value] of Object.entries(client)) {
    if (value === errno) return key;
  }
  return undefined;
}
