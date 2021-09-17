// noinspection JSBitwiseOperatorUsage

'use strict';

const Capabilities = require('../../const/capabilities');

/**
 * Initialize client capabilities according to options and server capabilities
 *
 * @param opts                options
 * @param info                information
 */
module.exports.init = function (opts, info) {
  let capabilities =
    Capabilities.IGNORE_SPACE |
    Capabilities.PROTOCOL_41 |
    Capabilities.TRANSACTIONS |
    Capabilities.SECURE_CONNECTION |
    Capabilities.MULTI_RESULTS |
    Capabilities.PS_MULTI_RESULTS |
    Capabilities.SESSION_TRACK |
    Capabilities.PLUGIN_AUTH_LENENC_CLIENT_DATA;

  if (!(info.serverCapabilities & Capabilities.MYSQL)) {
    capabilities |= Capabilities.MARIADB_CLIENT_EXTENDED_TYPE_INFO;
  }

  if (info.serverCapabilities & Capabilities.PLUGIN_AUTH) {
    capabilities |= Capabilities.PLUGIN_AUTH;
  }

  if (opts.connectAttributes && info.serverCapabilities & Capabilities.CONNECT_ATTRS) {
    capabilities |= Capabilities.CONNECT_ATTRS;
  }

  if (opts.foundRows) {
    capabilities |= Capabilities.FOUND_ROWS;
  }

  if (opts.permitLocalInfile) {
    capabilities |= Capabilities.LOCAL_FILES;
  }

  if (opts.multipleStatements) {
    capabilities |= Capabilities.MULTI_STATEMENTS;
  }

  info.eofDeprecated = (info.serverCapabilities & Capabilities.DEPRECATE_EOF) > 0;
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

  if (opts.bulk) {
    if (info.serverCapabilities & Capabilities.MARIADB_CLIENT_STMT_BULK_OPERATIONS) {
      capabilities |= Capabilities.MARIADB_CLIENT_STMT_BULK_OPERATIONS;
    }
  }

  if (opts.permitConnectionWhenExpired) {
    capabilities |= Capabilities.CAN_HANDLE_EXPIRED_PASSWORDS;
  }
  info.clientCapabilities = capabilities;
};
