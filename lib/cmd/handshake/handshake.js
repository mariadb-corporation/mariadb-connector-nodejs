'use strict';

const Command = require('../command');
const InitialHandshake = require('./initial-handshake');
const ClientHandshakeResponse = require('./client-handshake-response');
const SslRequest = require('./ssl-request');
const ClientCapabilities = require('./client-capabilities');
const Errors = require('../../misc/errors');
const Capabilities = require('../../const/capabilities');
const process = require('process');

/**
 * Handle handshake.
 * see https://mariadb.com/kb/en/library/1-connecting-connecting/
 */
class Handshake extends Command {
  constructor(resolve, reject, _createSecureContext, _addCommand, getSocket) {
    super(resolve, reject);
    this._createSecureContext = _createSecureContext;
    this._addCommand = _addCommand;
    this.getSocket = getSocket;
    this.onPacketReceive = this.parseHandshakeInit;
    this.plugin = this;
  }

  ensureOptionCompatibility(opts, info) {
    if (
      opts.multipleStatements &&
      (info.serverCapabilities & Capabilities.MULTI_STATEMENTS) === 0
    ) {
      return this.throwNewError(
        "Option `multipleStatements` enable, but server doesn'permits multi-statment",
        true,
        info,
        '08S01',
        Errors.ER_CLIENT_OPTION_INCOMPATIBILITY
      );
    }

    if (opts.permitLocalInfile && (info.serverCapabilities & Capabilities.LOCAL_FILES) === 0) {
      return this.throwNewError(
        "Option `permitLocalInfile` enable, but server doesn'permits using local file",
        true,
        info,
        '08S01',
        Errors.ER_CLIENT_OPTION_INCOMPATIBILITY
      );
    }
  }

  parseHandshakeInit(packet, out, opts, info) {
    if (packet.peek() === 0xff) {
      //in case that some host is not permit to connect server
      const authErr = packet.readError(info);
      authErr.fatal = true;
      return this.throwError(authErr, info);
    }

    let handshake = new InitialHandshake(packet, info);
    this.ensureOptionCompatibility(opts, info);
    ClientCapabilities.init(opts, info);

    if (opts.ssl) {
      if (info.serverCapabilities & Capabilities.SSL) {
        info.clientCapabilities |= Capabilities.SSL;
        SslRequest.send(this, out, info, opts);
        this._createSecureContext(
          function () {
            ClientHandshakeResponse.send(this, out, opts, handshake.pluginName, info);
          }.bind(this)
        );
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
      ClientHandshakeResponse.send(this, out, opts, handshake.pluginName, info);
    }
    this.onPacketReceive = this.handshakeResult;
  }

  /**
   * Fast-path handshake results :
   *  - if plugin was the one expected by server, server will send OK_Packet / ERR_Packet.
   *  - if not, server send an AuthSwitchRequest packet, indicating the specific PLUGIN to use with this user.
   *    dispatching to plugin handler then.
   *
   * @param packet    current packet
   * @param out       output buffer
   * @param opts      options
   * @param info      connection info
   * @returns {*}     return null if authentication succeed, depending on plugin conversation if not finished
   */
  handshakeResult(packet, out, opts, info) {
    const marker = packet.peek();
    switch (marker) {
      //*********************************************************************************************************
      //* AuthSwitchRequest packet
      //*********************************************************************************************************
      case 0xfe:
        this.plugin.onPacketReceive = null;
        this.plugin.emit('send_end');
        this.plugin.emit('end');
        this.dispatchAuthSwitchRequest(packet, out, opts, info);
        return;

      //*********************************************************************************************************
      //* OK_Packet - authentication succeeded
      //*********************************************************************************************************
      case 0x00:
        packet.skip(1); //skip header
        packet.skipLengthCodedNumber(); //skip affected rows
        packet.skipLengthCodedNumber(); //skip last insert id
        info.status = packet.readUInt16();
        this.plugin.emit('send_end');
        return this.plugin.successEnd();

      //*********************************************************************************************************
      //* ERR_Packet
      //*********************************************************************************************************
      case 0xff:
        const authErr = packet.readError(info, this.displaySql());
        authErr.fatal = true;
        return this.plugin.throwError(authErr, info);

      //*********************************************************************************************************
      //* unexpected
      //*********************************************************************************************************
      default:
        this.throwNewError(
          'Unexpected type of packet during handshake phase : ' + marker,
          true,
          info,
          '42000',
          Errors.ER_AUTHENTICATION_BAD_PACKET
        );
    }
  }

  /**
   * Handle authentication switch request : dispatch to plugin handler.
   *
   * @param packet  packet
   * @param out     output writer
   * @param opts    options
   * @param info    connection information
   */
  dispatchAuthSwitchRequest(packet, out, opts, info) {
    let pluginName, pluginData;
    if (info.clientCapabilities & Capabilities.PLUGIN_AUTH) {
      packet.skip(1); //header
      if (packet.remaining()) {
        //AuthSwitchRequest packet.
        pluginName = packet.readStringNullEnded();
        pluginData = packet.readBufferRemaining();
      } else {
        //OldAuthSwitchRequest
        pluginName = 'mysql_old_password';
        pluginData = info.seed.slice(0, 8);
      }
    } else {
      pluginName = packet.readStringNullEnded('cesu8');
      pluginData = packet.readBufferRemaining();
    }

    try {
      this.plugin = Handshake.pluginHandler(
        pluginName,
        this.plugin.sequenceNo,
        this.plugin.compressSequenceNo,
        pluginData,
        info,
        opts,
        out,
        this.resolve,
        this.reject,
        this.handshakeResult.bind(this)
      );
    } catch (err) {
      this.reject(err);
      return;
    }

    if (!this.plugin) {
      this.reject(
        Errors.createError(
          "Client does not support authentication protocol '" +
            pluginName +
            "' requested by server. ",
          true,
          info,
          '08004',
          Errors.ER_AUTHENTICATION_PLUGIN_NOT_SUPPORTED
        )
      );
    } else {
      this._addCommand(this.plugin, false);
    }
  }

  static pluginHandler(
    pluginName,
    packSeq,
    compressPackSeq,
    pluginData,
    info,
    opts,
    out,
    authResolve,
    authReject,
    multiAuthResolver
  ) {
    let pluginAuth;
    switch (pluginName) {
      case 'mysql_native_password':
        pluginAuth = require('./auth/native-password-auth.js');
        break;

      case 'mysql_clear_password':
        pluginAuth = require('./auth/clear-password-auth.js');
        break;

      case 'client_ed25519':
        pluginAuth = require('./auth/ed25519-password-auth.js');
        break;

      case 'dialog':
        pluginAuth = require('./auth/pam-password-auth.js');
        break;

      case 'sha256_password':
        if (!Handshake.ensureNodeVersion(11, 6, 0)) {
          throw Errors.createError(
            'sha256_password authentication plugin require node 11.6+',
            true,
            info,
            '08004',
            Errors.ER_MINIMUM_NODE_VERSION_REQUIRED
          );
        }
        pluginAuth = require('./auth/sha256-password-auth.js');
        break;

      case 'caching_sha2_password':
        if (!Handshake.ensureNodeVersion(11, 6, 0)) {
          throw Errors.createError(
            'caching_sha2_password authentication plugin require node 11.6+',
            true,
            info,
            '08004',
            Errors.ER_MINIMUM_NODE_VERSION_REQUIRED
          );
        }
        pluginAuth = require('./auth/caching-sha2-password-auth.js');
        break;

      //TODO "auth_gssapi_client"

      default:
        return null;
    }
    return new pluginAuth(
      packSeq,
      compressPackSeq,
      pluginData,
      authResolve,
      authReject,
      multiAuthResolver
    );
  }

  static ensureNodeVersion(major, minor, patch) {
    const ver = process.versions.node.split('.');
    return (
      ver[0] > major ||
      (ver[0] === major && ver[1] > minor) ||
      (ver[0] === major && ver[1] === minor && ver[2] >= patch)
    );
  }
}

module.exports = Handshake;
