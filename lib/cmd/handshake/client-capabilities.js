'use strict';

const Capabilities = require('../../const/capabilities');
const Long = require('long');

/**
 * Initialize client capabilities according to options and server capabilities
 *
 * @param opts                options
 * @param info                information
 */
module.exports.init = function (opts, info) {
  let capabilitiesLow =
    Capabilities.IGNORE_SPACE |
    Capabilities.PROTOCOL_41 |
    Capabilities.TRANSACTIONS |
    Capabilities.SECURE_CONNECTION |
    Capabilities.MULTI_RESULTS |
    Capabilities.PS_MULTI_RESULTS |
    Capabilities.SESSION_TRACK |
    Capabilities.PLUGIN_AUTH |
    Capabilities.PLUGIN_AUTH_LENENC_CLIENT_DATA;

  let capabilitiesHigh = 0;
  if ((info.serverCapabilities.low & Capabilities.MYSQL) === 0) {
    capabilitiesHigh |= Capabilities.MARIADB_CLIENT_EXTENDED_TYPE_INFO;
  }

  if (opts.connectAttributes) {
    capabilitiesLow |= Capabilities.CONNECT_ATTRS;
  }

  if (opts.foundRows) {
    capabilitiesLow |= Capabilities.FOUND_ROWS;
  }

  if (opts.permitLocalInfile) {
    capabilitiesLow |= Capabilities.LOCAL_FILES;
  }

  if (opts.multipleStatements) {
    capabilitiesLow |= Capabilities.MULTI_STATEMENTS;
  }

  info.eofDeprecated = (info.serverCapabilities.low & Capabilities.DEPRECATE_EOF) > 0;
  if (info.eofDeprecated) {
    capabilitiesLow |= Capabilities.DEPRECATE_EOF;
  }

  if (opts.database) {
    capabilitiesLow |= Capabilities.CONNECT_WITH_DB;
  }

  // use compression only if requested by client and supported by server
  if (opts.compress) {
    if (info.serverCapabilities.low & Capabilities.COMPRESS) {
      capabilitiesLow |= Capabilities.COMPRESS;
    } else {
      opts.compress = false;
    }
  }

  if (opts.bulk) {
    if (info.serverCapabilities.high & Capabilities.MARIADB_CLIENT_STMT_BULK_OPERATIONS) {
      capabilitiesHigh |= Capabilities.MARIADB_CLIENT_STMT_BULK_OPERATIONS;
    }
  }

  if (opts.permitConnectionWhenExpired) {
    capabilitiesLow |= Capabilities.CAN_HANDLE_EXPIRED_PASSWORDS;
  }
  info.clientCapabilities = new Long(capabilitiesLow, capabilitiesHigh, true);
};
