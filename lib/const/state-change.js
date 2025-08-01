//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2025 MariaDB Corporation Ab

/**
 * Session change type.
 * see: https://mariadb.com/kb/en/library/ok_packet/#session-change-type
 * @type {number}
 */

export const SESSION_TRACK_SYSTEM_VARIABLES = 0;
export const SESSION_TRACK_SCHEMA = 1;
export const SESSION_TRACK_STATE_CHANGE = 2;
export const SESSION_TRACK_GTIDS = 3;
export const SESSION_TRACK_TRANSACTION_CHARACTERISTICS = 4;
export const SESSION_TRACK_TRANSACTION_STATE = 5;
