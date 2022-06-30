'use strict';

const Command = require('../../command');

/**
 * Base authentication plugin
 */
class PluginAuth extends Command {
  constructor(cmdParam, resolve, reject, multiAuthResolver) {
    super(cmdParam, resolve, reject);
    this.multiAuthResolver = multiAuthResolver;
  }

  successSend(packet, out, opts, info) {
    this.multiAuthResolver(packet, out, opts, info);
  }
}

module.exports = PluginAuth;
