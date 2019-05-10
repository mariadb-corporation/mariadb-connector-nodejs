// Type definitions for mariadb 2.0
// Project: https://github.com/MariaDB/mariadb-connector-nodejs
// Definitions by:  Diego Dupin <https://github.com/rusher>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped
// TypeScript Version: 2.1

/// <reference types="node" />
/// <reference types="geojson" />

import tls = require('tls');
import stream = require('stream');
import { Geometry } from 'geojson';

export function createConnection(
  connectionUri: string | ConnectionConfig
): Promise<Connection>;
export function createPool(config: PoolConfig | string): Pool;
export function createPoolCluster(config?: PoolClusterConfig): PoolCluster;

export interface QueryConfig {
  /**
   * Presents result-sets by table to avoid results with colliding fields. See the query() description for more information.
   */
  nestTables?: boolean | string;

  /**
   * Allows to cast result types.
   */
  typeCast?: (
    field: FieldInfo,
    next: () => boolean | number | string | symbol | null | Geometry | Buffer
  ) => boolean | number | string | symbol | null | Geometry | Buffer;

  /**
   * Return result-sets as array, rather than a JSON object. This is a faster way to get results
   */
  rowsAsArray?: boolean;

  /**
   * Whether to retrieve dates as strings or as Date objects.
   */
  dateStrings?: boolean;

  /**
   * Forces use of the indicated timezone, rather than the current Node.js timezone.
   * Possible values are Z for UTC, local or ±HH:MM format
   */
  timezone?: string;

  /**
   * Allows the use of named placeholders.
   */
  namedPlaceholders?: boolean;

  /**
   * permit to indicate server global variable max_allowed_packet value to ensure efficient batching.
   * default is 4Mb. see batch documentation
   */
  maxAllowedPacket?: number;

  /**
   * When an integer is not in the safe range, the Connector interprets the value as a Long object.
   */
  supportBigNumbers?: boolean;

  /**
   * Compatibility option to permit setting multiple value by a JSON object to replace one question mark.
   * key values will replace the question mark with format like key1=val,key2='val2'.
   * Since it doesn't respect the usual prepared statement format that one value is for one question mark,
   * this can lead to incomprehension, even if badly use to possible injection.
   */
  permitSetMultiParamEntries?: boolean;

  /**
   * When an integer is not in the safe range, the Connector interprets the value as a string
   */
  bigNumberStrings?: boolean;

  /**
   * disabled bulk command in batch.
   */
  bulk?: boolean;

  /**
   * Sends queries one by one without waiting on the results of the previous entry.
   * (Default: true)
   */
  pipelining?: boolean;

  /**
   * Allows the use of LOAD DATA INFILE statements.
   * Loading data from a file from the client may be a security issue, as a man-in-the-middle proxy server can change
   * the actual file the server loads. Being able to execute a query on the client gives you access to files on
   * the client.
   * (Default: false)
   */
  permitLocalInfile?: boolean;

  /**
   * Database server port number
   */
  port?: number;
}

export interface QueryOptions extends QueryConfig {
  /**
   * SQL command to execute
   */
  sql: string;
}

export interface UserConnectionConfig {
  /**
   * Name of the database to use for this connection
   */
  database?: string;

  /**
   * When enabled, sends information during connection to server
   * - client name
   * - version
   * - operating system
   * - Node.js version
   *
   * If JSON is set, add JSON key/value to those values.
   *
   * When Performance Schema is enabled, server can display client information on each connection.
   */
  connectAttributes?: any;

  /**
   * The charset for the connection. This is called "collation" in the SQL-level of MySQL (like utf8_general_ci).
   * If a SQL-level charset is specified (like utf8mb4) then the default collation for that charset is used.
   * (Default: 'UTF8MB4_UNICODE_CI')
   */
  charset?: string;

  /**
   * The MySQL user to authenticate as
   */
  user?: string;

  /**
   * The password of that MySQL user
   */
  password?: string;
}

export interface ConnectionConfig extends UserConnectionConfig, QueryConfig {
  /**
   * The hostname of the database you are connecting to. (Default: localhost)
   */
  host?: string;

  /**
   * The port number to connect to. (Default: 3306)
   */
  port?: number;

  /**
   * The path to a unix domain socket to connect to. When used host and port are ignored
   */
  socketPath?: string;

  /**
   * The milliseconds before a timeout occurs during the initial connection to the MySQL server. (Default: 10 seconds)
   */
  connectTimeout?: number;

  /**
   * Socket timeout in milliseconds after the connection is established
   */
  socketTimeout?: number;

  /**
   * This will print all incoming and outgoing packets on stdout.
   * (Default: false)
   */
  debug?: boolean;

  /**
   * This will print all incoming and outgoing compressed packets on stdout.
   * (Default: false)
   */
  debugCompress?: boolean;

  /**
   * When debugging, maximum packet length to write to console.
   * (Default: 256)
   */
  debugLen?: number;

  /**
   * Adds the stack trace at the time of query creation to the error stack trace, making it easier to identify the
   * part of the code that issued the query.
   * Note: This feature is disabled by default due to the performance cost of stack creation.
   * Only turn it on when you need to debug issues.
   * (Default: false)
   */
  trace?: boolean;

  /**
   * Allow multiple mysql statements per query. Be careful with this, it exposes you to SQL injection attacks.
   * (Default: false)
   */
  multipleStatements?: boolean;

  /**
   * object with ssl parameters or a string containing name of ssl profile
   */
  ssl?: string | (tls.SecureContextOptions & { rejectUnauthorized?: boolean });

  /**
   * Compress exchanges with database using gzip.
   * This can give you better performance when accessing a database in a different location.
   * (Default: false)
   */
  compress?: boolean;

  /**
   * Debug option : permit to save last exchanged packet.
   * Error messages will display those last exchanged packet.
   *
   * (Default: false)
   */
  logPackets?: boolean;

  /**
   * When enabled, the update number corresponds to update rows.
   * When disabled, it indicates the real rows changed.
   */
  foundRows?: boolean;

  /**
   * When a connection is established, permit to execute commands before using connection
   */
  initSql?: string | string[];

  /**
   * Permit to set session variables when connecting.
   * Example: sessionVariables:{'idle_transaction_timeout':10000}
   */
  sessionVariables?: any;
}

export interface PoolConfig extends ConnectionConfig {
  /**
   * The milliseconds before a timeout occurs during the connection acquisition. This is slightly different from connectTimeout,
   * because acquiring a pool connection does not always involve making a connection. (Default: 10 seconds)
   */
  acquireTimeout?: number;

  /**
   * The maximum number of connections to create at once. (Default: 10)
   */
  connectionLimit?: number;

  /**
   * Indicate idle time after which a pool connection is released.
   * Value must be lower than [@@wait_timeout](https://mariadb.com/kb/en/library/server-system-variables/#wait_timeout).
   * In seconds (0 means never release)
   * Default: 1800 ( = 30 minutes)
   */
  idleTimeout?: number;

  /**
   * Timeout after which pool give up creating new connection.
   */
  initializationTimeout?: number;

  /**
   * When asking a connection to pool, the pool will validate the connection state.
   * "minDelayValidation" permits disabling this validation if the connection has been borrowed recently avoiding
   * useless verifications in case of frequent reuse of connections.
   * 0 means validation is done each time the connection is asked. (in ms)
   * Default: 500 (in millisecond)
   */
  minDelayValidation?: number;

  /**
   * Permit to set a minimum number of connection in pool.
   * **Recommendation is to use fixed pool, so not setting this value**
   */
  minimumIdle?: number;

  /**
   * Use COM_STMT_RESET when releasing a connection to pool.
   * Default: true
   */
  resetAfterUse?: boolean;

  /**
   * No rollback or reset when releasing a connection to pool.
   * Default: false
   */
  noControlAfterUse?: boolean;
}

export interface PoolClusterConfig {
  /**
   * If true, PoolCluster will attempt to reconnect when connection fails. (Default: true)
   */
  canRetry?: boolean;

  /**
   * If connection fails, node's errorCount increases. When errorCount is greater than removeNodeErrorCount,
   * remove a node in the PoolCluster. (Default: 5)
   */
  removeNodeErrorCount?: number;

  /**
   * If connection fails, specifies the number of milliseconds before another connection attempt will be made.
   * If set to 0, then node will be removed instead and never re-used. (Default: 0)
   */
  restoreNodeTimeout?: number;

  /**
   * The default selector. (Default: RR)
   * RR: Select one alternately. (Round-Robin)
   * RANDOM: Select the node by random function.
   * ORDER: Select the first node available unconditionally.
   */
  defaultSelector?: string;
}

export interface ServerVersion {
  /**
   * Raw string that database server send to connector.
   * example : "10.4.3-MariaDB-1:10.4.3+maria~bionic-log"
   */
  readonly raw: string;

  /**
   * indicate if server is a MariaDB or a MySQL server
   */
  readonly mariaDb: boolean;

  /**
   * Server major version.
   * Example for raw version "10.4.3-MariaDB" is 10
   */
  readonly major: number;

  /**
   * Server major version.
   * Example for raw version "10.4.3-MariaDB" is 4
   */
  readonly minor: number;

  /**
   * Server major version.
   * Example for raw version "10.4.3-MariaDB" is 3
   */
  readonly patch: number;
}

export interface ConnectionInfo {
  /**
   * Server connection identifier value
   */
  readonly threadId: number | null;

  /**
   * connection status flag
   * see https://mariadb.com/kb/en/library/ok_packet/#server-status-flag
   */
  readonly status: number;

  /**
   * Server version information
   */
  serverVersion: ServerVersion;

  /**
   * Server capabilities
   * see https://mariadb.com/kb/en/library/connection/#capabilities
   */
  readonly serverCapabilities: number;
}

export interface Connection {
  /**
   * Connection information
   */
  info: ConnectionInfo | null;

  /**
   * Alias of info.threadId for compatibility
   */
  readonly threadId: number | null;

  /**
   * Permit to change user during connection.
   * All user variables will be reset, Prepare commands will be released.
   * !!! mysql has a bug when CONNECT_ATTRS capability is set, that is default !!!!
   */
  changeUser(options?: UserConnectionConfig): Promise<void>;

  /**
   * Start transaction
   */
  beginTransaction(): Promise<void>;

  /**
   * Commit a transaction.
   */
  commit(): Promise<void>;

  /**
   * Roll back a transaction.
   */
  rollback(): Promise<void>;

  /**
   * Execute query using text protocol.
   */
  query(sql: string | QueryOptions, values?: any): Promise<any>;

  /**
   * Execute batch using text protocol.
   */
  batch(sql: string | QueryOptions, values?: any): Promise<UpsertResult[]>;

  /**
   * Execute query returning a Readable Object that will emit columns/data/end/error events
   * to permit streaming big result-set
   */
  queryStream(sql: string | QueryOptions, values?: any): stream.Readable;

  /**
   * Send an empty MySQL packet to ensure connection is active, and reset @@wait_timeout
   */
  ping(): Promise<void>;

  /**
   * Send a reset command that will
   * - rollback any open transaction
   * - reset transaction isolation level
   * - reset session variables
   * - delete user variables
   * - remove temporary tables
   * - remove all PREPARE statement
   */
  reset(): Promise<void>;

  /**
   * Indicates the state of the connection as the driver knows it
   */
  isValid(): boolean;

  /**
   * Terminate connection gracefully.
   */
  end(): Promise<void>;

  /**
   * Force connection termination by closing the underlying socket and killing server process if any.
   */
  destroy(): void;

  pause(): void;
  resume(): void;

  /**
   * Alias for info.serverVersion.raw
   */
  serverVersion(): string;

  /**
   * Change option "debug" during connection.
   */
  debug(value: boolean): void;

  /**
   * Change option "debugCompress" during connection.
   */
  debugCompress(value: boolean): void;

  on(ev: 'end', callback: () => void): Connection;
  on(ev: 'error', callback: (err: MariaDbError) => void): Connection;
}

export interface PoolConnection extends Connection {
  /**
   * Release the connection to pool internal cache.
   */
  release(): void;
}

export interface Pool {
  /**
   * Retrieve a connection from pool.
   * Create a new one, if limit is not reached.
   * wait until acquireTimeout.
   */
  getConnection(): Promise<PoolConnection>;

  /**
   * Execute a query on one connection from pool.
   */
  query(sql: string | QueryOptions, values?: any): Promise<any>;

  /**
   * Execute a batch on one connection from pool.
   */
  batch(sql: string | QueryOptions, values?: any): Promise<UpsertResult[]>;

  /**
   * Close all connection in pool
   */
  end(): Promise<void>;

  /**
   * Get current active connections.
   */
  activeConnections(): number;

  /**
   * Get current total connection number.
   */
  totalConnections(): number;

  /**
   * Get current idle connection number.
   */
  idleConnections(): number;

  /**
   * Get current stacked connection request.
   */
  taskQueueSize(): number;
}

export interface FilteredPoolCluster {
  getConnection(): Promise<PoolConnection>;
  query(sql: string | QueryOptions, values?: any): Promise<any>;
  batch(sql: string | QueryOptions, values?: any): Promise<UpsertResult[]>;
}

export interface PoolCluster {
  add(config: PoolConfig): void;
  add(id: string, config: PoolConfig): void;
  end(): Promise<void>;
  of(pattern: string, selector?: string): FilteredPoolCluster;
  of(pattern: undefined | null | false, selector: string): FilteredPoolCluster;
  remove(pattern: string): void;
  getConnection(pattern?: string, selector?: string): Promise<PoolConnection>;
}

export interface UpsertResult {
  affectedRows: number;
  insertId: number;
  warningStatus: number;
}

export interface MariaDbError extends Error {
  /**
   * Either a MySQL server error (e.g. 'ER_ACCESS_DENIED_ERROR'),
   * a node.js error (e.g. 'ECONNREFUSED') or an internal error
   * (e.g. 'PROTOCOL_CONNECTION_LOST').
   */
  code: string | null;

  /**
   * The error number for the error code
   */
  errno: number;

  /**
   * The sql state
   */
  sqlState?: string | null;

  /**
   * Boolean, indicating if this error is terminal to the connection object.
   */
  fatal: boolean;
}

export const enum Types {
  DECIMAL = 0x00, // aka DECIMAL (http://dev.mysql.com/doc/refman/5.0/en/precision-math-decimal-changes.html)
  TINY = 0x01, // aka TINYINT, 1 byte
  SHORT = 0x02, // aka SMALLINT, 2 bytes
  LONG = 0x03, // aka INT, 4 bytes
  FLOAT = 0x04, // aka FLOAT, 4-8 bytes
  DOUBLE = 0x05, // aka DOUBLE, 8 bytes
  NULL = 0x06, // NULL (used for prepared statements, I think)
  TIMESTAMP = 0x07, // aka TIMESTAMP
  LONGLONG = 0x08, // aka BIGINT, 8 bytes
  INT24 = 0x09, // aka MEDIUMINT, 3 bytes
  DATE = 0x0a, // aka DATE
  TIME = 0x0b, // aka TIME
  DATETIME = 0x0c, // aka DATETIME
  YEAR = 0x0d, // aka YEAR, 1 byte (don't ask)
  NEWDATE = 0x0e, // aka ?
  VARCHAR = 0x0f, // aka VARCHAR (?)
  BIT = 0x10, // aka BIT, 1-8 byte
  TIMESTAMP2 = 0x11, // aka TIMESTAMP with fractional seconds
  DATETIME2 = 0x12, // aka DATETIME with fractional seconds
  TIME2 = 0x13, // aka TIME with fractional seconds
  JSON = 0xf5, // aka JSON
  NEWDECIMAL = 0xf6, // aka DECIMAL
  ENUM = 0xf7, // aka ENUM
  SET = 0xf8, // aka SET
  TINY_BLOB = 0xf9, // aka TINYBLOB, TINYTEXT
  MEDIUM_BLOB = 0xfa, // aka MEDIUMBLOB, MEDIUMTEXT
  LONG_BLOB = 0xfb, // aka LONGBLOG, LONGTEXT
  BLOB = 0xfc, // aka BLOB, TEXT
  VAR_STRING = 0xfd, // aka VARCHAR, VARBINARY
  STRING = 0xfe, // aka CHAR, BINARY
  GEOMETRY = 0xff // aka GEOMETRY
}

export interface Collation {
  index: number;
  name: string;
  encoding: string;
  fromEncoding(encoding: string): Collation;
  fromIndex(index: number): Collation;
  fromName(name: string): Collation;
}

export interface FieldInfo {
  columnLength: number;
  db: string;
  table: string;
  orgTable: string;
  name: string;
  orgName: string;
  type: Types;
  flags: number;
  scale: number;
  collation: Collation;

  string(): string | null;
  float(): number | null;
  int(): number | null;
  long(): number | null;
  decimal(): number | null;
  date(): Date | null;
  geometry(): Geometry | null;
}
