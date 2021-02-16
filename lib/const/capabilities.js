/**
 * Capabilities list ( with 'CLIENT_' removed)
 * see : https://mariadb.com/kb/en/library/1-connecting-connecting/#capabilities
 */
/* mysql/old mariadb server/client */
module.exports.MYSQL = BigInt(1);
/* Found instead of affected rows */
module.exports.FOUND_ROWS = BigInt(2);
/* get all column flags */
module.exports.LONG_FLAG = BigInt(4);
/* one can specify db on connect */
module.exports.CONNECT_WITH_DB = BigInt(8);
/* don't allow database.table.column */
module.exports.NO_SCHEMA = BigInt(1) << BigInt(4);
/* can use compression protocol */
module.exports.COMPRESS = BigInt(1) << BigInt(5);
/* odbc client */
module.exports.ODBC = BigInt(1) << BigInt(6);
/* can use LOAD DATA LOCAL */
module.exports.LOCAL_FILES = BigInt(1) << BigInt(7);
/* ignore spaces before '' */
module.exports.IGNORE_SPACE = BigInt(1) << BigInt(8);
/* new 4.1 protocol */
module.exports.PROTOCOL_41 = BigInt(1) << BigInt(9);
/* this is an interactive client */
module.exports.INTERACTIVE = BigInt(1) << BigInt(10);
/* switch to ssl after handshake */
module.exports.SSL = BigInt(1) << BigInt(11);
/* IGNORE sigpipes */
module.exports.IGNORE_SIGPIPE = BigInt(1) << BigInt(12);
/* client knows about transactions */
module.exports.TRANSACTIONS = BigInt(1) << BigInt(13);
/* old flag for 4.1 protocol  */
module.exports.RESERVED = BigInt(1) << BigInt(14);
/* new 4.1 authentication */
module.exports.SECURE_CONNECTION = BigInt(1) << BigInt(15);
/* enable/disable multi-stmt support */
module.exports.MULTI_STATEMENTS = BigInt(1) << BigInt(16);
/* enable/disable multi-results */
module.exports.MULTI_RESULTS = BigInt(1) << BigInt(17);
/* multi-results in ps-protocol */
module.exports.PS_MULTI_RESULTS = BigInt(1) << BigInt(18);
/* client supports plugin authentication */
module.exports.PLUGIN_AUTH = BigInt(1) << BigInt(19);
/* permits connection attributes */
module.exports.CONNECT_ATTRS = BigInt(1) << BigInt(20);
/* Enable authentication response packet to be larger than 255 bytes. */
module.exports.PLUGIN_AUTH_LENENC_CLIENT_DATA = BigInt(1) << BigInt(21);
/* Don't close the connection for a connection with expired password. */
module.exports.CAN_HANDLE_EXPIRED_PASSWORDS = BigInt(1) << BigInt(22);
/* Capable of handling server state change information. Its a hint to the
  server to include the state change information in Ok packet. */
module.exports.SESSION_TRACK = BigInt(1) << BigInt(23);
/* Client no longer needs EOF packet */
module.exports.DEPRECATE_EOF = BigInt(1) << BigInt(24);
module.exports.SSL_VERIFY_SERVER_CERT = BigInt(1) << BigInt(30);

/* MariaDB extended capabilities */

/* Permit bulk insert*/
module.exports.MARIADB_CLIENT_STMT_BULK_OPERATIONS = BigInt(1) << BigInt(34);

/* Clients supporting extended metadata */
module.exports.MARIADB_CLIENT_EXTENDED_TYPE_INFO = BigInt(1) << BigInt(35);
