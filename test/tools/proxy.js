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
    return new Promise(function (resolver, rejecter) {
      server.close(() => {
        resolver();
      });
    });
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
    return new Promise(function (resolver, rejecter) {
      try {
        server.listen(localPort, resolver);
      } catch (e) {
        if (e.code !== 'ERR_SERVER_ALREADY_LISTEN') {
          rejecter(e);
        }
      }
    });
  };

  this.start = () => {
    const sockets = [];
    const remoteSockets = [];
    let stopRemote = false;
    let to;
    return new Promise(function (resolver, rejecter) {
      server = net.createServer({ noDelay: true }, (from) => {
        let ended = false;
        to = net.createConnection({
          host: REMOTE_ADDR,
          port: REMOTE_PORT
        });
        from.pipe(to);
        to.pipe(from);

        to.on('end', function () {
          if (log) console.log('<< remote end (' + ended + ')');
          if (!ended) from.end();
          ended = true;
        });

        from.on('end', () => {
          if (log) console.log('>> localsocket end (' + ended + ':' + from.address().port + ')');
          if (!ended) to.end();
          ended = true;
        });
      });

      server.on('connection', (sock) => {
        console.log('new Connection : ' + sock.address().port);
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
        to.forEach((socket) => {
          if (socket) socket.pause();
        });
        stopRemote = true;
      });

      server.on('resumeRemote', () => {
        if (log) console.log('resume proxy server');
        to.forEach((socket) => {
          if (socket) socket.resume();
        });
        stopRemote = false;
      });

      server.listen(() => {
        localPort = server.address().port;
        if (log) console.log('TCP server accepting connection on port: ' + localPort);
        resolver();
      });
    });
  };
}

module.exports = Proxy;
