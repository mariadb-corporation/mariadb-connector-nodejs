import { Geometry } from 'geojson';
import { Buffer } from 'node:buffer';
import { Duplex, Readable } from 'node:stream';
import { SecureContextOptions } from 'node:tls';

export type TypeCastResult = boolean | number | string | symbol | null | Date | Geometry | Buffer;
export type TypeCastNextFunction = () => TypeCastResult;
export type TypeCastFunction = (field: FieldInfo, next: TypeCastNextFunction) => TypeCastResult;
export function StreamCallback(err?: Error, stream?: Duplex): void;

export interface LoggerConfig {
  network?: (msg: string) => void;
  query?: (msg: string) => void;
  error?: (err: Error) => void;
  warning?: (msg: string) => void;
}

export function defaultOptions(connectionUri?: string | ConnectionConfig): any;

export interface FieldInfo {
  collation: Collation;
  columnLength: number;
  columnType: TypeNumbers;
  scale: number;
  type: Types;
  flags: Flags;
  db(): string;
  schema(): string; // Alias for db()
  table(): string;
  orgTable(): string;
  name(): string;
  orgName(): string;

  // Note that you may only call *one* of these functions
  // when decoding a column via the typeCast callback.
  // Calling additional functions will give you incorrect results.
  string(): string | null;
  buffer(): Buffer | null;
  float(): number | null;
  int(): number | null;
  long(): number | null;
  decimal(): number | null;
  date(): Date | null;
  geometry(): Geometry | null;
}

export interface ImportFileConfig extends ConnectionConfig {
  /**
   * SQL file path to import
   */
  file: string;
}

export interface PoolConfig extends ConnectionConfig {
  /**
   * The milliseconds before a timeout occurs during the connection acquisition. This is slightly different from
   * connectTimeout, because acquiring a pool connection does not always involve making a connection.
   * (Default: 10 seconds)
   */
  acquireTimeout?: number;

  /**
   * The maximum number of connections to create at once. (Default: 10)
   */
  connectionLimit?: number;

  /**
   * Indicate idle time after which a pool connection is released.
   * The Value must be lower than
   * [@@wait_timeout](https://mariadb.com/kb/en/library/server-system-variables/#wait_timeout).
   * In seconds (0 means never release)
   * Default: 1800 (= 30 minutes)
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
   * Permit setting a minimum amount of connection in pool.
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

  /**
   * Permit indicating a timeout to log connection borrowed from pool.
   * When a connection is borrowed from the pool and this timeout is reached,
   * a message will be logged to the console indicating a possible connection leak.
   * Another message will tell if the possible logged leak has been released.
   * A value of 0 (default) meaning Leak detection is disabled
   */
  leakDetectionTimeout?: number;
}

export interface PoolClusterConfig {
  /**
   * If true, PoolCluster will attempt to reconnect when the connection fails. (Default: true)
   */
  canRetry?: boolean;

  /**
   * If connection fails, node's errorCount increases. When errorCount is greater than removeNodeErrorCount,
   * remove a node in the PoolCluster. (Default: 5)
   */
  removeNodeErrorCount?: number;

  /**
   * If connection fails, specifies the number of milliseconds before another connection attempt will be made.
   * If set to 0, then the node will be removed instead and never re-used. (Default: 0)
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
export interface SqlImportOptions {
  /**
   * file path of sql file
   */
  file: string;

  /**
   * Name of the database to use to import sql file.
   * If not set, current database is used.
   */
  database?: string;
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
   * connection collation
   */
  collation: null;

  /**
   * Server capabilities
   * see https://mariadb.com/kb/en/library/connection/#capabilities
   */
  readonly serverCapabilities: number;

  /**
   * Indicate when connected if server is a MariaDB or MySQL one
   */
  isMariaDB(): boolean;

  /**
   * return true if server version > to indicate version
   * @param major server major version
   * @param minor server minor version
   * @param patch server patch version
   */
  hasMinVersion(major: number, minor: number, patch: number): boolean;
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
   * When Performance Schema is enabled, the server can display client information on each connection.
   */
  connectAttributes?: any;

  /**
   * Protocol character set used with the server.
   * Connection collation will be the default collation associated with charset.
   * It's mainly used for micro-optimizations. The default is often enough.
   * for example, 'UTF8MB4', 'CP1250'.
   * (default 'UTF8MB4')
   */
  charset?: string;

  /**
   * Permit defined collation used for connection.
   * This will define the charset encoding used for exchanges with database and defines the order used when
   * comparing strings. It's mainly used for micro-optimizations
   * (Default: 'UTF8MB4_UNICODE_CI')
   */
  collation?: string;

  /**
   * The MySQL user to authenticate as
   */
  user?: string;

  /**
   * The password of that MySQL user
   */
  password?: string;
}

export interface UpsertResult {
  affectedRows: number;
  insertId: number | bigint;
  warningStatus: number;
}

export interface SqlError extends Error {
  /**
   * Either a MySQL server error (e.g. 'ER_ACCESS_DENIED_ERROR'),
   * a node.js error (e.g. 'ECONNREFUSED') or an internal error
   * (e.g. 'PROTOCOL_CONNECTION_LOST').
   */
  code: string | null;

  /**
   * original error message value
   * @deprecated since 3.2.0 prefer using sqlMessage for compatibility with other drivers.
   */
  text: string | null;

  /**
   * original error message value
   */
  sqlMessage: string | null;

  /**
   * The SQL command associate
   */
  sql: string | null;

  /**
   * The error number for the error code
   */
  errno: number;

  /**
   * The SQL state
   */
  sqlState?: string | null;

  /**
   * Boolean, indicating if this error is terminal to the connection object.
   */
  fatal: boolean;
}

interface SqlErrorConstructor extends ErrorConstructor {
  new (
    msg: string,
    sql?: string,
    fatal?: boolean,
    info?: { threadId?: number },
    sqlState?: string | null,
    errno?: number,
    additionalStack?: string,
    addHeader?: boolean,
    cause?: unknown
  ): SqlError;
  readonly prototype: SqlError;
}

declare const SqlError: SqlErrorConstructor;

export enum TypeNumbers {
  DECIMAL = 0,
  TINY = 1,
  SHORT = 2,
  LONG = 3,
  FLOAT = 4,
  DOUBLE = 5,
  NULL = 6,
  TIMESTAMP = 7,
  BIGINT = 8,
  INT24 = 9,
  DATE = 10,
  TIME = 11,
  DATETIME = 12,
  YEAR = 13,
  NEWDATE = 14,
  VARCHAR = 15,
  BIT = 16,
  TIMESTAMP2 = 17,
  DATETIME2 = 18,
  TIME2 = 19,
  JSON = 245, //only for MySQ,
  NEWDECIMAL = 246,
  ENUM = 247,
  SET = 248,
  TINY_BLOB = 249,
  MEDIUM_BLOB = 250,
  LONG_BLOB = 251,
  BLOB = 252,
  VAR_STRING = 253,
  STRING = 254,
  GEOMETRY = 255
}

export const enum Flags {
  //field cannot be null
  NOT_NULL = 1,
  //field is a primary key
  PRIMARY_KEY = 2,
  // the field is unique
  UNIQUE_KEY = 4,
  //field is in a multiple key
  MULTIPLE_KEY = 8,
  //is this field a Blob?
  BLOB = 1 << 4,
  //	is this field unsigned?
  UNSIGNED = 1 << 5,
  //is this field a zerofill?
  ZEROFILL_FLAG = 1 << 6,
  //whether this field has a binary collation
  BINARY_COLLATION = 1 << 7,
  //Field is an enumeration
  ENUM = 1 << 8,
  //field auto-increment
  AUTO_INCREMENT = 1 << 9,
  //field is a timestamp value
  TIMESTAMP = 1 << 10,
  //field is a SET
  SET = 1 << 11,
  //field doesn't have default value
  NO_DEFAULT_VALUE_FLAG = 1 << 12,
  //field is set to NOW on UPDATE
  ON_UPDATE_NOW_FLAG = 1 << 13,
  //field is num
  NUM_FLAG = 1 << 14
}

export enum Types {
  DECIMAL = 'DECIMAL',
  TINY = 'TINY',
  SHORT = 'SHORT',
  LONG = 'LONG',
  FLOAT = 'FLOAT',
  DOUBLE = 'DOUBLE',
  NULL = 'NULL',
  TIMESTAMP = 'TIMESTAMP',
  BIGINT = 'BIGINT',
  INT24 = 'INT24',
  DATE = 'DATE',
  TIME = 'TIME',
  DATETIME = 'DATETIME',
  YEAR = 'YEAR',
  NEWDATE = 'NEWDATE',
  VARCHAR = 'VARCHAR',
  BIT = 'BIT',
  TIMESTAMP2 = 'TIMESTAMP2',
  DATETIME2 = 'DATETIME2',
  TIME2 = 'TIME2',
  JSON = 'JSON',
  NEWDECIMAL = 'NEWDECIMAL',
  ENUM = 'ENUM',
  SET = 'SET',
  TINY_BLOB = 'TINY_BLOB',
  MEDIUM_BLOB = 'MEDIUM_BLOB',
  LONG_BLOB = 'LONG_BLOB',
  BLOB = 'BLOB',
  VAR_STRING = 'VAR_STRING',
  STRING = 'STRING',
  GEOMETRY = 'GEOMETRY'
}

export interface Collation {
  index: number;
  name: string;
  encoding: string;
  maxLength: number;
  fromEncoding(encoding: string): Collation;
  fromIndex(index: number): Collation;
  fromName(name: string): Collation;
}

export interface QueryConfig {
  /**
   * Presents result-sets by table to avoid results with colliding fields.
   * See the query() description for more information.
   */
  nestTables?: boolean | string;

  /**
   * Allows casting result types.
   */
  typeCast?: TypeCastFunction;

  /**
   * Return result-sets as array, rather than a JSON object. This is a faster way to get results
   */
  rowsAsArray?: boolean;

  /**
   * Compatibility option, causes Promise to return an array object,
   * `[rows, metadata]` rather than the rows as JSON objects with a `meta` property.
   * Default to false.
   */
  metaAsArray?: boolean;

  /**
   * force returning insertId as Number in place of BigInt
   */
  insertIdAsNumber?: boolean;

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
   * Compatibility option to permit setting multiple value by a JSON object to replace one question mark.
   * key values will replace the question mark with format like key1=val,key2='val2'.
   * Since it doesn't respect the usual prepared statement format that one value is for one question mark,
   * this can lead to incomprehension, even if you badly use to possible injection.
   */
  permitSetMultiParamEntries?: boolean;

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
   * Force server version check by explicitly using SELECT VERSION(), not relying on server initial handshake
   * information
   */
  forceVersionCheck?: boolean;

  /**
   * Allows the use of LOAD DATA INFILE statements.
   * Loading data from a file from the client may be a security issue, as a man-in-the-middle proxy server can change
   * the actual file the server loads. Being able to execute a query on the client gives you access to files on
   * the client.
   * (Default: false)
   */
  permitLocalInfile?: boolean;

  /**
   * Allows timeout for command execution.
   */
  timeout?: number;

  /**
   * indicate if JSON fields for MariaDB server 10.5.2+ result in JSON format (or String if disabled)
   */
  autoJsonMap?: boolean;

  /**
   * Indicate if an array is included in parentheses. This option permits compatibility with the connector version < 2.5
   */
  arrayParenthesis?: boolean;

  /**
   * indicate to throw an exception if a result-set does not contain some data due to having duplicate identifier
   * (Default: true)
   */
  checkDuplicate?: boolean;

  /**
   * force returning decimal values as Number in place of String
   *
   * Default: false;
   */
  decimalAsNumber?: boolean;

  /**
   * Force returning BIGINT data as Number in place of BigInt.
   *
   * Default: false;
   */
  bigIntAsNumber?: boolean;

  /**
   * @deprecated big numbers (BIGINT and DECIMAL columns) will result as string when not in safe number range.
   * now replaced by decimalAsNumber, bigIntAsNumber and checkNumberRange options
   */
  supportBigNumbers?: boolean;

  /**
   * @deprecated when used with supportBigNumbers, big numbers (BIGINT and DECIMAL columns) will always result as string
   * even if in safe number range.
   * now replaced by decimalAsNumber, bigIntAsNumber and checkNumberRange options
   */
  bigNumberStrings?: boolean;

  /**
   * Throw if conversion to Number is not safe.
   *
   * Default: false;
   */
  checkNumberRange?: boolean;

  /**
   * Configure logger
   */
  logger?: LoggerConfig;

  /**
   * Permit to defined function calling for LOAD LOCAL command, for extra verification like path restriction.
   * @param filepath
   */
  infileStreamFactory?: (filepath: string) => Readable;
}

export interface QueryOptions extends QueryConfig {
  /**
   * SQL command to execute
   */
  sql: string;
}

export interface ConnectionConfig extends UserConnectionConfig, Omit<QueryConfig, 'timeout'> {
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
   * The milliseconds before a timeout occurs during the initial connection to the MySQL server. (Default: 1000)
   */
  connectTimeout?: number;

  /**
   * Socket timeout in milliseconds after the connection is established
   */
  socketTimeout?: number;

  /**
   * Allows timeout for command execution.
   */
  queryTimeout?: number;

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
   * When debugging, maximum packet length to write to the console.
   * (Default: 256)
   */
  debugLen?: number;

  /**
   * indicate if parameters must be logged by query logger
   * (Default: false)
   */
  logParam?: boolean;

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
   * object with ssl parameters or a boolean to enable ssl without setting any other ssl option.
   * see
   * https://github.com/mariadb-corporation/mariadb-connector-nodejs/blob/master/documentation/connection-options.md#ssl
   * for more information
   */
  ssl?: boolean | (SecureContextOptions & { rejectUnauthorized?: boolean });

  /**
   * Compress exchanges using gzip.
   * This can give you better performance when accessing a database in a different location.
   * (Default: false)
   */
  compress?: boolean;

  /**
   * Debug option: permit saving last exchanged packet.
   * Error messages will display those last exchanged packet.
   *
   * (Default: false)
   */
  logPackets?: boolean;

  /**
   * Force server version check by explicitly using SELECT VERSION(), not relying on server initial packet.
   * (Default: false)
   */
  forceVersionCheck?: boolean;

  /**
   * When enabled, the update number corresponds to update rows.
   * When disabled, it indicates the real rows changed.
   */
  foundRows?: boolean;

  /**
   * When a connection is established, permit executing commands before using connection
   */
  initSql?: string | string[];

  /**
   * Permit setting session variables when connecting.
   * Example: sessionVariables:{'idle_transaction_timeout':10000}
   */
  sessionVariables?: any;

  /**
   * permit indicating server global variable max_allowed_packet value to ensure efficient batching.
   * default is 4Mb. see batch documentation
   */
  maxAllowedPacket?: number;

  /**
   * permit enabling socket keeping alive, setting delay. 0 means aren't enabled.
   * Keep in mind that this doesn't reset server
   * [@@wait_timeout](https://mariadb.com/kb/en/library/server-system-variables/#wait_timeout)
   * (use pool option idleTimeout for that).
   * in ms
   * (Default: 0)
   */
  keepAliveDelay?: number;

  /**
   * Indicate path/content to MySQL server RSA public key.
   * use requires Node.js v11.6+
   */
  rsaPublicKey?: string;

  /**
   * Indicate path/content to MySQL server caching RSA public key.
   * use requires Node.js v11.6+
   */
  cachingRsaPublicKey?: string;

  /**
   * Indicate that if `rsaPublicKey` or `cachingRsaPublicKey` public key are not provided, if client can ask server
   * to send public key.
   * default: false
   */
  allowPublicKeyRetrieval?: boolean;

  /**
   * force returning insertId as Number in place of BigInt
   *
   * Default: false;
   */
  insertIdAsNumber?: boolean;

  /**
   * Indicate prepare cache size when using a prepared statement
   *
   * default to 256.
   */
  prepareCacheLength?: number;

  /**
   * Permit setting stream.
   *
   * @param err error is any error occurs during stream creation
   * @param stream if wanting to set a special stream (Standard socket will be created if not set)
   */
  stream?: (callback: typeof StreamCallback) => void;

  /**
   * make result-set metadata property enumerable.
   * Default to false.
   */
  metaEnumerable?: boolean;

  /**
   * Compatibility option, causes Promise to return an array object,
   * `[rows, metadata]` rather than the rows as JSON objects with a `meta` property.
   * Default to false.
   */
  metaAsArray?: boolean;

  /**
   * Return result-sets as array, rather than a JSON object. This is a faster way to get results
   */
  rowsAsArray?: boolean;

  /**
   * Permit to defined function calling for LOAD LOCAL command, for extra verification like path restriction.
   * @param filepath
   */
  infileStreamFactory?: (filepath: string) => Readable;
}
