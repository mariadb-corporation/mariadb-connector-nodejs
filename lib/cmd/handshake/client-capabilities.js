//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

// noinspection JSBitwiseOperatorUsage

'use strict';

import * as Capabilities from '../../const/capabilities.js';

/**
 * Initialize client capabilities according to options and server capabilities
 *
 * @param opts                options
 * @param info                information
 */
export default function init(opts, info) {
  let capabilities =
    Capabilities.IGNORE_SPACE |
    Capabilities.PROTOCOL_41 |
    Capabilities.TRANSACTIONS |
    Capabilities.SECURE_CONNECTION |
    Capabilities.MULTI_RESULTS |
    Capabilities.PS_MULTI_RESULTS |
    Capabilities.SESSION_TRACK |
    Capabilities.CONNECT_ATTRS |
    Capabilities.PLUGIN_AUTH_LENENC_CLIENT_DATA |
    Capabilities.MARIADB_CLIENT_EXTENDED_METADATA |
    Capabilities.PLUGIN_AUTH;

  if (opts.foundRows) {
    capabilities |= Capabilities.FOUND_ROWS;
  }

  if (opts.permitLocalInfile) {
    capabilities |= Capabilities.LOCAL_FILES;
  }

  if (opts.multipleStatements) {
    capabilities |= Capabilities.MULTI_STATEMENTS;
  }

  info.eofDeprecated = !opts.keepEof && (info.serverCapabilities & Capabilities.DEPRECATE_EOF) > 0;
  if (info.eofDeprecated) {
    capabilities |= Capabilities.DEPRECATE_EOF;
  }

  if (opts.database && info.serverCapabilities & Capabilities.CONNECT_WITH_DB) {
    capabilities |= Capabilities.CONNECT_WITH_DB;
  }

  info.serverPermitSkipMeta = (info.serverCapabilities & Capabilities.MARIADB_CLIENT_CACHE_METADATA) > 0;
  if (info.serverPermitSkipMeta) {
    capabilities |= Capabilities.MARIADB_CLIENT_CACHE_METADATA;
  }

  // use compression only if requested by client and supported by server
  if (opts.compress) {
    if (info.serverCapabilities & Capabilities.COMPRESS) {
      capabilities |= Capabilities.COMPRESS;
    } else {
      opts.compress = false;
    }
  }

  if (opts.bulk && info.serverCapabilities & Capabilities.MARIADB_CLIENT_STMT_BULK_OPERATIONS) {
    capabilities |= Capabilities.MARIADB_CLIENT_STMT_BULK_OPERATIONS;
    capabilities |= Capabilities.BULK_UNIT_RESULTS;
  }

  if (opts.permitConnectionWhenExpired) {
    capabilities |= Capabilities.CAN_HANDLE_EXPIRED_PASSWORDS;
  }

  info.clientCapabilities = capabilities & info.serverCapabilities;
}
