const net = require("net");

function Proxy(args) {
  const LOCAL_PORT = args.proxyPort || 6512;
  const REMOTE_PORT = args.port;
  const REMOTE_ADDR = args.host;
  const log = false;
  let server;
  let stop = false;

  this.close = () => {
    if (server) server.close();
  };

  this.stop = () => {
    server.close();
    stop = true;
  };

  this.resume = () => {
    stop = false;
    server.listen(LOCAL_PORT);
  };

  this.start = () => {
    const sockets = [];
    server = net.createServer(socket => {
      let ended = false;
      sockets.push(socket);
      if (stop) {
        process.nextTick(socket.destroy.bind(socket));
      } else {
        if (log) console.log("  ** START **");
        const remoteSocket = new net.Socket();
        remoteSocket.connect(REMOTE_PORT, REMOTE_ADDR, function() {});

        remoteSocket.on("data", function(data) {
          if (log) console.log("<< ", data.toString());
          socket.write(data);
        });

        remoteSocket.on("end", function() {
          if (log) console.log("<< remote end (" + ended + ")");
          if (!ended) socket.end();
          ended = true;
        });

        remoteSocket.on("error", function(err) {
          if (log) console.log("<< remote error (" + ended + ")");
          if (!ended) socket.destroy(err);
          ended = true;
        });

        socket.on("error", function(err) {
          if (log) console.log(">> socket error (" + ended + ")");
          if (!ended) remoteSocket.destroy(err);
          ended = true;
        });

        socket.on("data", function(msg) {
          if (!stop) {
            remoteSocket.write(msg);
            if (log) console.log(">> ", msg.toString());
          }
        });

        socket.on("end", () => {
          if (log) console.log(">> localsocket end (" + ended + ")");
          if (!ended) remoteSocket.end();
          ended = true;
        });
      }
    });
    server.on("error", err => {
      if (log) console.log("proxy server error : " + err);
      throw err;
    });
    server.on("close", () => {
      if (log) console.log("closing proxy server");
      sockets.forEach(socket => {
        if (socket) socket.end();
      });
    });
    server.listen(LOCAL_PORT);
    if (log) console.log("TCP server accepting connection on port: " + LOCAL_PORT);
  };

  this.start();
}

module.exports = Proxy;
