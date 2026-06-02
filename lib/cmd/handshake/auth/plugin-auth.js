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
   * Whether this plugin must only be used over a secure channel
   *
   * @returns {boolean} true if the plugin requires a secure channel
   */
  requireSsl() {
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
