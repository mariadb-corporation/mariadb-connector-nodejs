"use strict";

const Capabilities = require("../../const/capabilities");

/**
 * Initialize client capabilities according to options and server capabilities
 *
 * @param opts                options
 * @param info                information
 */
module.exports.init = function(opts, info) {
  let capabilities =
    Capabilities.IGNORE_SPACE |
    Capabilities.PROTOCOL_41 |
    Capabilities.TRANSACTIONS |
    Capabilities.SECURE_CONNECTION |
    Capabilities.MULTI_RESULTS |
    Capabilities.PS_MULTI_RESULTS |
    Capabilities.SESSION_TRACK |
    Capabilities.PLUGIN_AUTH |
    Capabilities.PLUGIN_AUTH_LENENC_CLIENT_DATA;

  if (opts.connectAttributes) {
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

  info.eofDeprecated = false;
  if (info.serverCapabilities & Capabilities.DEPRECATE_EOF) {
    capabilities |= Capabilities.DEPRECATE_EOF;
    info.eofDeprecated = true;
  }

  if (opts.database) {
    capabilities |= Capabilities.CONNECT_WITH_DB;
  }

  // use compression only if requested by client and supported by server
  if (opts.compress) {
    if (info.serverCapabilities & Capabilities.COMPRESS) {
      capabilities |= Capabilities.COMPRESS;
    } else {
      opts.compress = false;
    }
  }
  info.clientCapabilities = capabilities;
};
