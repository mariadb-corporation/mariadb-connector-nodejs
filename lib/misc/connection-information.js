//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

class ConnectionInformation {
  #redirectFct;
  constructor(opts, redirectFct) {
    this.threadId = -1;
    this.status = null;
    this.serverVersion = null;
    this.serverCapabilities = null;
    this.database = opts.database;
    this.port = opts.port;
    this.#redirectFct = redirectFct;
    this.redirectRequest = null;
  }

  hasMinVersion(major, minor, patch) {
    if (!this.serverVersion) throw new Error('cannot know if server version until connection is established');

    if (!major) throw new Error('a major version must be set');

    if (!minor) minor = 0;
    if (!patch) patch = 0;

    let ver = this.serverVersion;
    return (
      ver.major > major ||
      (ver.major === major && ver.minor > minor) ||
      (ver.major === major && ver.minor === minor && ver.patch >= patch)
    );
  }

  redirect(value, resolve) {
    return this.#redirectFct(value, resolve);
  }

  isMariaDB() {
    if (!this.serverVersion) throw new Error('cannot know if server is MariaDB until connection is established');
    return this.serverVersion.mariaDb;
  }

  /**
   * Parse raw info to set server major/minor/patch values
   * @param info
   */
  static parseVersionString(info) {
    let car;
    let offset = 0;
    let type = 0;
    let val = 0;

    for (; offset < info.serverVersion.raw.length; offset++) {
      car = info.serverVersion.raw.charCodeAt(offset);
      if (car < 48 || car > 57) {
        switch (type) {
          case 0:
            info.serverVersion.major = val;
            break;
          case 1:
            info.serverVersion.minor = val;
            break;
          case 2:
            info.serverVersion.patch = val;
            return;
        }
        type++;
        val = 0;
      } else {
        val = val * 10 + car - 48;
      }
    }
    //serverVersion finished by number like "5.5.57", assign patchVersion
    if (type === 2) info.serverVersion.patch = val;
  }
}

module.exports = ConnectionInformation;
