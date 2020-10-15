'use strict';

const Iconv = require('iconv-lite');
const Capabilities = require('../const/capabilities');
const Ed25519PasswordAuth = require('./handshake/auth/ed25519-password-auth');
const NativePasswordAuth = require('./handshake/auth/native-password-auth');
const Collations = require('../const/collations');
const Handshake = require('./handshake/handshake');

/**
 * send a COM_CHANGE_USER: resets the connection and re-authenticates with the given credentials
 * see https://mariadb.com/kb/en/library/com_change_user/
 */
class ChangeUser extends Handshake {
  constructor(options, resolve, reject, addCommand) {
    super(resolve, reject, () => {}, addCommand);
    this.opts = options;
  }

  start(out, opts, info) {
    this.configAssign(opts, this.opts);
    let authToken;
    const pwd = Array.isArray(this.opts.password) ? this.opts.password[0] : this.opts.password;
    switch (info.defaultPluginName) {
      case 'mysql_native_password':
      case '':
        authToken = NativePasswordAuth.encryptPassword(pwd, info.seed, 'sha1');
        break;
      case 'client_ed25519':
        authToken = Ed25519PasswordAuth.encryptPassword(pwd, info.seed);
        break;
      default:
        authToken = Buffer.alloc(0);
        break;
    }

    out.startPacket(this);
    out.writeInt8(0x11);
    out.writeString(this.opts.user || '');
    out.writeInt8(0);

    if (info.serverCapabilities & Capabilities.SECURE_CONNECTION) {
      out.writeInt8(authToken.length);
      out.writeBuffer(authToken, 0, authToken.length);
    } else {
      out.writeBuffer(authToken, 0, authToken.length);
      out.writeInt8(0);
    }

    if (info.clientCapabilities & Capabilities.CONNECT_WITH_DB) {
      out.writeString(this.opts.database);
      out.writeInt8(0);
      info.database = this.opts.database;
    }

    out.writeInt16(this.opts.collation.index);

    if (info.clientCapabilities & Capabilities.PLUGIN_AUTH) {
      out.writeString(info.defaultPluginName);
      out.writeInt8(0);
    }

    if (this.opts.connectAttributes && info.serverCapabilities & Capabilities.CONNECT_ATTRS) {
      out.writeInt8(0xfc);
      let initPos = out.pos; //save position, assuming connection attributes length will be less than 2 bytes length
      out.writeInt16(0);

      const encoding = this.opts.collation.charset;

      writeParam(out, '_client_name', encoding);
      writeParam(out, 'MariaDB connector/Node', encoding);

      let packageJson = require('../../package.json');
      writeParam(out, '_client_version', encoding);
      writeParam(out, packageJson.version, encoding);

      writeParam(out, '_node_version', encoding);
      writeParam(out, process.versions.node, encoding);

      if (opts.connectAttributes !== true) {
        let attrNames = Object.keys(this.opts.connectAttributes);
        for (let k = 0; k < attrNames.length; ++k) {
          writeParam(out, attrNames[k], encoding);
          writeParam(out, this.opts.connectAttributes[attrNames[k]], encoding);
        }
      }

      //write end size
      out.writeInt16AtPos(initPos);
    }

    out.flushBuffer(true);
    this.onPacketReceive = this.handshakeResult;
  }

  /**
   * Assign global configuration option used by result-set to current query option.
   * a little faster than Object.assign() since doest copy all information
   *
   * @param connOpts  connection global configuration
   * @param opt       current options
   */
  configAssign(connOpts, opt) {
    if (!opt) {
      this.opts = connOpts;
      return;
    }
    this.opts.database = opt.database ? opt.database : connOpts.database;
    this.opts.connectAttributes = opt.connectAttributes
      ? opt.connectAttributes
      : connOpts.connectAttributes;

    if (opt.charset && typeof opt.charset === 'string') {
      this.opts.collation = Collations.fromCharset(opt.charset.toLowerCase());
      if (this.opts.collation === undefined) {
        this.opts.collation = Collations.fromName(opt.charset.toUpperCase());
        if (this.opts.collation !== undefined) {
          console.log(
            "warning: please use option 'collation' " +
              "in replacement of 'charset' when using a collation name ('" +
              opt.charset +
              "')\n" +
              "(collation looks like 'UTF8MB4_UNICODE_CI', charset like 'utf8')."
          );
        }
      }
      if (this.opts.collation === undefined)
        throw new RangeError("Unknown charset '" + opt.charset + "'");
    } else if (opt.collation && typeof opt.collation === 'string') {
      const initial = opt.collation;
      this.opts.collation = Collations.fromName(initial.toUpperCase());
      if (this.opts.collation === undefined)
        throw new RangeError("Unknown collation '" + initial + "'");
    } else {
      this.opts.collation = Collations.fromIndex(opt.charsetNumber) || connOpts.collation;
    }
    connOpts.password = opt.password;
  }
}

function writeParam(out, val, encoding) {
  let param = Buffer.isEncoding(encoding)
    ? Buffer.from(val, encoding)
    : Iconv.encode(val, encoding);
  out.writeLengthCoded(param.length);
  out.writeBuffer(param, 0, param.length);
}

module.exports = ChangeUser;
