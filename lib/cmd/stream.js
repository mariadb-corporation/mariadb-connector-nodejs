"use strict";

const Query = require("./query");
const { Readable } = require("stream");

/**
 * Protocol COM_QUERY with streaming events.
 * see : https://mariadb.com/kb/en/library/com_query/
 */
class Stream extends Query {
  constructor(cmdOpts, connOpts, sql, values, socket) {
    super(() => {}, () => {}, cmdOpts, connOpts, sql, values);
    this.socket = socket;
    this.inStream = new Readable({
      objectMode: true,
      read: () => {
        socket.resume();
      }
    });

    this.on("fields", function(meta) {
      this.inStream.emit("fields", meta);
    });

    this.on("end", function(err) {
      if (err) this.inStream.emit("error", err);
      this.inStream.push(null);
    });
  }

  handleNewRows(row) {
    if (!this.inStream.push(row)) {
      this.socket.pause();
    }
  }
}

module.exports = Stream;
