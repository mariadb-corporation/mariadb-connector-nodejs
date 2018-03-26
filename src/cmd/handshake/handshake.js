"use strict";

const Command = require("../command");
const InitialHandshake = require("./initial-handshake");
const ClientHandshakeResponse = require("./client-handshake-response");
const SslRequest = require("./ssl-request");
const ClientCapabilities = require("./client-capabilities");
const Utils = require("../../misc/utils");
const Capabilities = require("../../const/capabilities");

/**
 * Handle handshake.
 * see https://mariadb.com/kb/en/library/1-connecting-connecting/
 */
class Handshake extends Command {
  constructor(conn) {
    super(conn._events);
    this.conn = conn;
  }

  start(out, opts, info) {
    this.sequenceNo = 1;
    return this.parseHandshakeInit;
  }

  parseHandshakeInit(packet, out, opts, info) {
    let handshake = new InitialHandshake(packet, info);
    ClientCapabilities.init(opts, info);

    if (opts.ssl) {
      if (info.serverCapabilities & Capabilities.SSL) {
        info.clientCapabilities |= Capabilities.SSL;
        SslRequest.send(this, out, this.clientCapabilities, opts.collation.index);
        this.conn._createSecureContext(err => {
          if (err) {
            err.fatal = true;
            this.emit("error", err);
            return;
          }
          ClientHandshakeResponse.send(this, out, opts, handshake.pluginName, info);
        });
      } else {
        const err = Utils.createError(
          "Trying to connect with ssl, but ssl not enabled in the server",
          true,
          info
        );
        this.emit("error", err);
        return false;
      }
    } else {
      ClientHandshakeResponse.send(this, out, opts, handshake.pluginName, info);
    }
    return this.handshakeResult;
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
        return this.handshakeResult;

      //*********************************************************************************************************
      //* OK_Packet - authentication succeeded
      //*********************************************************************************************************
      case 0x00:
        this.authEnded(opts);
        return null;

      //*********************************************************************************************************
      //* ERR_Packet
      //*********************************************************************************************************
      case 0xff:
        return this.throwError(packet.readError(info, this.displaySql()));

      //*********************************************************************************************************
      //* unexpected
      //*********************************************************************************************************
      default:
        const err = Utils.createError(
          "Unexpected type of packet during handshake phase : " + packet.log(),
          true,
          info
        );
        return this.throwError(err);
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

    const authSwitchHandler = opts.authSwitchHandler || this.defaultAuthSwitchHandler();
    authSwitchHandler.call(
      this.connEvents,
      pluginName,
      this.sequenceNo + 1,
      pluginData,
      info,
      opts,
      out,
      this.authEnded
    );
  }

  /**
   * Authentication succeed
   *
   * @param opts  connection options
   */
  authEnded(opts) {
    if (opts.compress) {
      //TODO handle compression
    }

    if (this.onResult) this.onResult(null);
    this.connEvents.emit("connect");
    this.emit("cmd_end");
    this.emit("end");
  }

  defaultAuthSwitchHandler() {
    return (connEvents, pluginName, packSeq, pluginData, info, opts, out, callback) => {
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
          let err = Utils.createError(
            "Client does not support authentication protocol '" +
              pluginName +
              "' requested by server. ",
            true,
            info,
            1251,
            "08004"
          );
          connEvents.emit("error", err);
          return null;
      }
      pluginAuth.apply(null, [packSeq, pluginData, callback]);
      pluginAuth.init(out, opts, info);
      return pluginAuth;
    };
  }
}

module.exports = Handshake;
