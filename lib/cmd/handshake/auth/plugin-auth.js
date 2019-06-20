'use strict';

const Command = require('../../command');

/**
 * Base authentication plugin
 */
class PluginAuth extends Command {
  constructor(resolve, reject, multiAuthResolver) {
    super(resolve, reject);
    this.multiAuthResolver = multiAuthResolver;
  }

  successSend(packet, out, opts, info) {
    this.emit('end');
    this.multiAuthResolver(packet, out, opts, info);
  }
}

module.exports = PluginAuth;
