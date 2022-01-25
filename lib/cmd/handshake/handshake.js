'use strict';

const Command = require('../command');
const InitialHandshake = require('./initial-handshake');
const ClientHandshakeResponse = require('./client-handshake-response');
const SslRequest = require('./ssl-request');
const ClientCapabilities = require('./client-capabilities');
const Errors = require('../../misc/errors');
const Capabilities = require('../../const/capabilities');
const Collations = require('../../const/collations');
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
    if (opts.multipleStatements && (info.serverCapabilities & Capabilities.MULTI_STATEMENTS) === 0) {
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

    // handle default collation.
    if (opts.collation) {
      // collation has been set using charset.
      // If server use same charset, use server collation.
      if (!opts.charset || info.collation.charset !== opts.collation.charset) {
        info.collation = opts.collation;
      }
    } else {
      // if not utf8mb4 and no configuration, force to use UTF8MB4_UNICODE_CI
      if (info.collation.charset !== 'utf8' || info.collation.maxLength === 3) {
        info.collation = Collations.fromIndex(224);
      }
    }

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
        this.plugin.onPacketReceive = null;
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
        this.plugin.onPacketReceive = null;
        const authErr = packet.readError(info, this.displaySql());
        authErr.fatal = true;
        return this.plugin.throwError(authErr, info);

      //*********************************************************************************************************
      //* unexpected
      //*********************************************************************************************************
      default:
        this.throwNewError(
          `Unexpected type of packet during handshake phase : ${marker}`,
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
    if (opts.restrictedAuth && !opts.restrictedAuth.includes(pluginName)) {
      this.throwNewError(
        `Unsupported authentication plugin ${pluginName}. Authorized plugin: ${opts.restrictedAuth.toString()}`,
        true,
        info,
        '42000',
        Errors.ER_NOT_SUPPORTED_AUTH_PLUGIN
      );
      return;
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
        Errors.createFatalError(
          "Client does not support authentication protocol '" + pluginName + "' requested by server. ",
          Errors.ER_AUTHENTICATION_PLUGIN_NOT_SUPPORTED,
          info,
          '08004'
        )
      );
    } else {
      this._addCommand(this.plugin);
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
          throw Errors.createFatalError(
            'sha256_password authentication plugin require node 11.6+',
            Errors.ER_MINIMUM_NODE_VERSION_REQUIRED,
            info,
            '08004'
          );
        }
        pluginAuth = require('./auth/sha256-password-auth.js');
        break;

      case 'caching_sha2_password':
        if (!Handshake.ensureNodeVersion(11, 6, 0)) {
          throw Errors.createFatalError(
            'caching_sha2_password authentication plugin require node 11.6+',
            Errors.ER_MINIMUM_NODE_VERSION_REQUIRED,
            info,
            '08004'
          );
        }
        pluginAuth = require('./auth/caching-sha2-password-auth.js');
        break;

      //TODO "auth_gssapi_client"

      default:
        return null;
    }
    return new pluginAuth(packSeq, compressPackSeq, pluginData, authResolve, authReject, multiAuthResolver);
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
