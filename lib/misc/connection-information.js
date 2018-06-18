"use strict";

class ConnectionInformation {
  constructor() {
    this.threadId = -1;
    this.status = null;
    this.serverVersion = null;
  }

  getServerVersion() {
    if (!this.serverVersion)
      throw new Error("cannot know if server information until connection is established");
    return this.serverVersion.raw;
  }

  isMariaDB() {
    if (!this.serverVersion)
      throw new Error("cannot know if server is MariaDB until connection is established");
    return this.serverVersion.mariaDb;
  }

  hasMinVersion(major, minor, patch) {
    if (!this.serverVersion)
      throw new Error("cannot know if server version until connection is established");

    if (!major) throw new Error("a major version must be set");

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
