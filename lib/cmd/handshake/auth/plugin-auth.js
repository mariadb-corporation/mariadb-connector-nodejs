//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2023 MariaDB Corporation Ab

'use strict';

const Command = require('../../command');

/**
 * Base authentication plugin
 */
class PluginAuth extends Command {
  constructor(cmdParam, multiAuthResolver, reject) {
    super(cmdParam, multiAuthResolver, reject);
    this.onPacketReceive = multiAuthResolver;
  }

  /**
   * Whether this authentication plugin requires a secure connection. Plugins that transmit the
   * password in clear text return true; the driver then only runs them over a secure transport
   * (TLS, or a local unix socket), never over plain TCP.
   *
   * @returns {boolean} true if a secure connection is required
   */
  requireSecure() {
    return false;
  }

  /**
   * Whether the current connection does not expose the password to a network eavesdropper:
   * an encrypted TLS connection or a local unix socket.
   *
   * @param opts  connection options
   * @returns {boolean} true if the connection is encrypted or over a local socket
   */
  isSecureConnection(opts) {
    return Boolean(opts.ssl) || (Boolean(opts.socketPath) && process.platform !== 'win32');
  }
}

module.exports = PluginAuth;
