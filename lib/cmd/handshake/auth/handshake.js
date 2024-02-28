//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

const PluginAuth = require('./plugin-auth');
const InitialHandshake = require('./initial-handshake');
const ClientCapabilities = require('../client-capabilities');
const Capabilities = require('../../../const/capabilities');
const SslRequest = require('../ssl-request');
const Errors = require('../../../misc/errors');
const NativePasswordAuth = require('./native-password-auth');
const os = require('os');
const Iconv = require('iconv-lite');
const Crypto = require('crypto');
const driverVersion = require('../../../../package.json').version;

/**
 * Handshake response
 */
class Handshake extends PluginAuth {
  constructor(auth, getSocket, multiAuthResolver, reject) {
    super(null, multiAuthResolver, reject);
    this.sequenceNo = 0;
    this.compressSequenceNo = 0;
    this.auth = auth;
    this.getSocket = getSocket;
    this.counter = 0;
    this.onPacketReceive = this.parseHandshakeInit;
  }

  start(out, opts, info) {}

  parseHandshakeInit(packet, out, opts, info) {
    if (packet.peek() === 0xff) {
      //in case that some host is not permit to connect server
      const authErr = packet.readError(info);
      authErr.fatal = true;
      return this.throwError(authErr, info);
    }

    let handshake = new InitialHandshake(packet, info);
    ClientCapabilities.init(opts, info);
    this.pluginName = handshake.pluginName;
    if (opts.ssl) {
      if (info.serverCapabilities & Capabilities.SSL) {
        info.clientCapabilities |= Capabilities.SSL;
        SslRequest.send(this, out, info, opts);
        this.auth._createSecureContext(info, () => {
          // mark self-signed error only if was not explicitly forced
          const secureSocket = this.getSocket();
          info.selfSignedCertificate = !secureSocket.authorized;
          info.tlsAuthorizationError = secureSocket.authorizationError;
          const serverCert = secureSocket.getPeerCertificate(false);
          info.tlsFingerprint = serverCert ? serverCert.fingerprint256.replace(/:/gi, '').toLowerCase() : null;

          Handshake.send.call(this, this, out, opts, handshake.pluginName, info);
        });
      } else {
        return this.throwNewError(
          'Trying to connect with ssl, but ssl not enabled in the server',
          true,
          info,
          '08S01',
          Errors.ER_SERVER_SSL_DISABLED
        );
      }
    } else {
      Handshake.send(this, out, opts, handshake.pluginName, info);
    }
    this.onPacketReceive = this.auth.handshakeResult.bind(this.auth);
  }

  permitHash() {
    return this.pluginName !== 'mysql_clear_password';
  }

  hash(conf) {
    // mysql_native_password hash
    let hash = Crypto.createHash('sha1');
    let stage1 = hash.update(conf.password, 'utf8').digest();
    hash = Crypto.createHash('sha1');
    return hash.update(stage1).digest();
  }

  /**
   * Send Handshake response packet
   * see https://mariadb.com/kb/en/library/1-connecting-connecting/#handshake-response-packet
   *
   * @param cmd         current handshake command
   * @param out         output writer
   * @param opts        connection options
   * @param pluginName  plugin name
   * @param info        connection information
   */
  static send(cmd, out, opts, pluginName, info) {
    out.startPacket(cmd);
    info.defaultPluginName = pluginName;
    const pwd = Array.isArray(opts.password) ? opts.password[0] : opts.password;
    let authToken;
    let authPlugin;
    switch (pluginName) {
      case 'mysql_clear_password':
        authToken = Buffer.from(pwd);
        authPlugin = 'mysql_clear_password';
        break;

      default:
        authToken = NativePasswordAuth.encryptSha1Password(pwd, info.seed);
        authPlugin = 'mysql_native_password';
        break;
    }
    out.writeInt32(Number(info.clientCapabilities & BigInt(0xffffffff)));
    out.writeInt32(1024 * 1024 * 1024); // max packet size

    // if collation and id < 255, set it directly
    // is not, additional command SET NAMES xx [COLLATE yy] will be issued
    out.writeInt8(opts.collation && opts.collation.index <= 255 ? opts.collation.index : 224);
    for (let i = 0; i < 19; i++) {
      out.writeInt8(0);
    }

    out.writeInt32(Number(info.clientCapabilities >> 32n));

    //null encoded user
    out.writeString(opts.user || '');
    out.writeInt8(0);

    if (info.serverCapabilities & Capabilities.PLUGIN_AUTH_LENENC_CLIENT_DATA) {
      out.writeLengthCoded(authToken.length);
      out.writeBuffer(authToken, 0, authToken.length);
    } else if (info.serverCapabilities & Capabilities.SECURE_CONNECTION) {
      out.writeInt8(authToken.length);
      out.writeBuffer(authToken, 0, authToken.length);
    } else {
      out.writeBuffer(authToken, 0, authToken.length);
      out.writeInt8(0);
    }

    if (info.clientCapabilities & Capabilities.CONNECT_WITH_DB) {
      out.writeString(opts.database);
      out.writeInt8(0);
      info.database = opts.database;
    }

    if (info.clientCapabilities & Capabilities.PLUGIN_AUTH) {
      out.writeString(authPlugin);
      out.writeInt8(0);
    }

    if (info.clientCapabilities & Capabilities.CONNECT_ATTRS) {
      out.writeInt8(0xfc);
      let initPos = out.pos; //save position, assuming connection attributes length will be less than 2 bytes length
      out.writeInt16(0);
      const encoding = info.collation ? info.collation.charset : 'utf8';

      Handshake.writeAttribute(out, '_client_name', encoding);
      Handshake.writeAttribute(out, 'MariaDB connector/Node', encoding);

      Handshake.writeAttribute(out, '_client_version', encoding);
      Handshake.writeAttribute(out, driverVersion, encoding);

      const address = cmd.getSocket().address().address;
      if (address) {
        Handshake.writeAttribute(out, '_server_host', encoding);
        Handshake.writeAttribute(out, address, encoding);
      }

      Handshake.writeAttribute(out, '_os', encoding);
      Handshake.writeAttribute(out, process.platform, encoding);

      Handshake.writeAttribute(out, '_client_host', encoding);
      Handshake.writeAttribute(out, os.hostname(), encoding);

      Handshake.writeAttribute(out, '_node_version', encoding);
      Handshake.writeAttribute(out, process.versions.node, encoding);

      if (opts.connectAttributes !== true) {
        let attrNames = Object.keys(opts.connectAttributes);
        for (let k = 0; k < attrNames.length; ++k) {
          Handshake.writeAttribute(out, attrNames[k], encoding);
          Handshake.writeAttribute(out, opts.connectAttributes[attrNames[k]], encoding);
        }
      }

      //write end size
      out.writeInt16AtPos(initPos);
    }

    out.flushPacket();
  }

  static writeAttribute(out, val, encoding) {
    let param = Buffer.isEncoding(encoding) ? Buffer.from(val, encoding) : Iconv.encode(val, encoding);
    out.writeLengthCoded(param.length);
    out.writeBuffer(param, 0, param.length);
  }
}

module.exports = Handshake;
