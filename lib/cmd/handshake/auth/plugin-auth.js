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

  hash(conf) {
    return null;
  }
}

export default PluginAuth;
