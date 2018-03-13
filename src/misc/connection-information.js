"use strict";

class ConnectionInformation {
  constructor() {
    this.threadId = -1;
    this.status = null;
  }

  serverVersion() {
    if (!this.serverVersion)
      throw "cannot know if server information until connection is established";
    return this.serverVersion;
  }

  isMariaDB() {
    if (!this.serverVersion)
      throw "cannot know if server is MariaDB until connection is established";
    return this.serverVersion.mariaDb;
  }

  hasMinVersion(major, minor, patch) {
    if (!this.serverVersion) throw "cannot know if server version until connection is established";

    if (!major) major = 0;
    if (!minor) minor = 0;
    if (!patch) patch = 0;

    let ver = this.serverVersion;
    return (
      ver.major > major ||
      (ver.major === major && ver.minor > minor) ||
      (ver.major === major && ver.minor === minor && ver.patch >= patch)
    );
  }
}

module.exports = ConnectionInformation;
