//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

import Command from '../../command.js';

/**
 * Base authentication plugin
 */
class PluginAuth extends Command {
  constructor(cmdParam, multiAuthResolver, reject) {
    super(cmdParam, multiAuthResolver, reject);
    this.onPacketReceive = multiAuthResolver;
  }

  /**
   * Whether this plugin is safe to use when TLS was forced to trust a self-signed
   * certificate (no CA pinned).
   * @returns {boolean} true if the plugin protects the credential against a MitM
   */
  isMitmProof() {
    return false;
  }

  /**
   * Whether this authentication plugin requires a secure connection.
   * the driver then only runs them over a secure transport (TLS, or a local unix socket), never over plain TCP.
   *
   * @returns {boolean} true if a secure connection is required
   */
  requireSecure() {
    return false;
  }

  /**
   * Whether the current connection is over a channel that does not expose the password
   * to a network eavesdropper: an encrypted TLS connection or a local unix socket.
   *
   * @param opts  connection options
   * @returns {boolean} true if the connection is encrypted or over a local socket
   */
  isSecureConnection(opts) {
    return Boolean(opts.ssl) || (Boolean(opts.socketPath) && process.platform !== 'win32');
  }

  hash(conf) {
    return null;
  }
}

export default PluginAuth;
