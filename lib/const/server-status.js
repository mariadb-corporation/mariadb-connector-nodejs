//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2025 MariaDB Corporation Ab

/**
 * possible server status flag value
 * see https://mariadb.com/kb/en/library/ok_packet/#server-status-flag
 * @type {number}
 */
//A transaction is currently active
export const STATUS_IN_TRANS = 1;
//Autocommit mode is set
export const STATUS_AUTOCOMMIT = 2;
//more results exist (more packets follow)
export const MORE_RESULTS_EXISTS = 8;
export const QUERY_NO_GOOD_INDEX_USED = 16;
export const QUERY_NO_INDEX_USED = 32;
//when using COM_STMT_FETCH, indicate that current cursor still has result (deprecated)
export const STATUS_CURSOR_EXISTS = 64;
//when using COM_STMT_FETCH, indicate that current cursor has finished to send results (deprecated)
export const STATUS_LAST_ROW_SENT = 128;
//database has been dropped
export const STATUS_DB_DROPPED = 1 << 8;
//the current escape mode is "no backslash escape"
export const STATUS_NO_BACKSLASH_ESCAPES = 1 << 9;
//A DDL change did have an impact on an existing PREPARE (an automatic re-prepare has been executed)
export const STATUS_METADATA_CHANGED = 1 << 10;
export const QUERY_WAS_SLOW = 1 << 11;
//this result-set contains a stored procedure output parameter
export const PS_OUT_PARAMS = 1 << 12;
//the current transaction is a read-only transaction
export const STATUS_IN_TRANS_READONLY = 1 << 13;
//session state change. see a Session change type for more information
export const SESSION_STATE_CHANGED = 1 << 14;
