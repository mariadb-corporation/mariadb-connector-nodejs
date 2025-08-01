//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

// noinspection JSBitwiseOperatorUsage

'use strict';

import Iconv from 'iconv-lite';
import * as Capabilities from '../const/capabilities.js';
import Ed25519PasswordAuth from './handshake/auth/ed25519-password-auth.js';
import NativePasswordAuth from './handshake/auth/native-password-auth.js';
import Collations from '../const/collations.js';
import Authentication from './handshake/authentication.js';
import packageJson from '../../package.json' with { type: 'json' };

/**
 * send a COM_CHANGE_USER: resets the connection and re-authenticates with the given credentials
 * see https://mariadb.com/kb/en/library/com_change_user/
 */
class ChangeUser extends Authentication {
  constructor(cmdParam, connOpts, resolve, reject, getSocket) {
    super(cmdParam, resolve, reject, () => {}, getSocket);
    this.configAssign(connOpts, cmdParam.opts);
  }

  start(out, opts, info) {
    if (opts.logger.query) opts.logger.query(`CHANGE USER to '${this.opts.user || ''}'`);
    let authToken;
    const pwd = Array.isArray(this.opts.password) ? this.opts.password[0] : this.opts.password;
    switch (info.defaultPluginName) {
      case 'mysql_native_password':
      case '':
        authToken = NativePasswordAuth.encryptSha1Password(pwd, info.seed);
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
    // handle default collation.
    if (this.opts.collation) {
      // collation has been set using charset.
      // If server use same charset, use server collation.
      if (!this.opts.charset || info.collation.charset !== this.opts.collation.charset) {
        info.collation = this.opts.collation;
      }
    } else {
      // if not utf8mb4 and no configuration, force to use UTF8MB4_UNICODE_CI
      if (info.collation.charset !== 'utf8' || info.collation.maxLength === 3) {
        info.collation = Collations.fromIndex(224);
      }
    }
    out.writeInt16(info.collation.index);

    if (info.clientCapabilities & Capabilities.PLUGIN_AUTH) {
      out.writeString(info.defaultPluginName);
      out.writeInt8(0);
    }

    if (info.clientCapabilities & Capabilities.CONNECT_ATTRS) {
      out.writeInt8(0xfc);
      let initPos = out.pos; //save position, assuming connection attributes length will be less than 2 bytes length
      out.writeInt16(0);

      const encoding = info.collation.charset;

      writeAttribute(out, '_client_name', encoding);
      writeAttribute(out, 'MariaDB connector/Node', encoding);

      writeAttribute(out, '_client_version', encoding);
      writeAttribute(out, packageJson.version, encoding);

      writeAttribute(out, '_node_version', encoding);
      writeAttribute(out, process.versions.node, encoding);

      if (opts.connectAttributes !== true) {
        let attrNames = Object.keys(this.opts.connectAttributes);
        for (let k = 0; k < attrNames.length; ++k) {
          writeAttribute(out, attrNames[k], encoding);
          writeAttribute(out, this.opts.connectAttributes[attrNames[k]], encoding);
        }
      }

      //write end size
      out.writeInt16AtPos(initPos);
    }

    out.flush();
    this.plugin.onPacketReceive = this.handshakeResult.bind(this);
  }

  /**
   * Assign global configuration option used by result-set to current query option.
   * a little faster than Object.assign() since doest copy all information
   *
   * @param connOpts  connection global configuration
   * @param cmdOpts   current options
   */
  configAssign(connOpts, cmdOpts) {
    if (!cmdOpts) {
      this.opts = connOpts;
      return;
    }
    this.opts = cmdOpts ? Object.assign({}, connOpts, cmdOpts) : connOpts;

    if (cmdOpts.charset && typeof cmdOpts.charset === 'string') {
      this.opts.collation = Collations.fromCharset(cmdOpts.charset.toLowerCase());
      if (this.opts.collation === undefined) {
        this.opts.collation = Collations.fromName(cmdOpts.charset.toUpperCase());
        if (this.opts.collation !== undefined) {
          this.opts.logger.warning(
            "warning: please use option 'collation' " +
              "in replacement of 'charset' when using a collation name ('" +
              cmdOpts.charset +
              "')\n" +
              "(collation looks like 'UTF8MB4_UNICODE_CI', charset like 'utf8')."
          );
        }
      }
      if (this.opts.collation === undefined) throw new RangeError("Unknown charset '" + cmdOpts.charset + "'");
    } else if (cmdOpts.collation && typeof cmdOpts.collation === 'string') {
      const initial = cmdOpts.collation;
      this.opts.collation = Collations.fromName(initial.toUpperCase());
      if (this.opts.collation === undefined) throw new RangeError("Unknown collation '" + initial + "'");
    } else {
      this.opts.collation = Collations.fromIndex(cmdOpts.charsetNumber) || connOpts.collation;
    }
    connOpts.password = cmdOpts.password;
  }
}

function writeAttribute(out, val, encoding) {
  let param = Buffer.isEncoding(encoding) ? Buffer.from(val, encoding) : Iconv.encode(val, encoding);
  out.writeLengthCoded(param.length);
  out.writeBuffer(param, 0, param.length);
}

export default ChangeUser;
