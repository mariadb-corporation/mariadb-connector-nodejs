'use strict';

const Capabilities = require('../../const/capabilities');
const Iconv = require('iconv-lite');
const NativePasswordAuth = require('./auth/native-password-auth');
const Ed25519PasswordAuth = require('./auth/ed25519-password-auth');
const driverVersion = require('../../../package.json').version;
const os = require('os');

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
module.exports.send = function send(cmd, out, opts, pluginName, info) {
  out.startPacket(cmd);
  info.defaultPluginName = pluginName;
  const pwd = Array.isArray(opts.password) ? opts.password[0] : opts.password;
  let authToken;
  let authPlugin;
  switch (pluginName) {
    case 'client_ed25519':
      authToken = Ed25519PasswordAuth.encryptPassword(pwd, info.seed);
      authPlugin = 'client_ed25519';
      break;

    case 'mysql_clear_password':
      authToken = Buffer.from(pwd);
      authPlugin = 'mysql_clear_password';
      break;

    default:
      authToken = NativePasswordAuth.encryptPassword(pwd, info.seed, 'sha1');
      authPlugin = 'mysql_native_password';
      break;
  }
  out.writeInt32(Number(info.clientCapabilities & BigInt(0xffffffff)));
  out.writeInt32(1024 * 1024 * 1024); // max packet size
  out.writeInt8(info.collation.index);

  for (let i = 0; i < 19; i++) {
    out.writeInt8(0);
  }

  out.writeInt32(Number(info.clientCapabilities >> BigInt(32)));

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
    const encoding = info.collation.charset;

    writeParam(out, '_client_name', encoding);
    writeParam(out, 'MariaDB connector/Node', encoding);

    writeParam(out, '_client_version', encoding);
    writeParam(out, driverVersion, encoding);

    const address = cmd.getSocket().address().address;
    if (address) {
      writeParam(out, '_server_host', encoding);
      writeParam(out, address, encoding);
    }

    writeParam(out, '_os', encoding);
    writeParam(out, process.platform, encoding);

    writeParam(out, '_client_host', encoding);
    writeParam(out, os.hostname(), encoding);

    writeParam(out, '_node_version', encoding);
    writeParam(out, process.versions.node, encoding);

    if (opts.connectAttributes !== true) {
      let attrNames = Object.keys(opts.connectAttributes);
      for (let k = 0; k < attrNames.length; ++k) {
        writeParam(out, attrNames[k], encoding);
        writeParam(out, opts.connectAttributes[attrNames[k]], encoding);
      }
    }

    //write end size
    out.writeInt16AtPos(initPos);
  }

  out.flushPacket();
};

function writeParam(out, val, encoding) {
  let param = Buffer.isEncoding(encoding) ? Buffer.from(val, encoding) : Iconv.encode(val, encoding);
  out.writeLengthCoded(param.length);
  out.writeBuffer(param, 0, param.length);
}
