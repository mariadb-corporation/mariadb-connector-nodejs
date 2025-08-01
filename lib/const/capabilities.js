//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2025 MariaDB Corporation Ab

/**
 * Capabilities list (with 'CLIENT_' removed)
 * see: https://mariadb.com/kb/en/library/1-connecting-connecting/#capabilities
 */
/* mysql/old mariadb server/client */
export const MYSQL = 1n;
/* Found instead of affected rows */
export const FOUND_ROWS = 2n;
/* get all column flags */
export const LONG_FLAG = 4n;
/* one can specify db on connecting */
export const CONNECT_WITH_DB = 8n;
/* don't allow database.table.column */
export const NO_SCHEMA = 1n << 4n;
/* can use compression protocol */
export const COMPRESS = 1n << 5n;
/* odbc client */
export const ODBC = 1n << 6n;
/* can use LOAD DATA LOCAL */
export const LOCAL_FILES = 1n << 7n;
/* ignore spaces before '' */
export const IGNORE_SPACE = 1n << 8n;
/* new 4.1 protocol */
export const PROTOCOL_41 = 1n << 9n;
/* this is an interactive client */
export const INTERACTIVE = 1n << 10n;
/* switch to ssl after the handshake */
export const SSL = 1n << 11n;
/* IGNORE sigpipes */
export const IGNORE_SIGPIPE = 1n << 12n;
/* client knows about transactions */
export const TRANSACTIONS = 1n << 13n;
/* old flag for 4.1 protocol  */
export const RESERVED = 1n << 14n;
/* new 4.1 authentication */
export const SECURE_CONNECTION = 1n << 15n;
/* enable/disable multi-stmt support */
export const MULTI_STATEMENTS = 1n << 16n;
/* enable/disable multi-results */
export const MULTI_RESULTS = 1n << 17n;
/* multi-results in ps-protocol */
export const PS_MULTI_RESULTS = 1n << 18n;
/* client supports plugin authentication */
export const PLUGIN_AUTH = 1n << 19n;
/* permits connection attributes */
export const CONNECT_ATTRS = 1n << 20n;
/* Enable an authentication response packet to be larger than 255 bytes. */
export const PLUGIN_AUTH_LENENC_CLIENT_DATA = 1n << 21n;
/* Don't close the connection for a connection with an expired password. */
export const CAN_HANDLE_EXPIRED_PASSWORDS = 1n << 22n;
/* Capable of handling server state change information. It's a hint to the
  server to include the state change information in Ok packet. */
export const SESSION_TRACK = 1n << 23n;
/* Client no longer needs EOF packet */
export const DEPRECATE_EOF = 1n << 24n;
export const SSL_VERIFY_SERVER_CERT = 1n << 30n;

/* MariaDB extended capabilities */

/* Permit bulk insert*/
export const MARIADB_CLIENT_STMT_BULK_OPERATIONS = 1n << 34n;
/* Clients supporting extended metadata */
export const MARIADB_CLIENT_EXTENDED_METADATA = 1n << 35n;
/* permit metadata caching */
export const MARIADB_CLIENT_CACHE_METADATA = 1n << 36n;
/* permit returning all bulk individual results */
export const BULK_UNIT_RESULTS = 1n << 37n;
