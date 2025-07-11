//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2025 MariaDB Corporation Ab

/* eslint-disable @typescript-eslint/no-explicit-any */
// Type definitions for mariadb 2.5
// Project: https://github.com/mariadb-corporation/mariadb-connector-nodejs
// Definitions by: Diego Dupin <https://github.com/rusher>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped
// TypeScript Version: 2.1

import { Readable } from 'stream';
import { EventEmitter } from 'events';

import type {
  ConnectionConfig,
  ImportFileConfig,
  SqlError,
  QueryOptions,
  UpsertResult,
  PoolConfig,
  PoolClusterConfig,
  SqlImportOptions,
  ConnectionInfo,
  UserConnectionConfig
} from './share';

export * from './share';

export const version: string;
export function createConnection(connectionUri: string | ConnectionConfig): Promise<Connection>;
export function importFile(config: ImportFileConfig): Promise<void>;

export interface Prepare {
  id: number;
  execute<T = any>(values?: any): Promise<T>;
  /**
   * Execute query returning a Readable Object that will emit columns/data/end/error events
   * to permit streaming big result-set
   */
  executeStream(values?: any): Readable;
  close(): void;
}

export interface Connection extends EventEmitter {
  /**
   * Connection information
   */
  info: ConnectionInfo | null;

  /**
   * Alias of info.threadId for compatibility
   */
  readonly threadId: number | null;

  /**
   * Permit changing user during connection.
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
  query<T = any>(sql: string | QueryOptions, values?: any): Promise<T>;

  /**
   * Prepare query.
   */
  prepare(sql: string | QueryOptions): Promise<Prepare>;

  /**
   * Execute query using binary (prepare) protocol
   */
  execute<T = any>(sql: string | QueryOptions, values?: any): Promise<T>;

  /**
   * Execute batch. Values are Array of Array.
   */
  batch<T = UpsertResult | UpsertResult[]>(sql: string | QueryOptions, values?: any): Promise<T>;

  /**
   * Execute query returning a Readable Object that will emit columns/data/end/error events
   * to permit streaming big result-set
   */
  queryStream(sql: string | QueryOptions, values?: any): Readable;

  /**
   * Send an empty MySQL packet to ensure the connection is active, and reset @@wait_timeout
   */
  ping(): Promise<void>;

  /**
   * Send a reset command that will
   * - roll back any open transaction
   * - reset transaction isolation level
   * - reset session variables
   * - delete user variables
   * - remove temporary tables
   * - remove all PREPARE statements
   */
  reset(): Promise<void>;

  /**
   * import sql file
   */
  importFile(config: SqlImportOptions): Promise<void>;

  /**
   * Indicates the state of the connection as the driver knows it
   */
  isValid(): boolean;

  /**
   * Terminate connection gracefully.
   */
  end(): Promise<void>;

  /**
   * @deprecated alias for end().
   */
  close(): Promise<void>;

  /**
   * Force connection termination by closing the underlying socket and killing a server process if any.
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

  /**
   * This function permits escaping a parameter properly, according to a parameter type, to avoid injection.
   * @param value parameter
   */
  escape(value: any): string;

  /**
   * This function permits escaping an Identifier properly. See Identifier Names for escaping. Value will be enclosed
   * by '`' character if content doesn't satisfy:
   * <OL>
   *  <LI>ASCII: [0-9,a-z,A-Z$_] (numerals 0-9, basic Latin letters, both lowercase and uppercase, dollar sign,
   *  underscore)</LI>
   *  <LI>Extended: U+0080 .. U+FFFF and escaping '`' character if needed.</LI>
   * </OL>
   * @param identifier identifier
   */
  escapeId(identifier: string): string;

  on(ev: 'end', callback: () => void): Connection;
  on(ev: 'error', callback: (err: SqlError) => void): Connection;
  on(eventName: string | symbol, listener: (...args: any[]) => void): this;
  listeners(ev: 'end'): (() => void)[];
  listeners(ev: 'error'): ((err: SqlError) => void)[];
}

export interface PoolConnection extends Connection {
  /**
   * Release the connection to pool internal cache.
   */
  release(): Promise<void>;
}

export interface Pool {
  closed: boolean;
  /**
   * Retrieve a connection from the pool.
   * Create a new one if the limit is not reached.
   * wait until acquireTimeout.
   */
  getConnection(): Promise<PoolConnection>;

  /**
   * Execute a query on one connection from pool.
   */
  query<T = any>(sql: string | QueryOptions, values?: any): Promise<T>;

  /**
   * Execute a batch on one connection from pool.
   */
  batch<T = UpsertResult | UpsertResult[]>(sql: string | QueryOptions, values?: any): Promise<T>;

  /**
   * Execute query using binary (prepare) protocol
   */
  execute<T = any>(sql: string | QueryOptions, values?: any): Promise<T>;

  /**
   * Close all connection in pool
   */
  end(): Promise<void>;

  /**
   * import sql file
   */
  importFile(config: SqlImportOptions): Promise<void>;

  /**
   * Get current active connections.
   */
  activeConnections(): number;

  /**
   * Get the current total connection number.
   */
  totalConnections(): number;

  /**
   * Get the current idle connection number.
   */
  idleConnections(): number;

  /**
   * Get current stacked connection request.
   */
  taskQueueSize(): number;

  /**
   * This function permits escaping a parameter properly, according to a parameter type, to avoid injection.
   * @param value parameter
   */
  escape(value: any): string;

  /**
   * This function permits escaping an Identifier properly. See Identifier Names for escaping. Value will be enclosed
   * by '`' character if content doesn't satisfy:
   * <OL>
   *  <LI>ASCII: [0-9,a-z,A-Z$_] (numerals 0-9, basic Latin letters, both lowercase and uppercase, dollar sign,
   *  underscore)</LI>
   *  <LI>Extended: U+0080 .. U+FFFF and escaping '`' character if needed.</LI>
   * </OL>
   * @param identifier identifier
   */
  escapeId(identifier: string): string;

  on(ev: 'acquire', callback: (conn: Connection) => void): Pool;
  on(ev: 'connection', callback: (conn: Connection) => void): Pool;
  on(ev: 'enqueue', callback: () => void): Pool;
  on(ev: 'release', callback: (conn: Connection) => void): Pool;
}

export interface FilteredPoolCluster {
  getConnection(): Promise<PoolConnection>;
  query<T = any>(sql: string | QueryOptions, values?: any): Promise<T>;
  batch<T = UpsertResult | UpsertResult[]>(sql: string | QueryOptions, values?: any): Promise<T>;
  execute<T = any>(sql: string | QueryOptions, values?: any): Promise<T>;
}

export interface PoolCluster {
  add(id: string, config: PoolConfig): void;
  end(): Promise<void>;
  of(pattern: string, selector?: string): FilteredPoolCluster;
  of(pattern: undefined | null | false, selector: string): FilteredPoolCluster;
  remove(pattern: string): void;
  getConnection(pattern?: string, selector?: string): Promise<PoolConnection>;

  on(ev: 'remove', callback: (nodekey: string) => void): PoolCluster;
}
export function createPool(config: PoolConfig | string): Pool;
export function createPoolCluster(config?: PoolClusterConfig): PoolCluster;
