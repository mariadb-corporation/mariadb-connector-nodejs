const net = require('net');

function Proxy(args) {
  let localPort = -1;
  const REMOTE_PORT = args.port;
  const REMOTE_ADDR = args.host;
  let log = args.log || false;
  let server;
  let remoteSocket;
  let stop = false;

  this.close = () => {
    if (server) server.close();
  };

  this.port = () => {
    return localPort;
  };

  this.stop = () => {
    return new Promise(function (resolver, rejecter) {
      server.close(() => {
        stop = true;
        resolver();
      });
    });
  };

  this.suspendRemote = () => {
    server.emit('suspendRemote');
  };

  this.resumeRemote = () => {
    server.emit('resumeRemote');
  };

  this.resume = () => {
    stop = false;
    try {
      server.listen(localPort);
    } catch (e) {
      if (e.code !== 'ERR_SERVER_ALREADY_LISTEN') {
        throw e;
      }
    }
  };

  this.start = () => {
    const sockets = [];
    const remoteSockets = [];
    let stopRemote = false;

    server = net.createServer({}, (socket) => {
      let ended = false;
      sockets.push(socket);
      if (stop) {
        process.nextTick(socket.destroy.bind(socket));
      } else {
        if (log) console.log('  ** START **');
        remoteSocket = new net.Socket();
        remoteSocket.connect(REMOTE_PORT, REMOTE_ADDR, function () {});
        remoteSockets.push(remoteSocket);
        if (stopRemote) remoteSocket.pause();

        remoteSocket.on('data', function (data) {
          if (log) console.log('<< ', data.toString());
          socket.write(data);
        });

        remoteSocket.on('end', function () {
          if (log) console.log('<< remote end (' + ended + ')');
          if (!ended) socket.end();
          ended = true;
        });

        remoteSocket.on('error', function (err) {
          if (log) console.log('<< remote error (' + ended + ')');
          if (!ended) socket.destroy(err);
          ended = true;
        });

        socket.on('error', function (err) {
          if (log) console.log('>> socket error (' + ended + ')');
          if (!ended) remoteSocket.destroy(err);
          ended = true;
        });

        socket.on('data', function (msg) {
          if (!stop) {
            remoteSocket.write(msg);
            if (log) console.log('>> ', msg.toString());
          }
        });

        socket.on('end', () => {
          if (log) console.log('>> localsocket end (' + ended + ')');
          if (!ended) remoteSocket.end();
          ended = true;
        });
      }
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log('Address in use, retrying...');
        setTimeout(() => {
          server.close();
          server.listen();
          localPort = server.address().port;
        }, 1000);
      } else {
        if (log) console.log('proxy server error : ' + err);
        throw err;
      }
    });

    server.on('close', () => {
      if (log) console.log('closing proxy server');
      sockets.forEach((socket) => {
        socket.destroy();
      });
      sockets.length = 0;
    });

    server.on('suspendRemote', () => {
      if (log) console.log('suspend proxy server');
      remoteSockets.forEach((socket) => {
        if (socket) socket.pause();
      });
      stopRemote = true;
    });

    server.on('resumeRemote', () => {
      if (log) console.log('resume proxy server');
      remoteSockets.forEach((socket) => {
        if (socket) socket.resume();
      });
      stopRemote = false;
    });

    server.listen();

    localPort = server.address().port;

    if (log) console.log('TCP server accepting connection on port: ' + localPort);
  };

  this.start();
}

module.exports = Proxy;
