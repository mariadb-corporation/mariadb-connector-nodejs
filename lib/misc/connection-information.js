"use strict";
const Queue = require("denque");

const _addPacket = function(msg) {
  this.lastPackets.push(msg);
  while (this.lastPackets.size() > 32) this.lastPackets.shift();
};

const _getLastPackets = function() {
  let output = "";
  let packet;
  while ((packet = this.lastPackets.shift())) {
    output += "\n" + packet;
  }
  return output;
};

class ConnectionInformation {
  constructor() {
    this.threadId = -1;
    this.status = null;
    this.serverVersion = null;
    this.serverCapabilities = -1;
  }

  addPacket(msg) {}

  getLastPackets() {
    return "";
  }

  enableLogPacket() {
    this.lastPackets = new Queue();
    this.addPacket = _addPacket.bind(this);
    this.getLastPackets = _getLastPackets.bind(this);
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

  isMariaDB() {
    if (!this.serverVersion)
      throw new Error("cannot know if server is MariaDB until connection is established");
    return this.serverVersion.mariaDb;
  }
}

module.exports = ConnectionInformation;
