"use strict";

/**
 * Send SSL Request packet.
 * see : https://mariadb.com/kb/en/library/1-connecting-connecting/#sslrequest-packet
 *
 * @param cmd     current command
 * @param out     output writer
 * @param info    client information
 * @param opts    connection options
 */
module.exports.send = function sendSSLRequest(cmd, out, info, opts) {
  out.startPacket(cmd);
  out.writeInt32(info.clientCapabilities);
  out.writeInt32(1024 * 1024 * 1024); // max packet size
  out.writeInt8(opts.collation.index);
  for (let i = 0; i < 23; i++) {
    out.writeInt8(0);
  }
  out.flushBuffer(true);
};
