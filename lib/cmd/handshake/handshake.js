"use strict";

const Command = require("../command");
const InitialHandshake = require("./initial-handshake");
const ClientHandshakeResponse = require("./client-handshake-response");
const SslRequest = require("./ssl-request");
const ClientCapabilities = require("./client-capabilities");
const Errors = require("../../misc/errors");
const Capabilities = require("../../const/capabilities");

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
  }

  parseHandshakeInit(packet, out, opts, info) {
    if (packet.peek() === 0xff) {
      //in case that some host is not permit to connect server
      const authErr = packet.readError(info);
      authErr.fatal = true;
      return this.throwError(authErr, info);
    }

    let handshake = new InitialHandshake(packet, info);
    ClientCapabilities.init(opts, info);

    if (opts.ssl) {
      if (info.serverCapabilities & Capabilities.SSL) {
        info.clientCapabilities |= Capabilities.SSL;
        SslRequest.send(this, out, info, opts);
        this._createSecureContext(
          function() {
            ClientHandshakeResponse.send(this, out, opts, handshake.pluginName, info);
          }.bind(this)
        );
        return (this.onPacketReceive = this.handshakeResult);
      } else {
        return this.throwNewError(
          "Trying to connect with ssl, but ssl not enabled in the server",
          true,
          info,
          "08S01",
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
        this.dispatchAuthSwitchRequest(packet, out, opts, info);
        this.resolve = null;
        this.reject = null;
        this.onPacketReceive = null;
        this.emit("send_end");
        this.emit("end");
        return;

      //*********************************************************************************************************
      //* OK_Packet - authentication succeeded
      //*********************************************************************************************************
      case 0x00:
        packet.skip(1); //skip header
        packet.skipLengthCodedNumber(); //skip affected rows
        packet.skipLengthCodedNumber(); //skip last insert id
        info.status = packet.readUInt16();
        this.emit("send_end");
        return this.successEnd();

      //*********************************************************************************************************
      //* ERR_Packet
      //*********************************************************************************************************
      case 0xff:
        const authErr = packet.readError(info, this.displaySql());
        authErr.fatal = true;
        return this.throwError(authErr, info);

      //*********************************************************************************************************
      //* unexpected
      //*********************************************************************************************************
      default:
        this.throwNewError(
          "Unexpected type of packet during handshake phase : " + packet.log(),
          true,
          info,
          "42000",
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
        pluginName = "mysql_old_password";
        pluginData = info.seed.slice(0, 8);
      }
    } else {
      pluginName = packet.readStringNullEnded("cesu8");
      pluginData = packet.readBufferRemaining();
    }

    const plugin = Handshake.pluginHandler(
      pluginName,
      this.sequenceNo,
      pluginData,
      info,
      opts,
      out,
      this.resolve,
      this.reject
    );

    if (!plugin) {
      this.reject(
        Errors.createError(
          "Client does not support authentication protocol '" +
            pluginName +
            "' requested by server. ",
          true,
          info,
          "08004",
          Errors.ER_AUTHENTICATION_PLUGIN_NOT_SUPPORTED
        )
      );
    } else {
      this._addCommand(plugin, false);
    }
  }

  static pluginHandler(pluginName, packSeq, pluginData, info, opts, out, authResolve, authReject) {
    let pluginAuth;
    switch (pluginName) {
      case "mysql_native_password":
        pluginAuth = require("./auth/native_password_auth.js");
        break;

      case "mysql_clear_password":
        pluginAuth = require("./auth/clear_password_auth.js");
        break;

      case "dialog":
        pluginAuth = require("./auth/pam_password_auth.js");
        break;

      //TODO "auth_gssapi_client"
      //TODO "client_ed25519"

      default:
        return null;
    }
    return new pluginAuth(packSeq, pluginData, authResolve, authReject);
  }
}

module.exports = Handshake;
