/**
 * Capabilities list ( with 'CLIENT_' removed)
 * see : https://mariadb.com/kb/en/library/1-connecting-connecting/#capabilities
 */
/* mysql/old mariadb server/client */
module.exports.MYSQL = 1;
/* Found instead of affected rows */
module.exports.FOUND_ROWS = 2;
/* get all column flags */
module.exports.LONG_FLAG = 4;
/* one can specify db on connect */
module.exports.CONNECT_WITH_DB = 8;
/* don't allow database.table.column */
module.exports.NO_SCHEMA = 1 << 4;
/* can use compression protocol */
module.exports.COMPRESS = 1 << 5;
/* odbc client */
module.exports.ODBC = 1 << 6;
/* can use LOAD DATA LOCAL */
module.exports.LOCAL_FILES = 1 << 7;
/* ignore spaces before '' */
module.exports.IGNORE_SPACE = 1 << 8;
/* new 4.1 protocol */
module.exports.PROTOCOL_41 = 1 << 9;
/* this is an interactive client */
module.exports.INTERACTIVE = 1 << 10;
/* switch to ssl after handshake */
module.exports.SSL = 1 << 11;
/* IGNORE sigpipes */
module.exports.IGNORE_SIGPIPE = 1 << 12;
/* client knows about transactions */
module.exports.TRANSACTIONS = 1 << 13;
/* old flag for 4.1 protocol  */
module.exports.RESERVED = 1 << 14;
/* new 4.1 authentication */
module.exports.SECURE_CONNECTION = 1 << 15;
/* enable/disable multi-stmt support */
module.exports.MULTI_STATEMENTS = 1 << 16;
/* enable/disable multi-results */
module.exports.MULTI_RESULTS = 1 << 17;
/* multi-results in ps-protocol */
module.exports.PS_MULTI_RESULTS = 1 << 18;
/* client supports plugin authentication */
module.exports.PLUGIN_AUTH = 1 << 19;
/* permits connection attributes */
module.exports.CONNECT_ATTRS = 1 << 20;
/* Enable authentication response packet to be larger than 255 bytes. */
module.exports.PLUGIN_AUTH_LENENC_CLIENT_DATA = 1 << 21;
/* Don't close the connection for a connection with expired password. */
module.exports.CAN_HANDLE_EXPIRED_PASSWORDS = 1 << 22;
/* Capable of handling server state change information. Its a hint to the
  server to include the state change information in Ok packet. */
module.exports.SESSION_TRACK = 1 << 23;
/* Client no longer needs EOF packet */
module.exports.DEPRECATE_EOF = 1 << 24;
module.exports.SSL_VERIFY_SERVER_CERT = 1 << 30;
