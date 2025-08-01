//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2025 MariaDB Corporation Ab

import net from 'node:net';

function Proxy(args) {
  const REMOTE_PORT = args.port;
  const REMOTE_ADDR = args.host;
  const sockets = [];
  const remoteSockets = [];

  let localPort = -1;
  let log = args.log || false;
  let server;
  let stop = false;
  let stopRemote = false;

  this.close = () => {
    server.close();
    sockets.forEach((socket) => {
      socket.destroy(new Error('proxy destroyed socket'));
    });
    sockets.length = 0;

    remoteSockets.forEach((socket) => {
      socket.end();
    });
    remoteSockets.length = 0;

    stop = true;
  };

  this.port = () => {
    return localPort;
  };

  this.stop = () => {
    stop = true;
  };

  this.suspendRemote = () => {
    server.emit('suspendRemote');
  };

  this.resumeRemote = () => {
    server.emit('resumeRemote');
  };

  this.resume = () => {
    stop = false;
    return new Promise(function (resolve, reject) {
      try {
        server.listen(localPort, resolve);
      } catch (e) {
        if (e.code !== 'ERR_SERVER_ALREADY_LISTEN') {
          reject(e);
        }
      }
    });
  };

  this.start = () => {
    return new Promise(function (resolve, reject) {
      server = net.createServer({ noDelay: true }, (from) => {
        sockets.push(from);
        let ended = false;
        let to = net.createConnection({
          host: REMOTE_ADDR,
          port: REMOTE_PORT
        });
        remoteSockets.push(to);
        if (stopRemote) to.pause();

        from.on('data', function (msg) {
          if (!stop) {
            to.write(msg);
            if (log) console.log('>> ', msg.toString());
          }
        });

        to.on('data', function (msg) {
          if (!stop) {
            from.write(msg);
            if (log) console.log('<< ', msg.toString());
          }
        });

        to.on('connect', () => {
          if (stopRemote) to.pause();
        });

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

        from.on('error', (err) => {
          if (log) console.log(err);
        });
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

      server.on('suspendRemote', () => {
        if (log) console.log('suspend proxy server');
        remoteSockets.forEach((socket) => socket.pause());
        stopRemote = true;
      });

      server.on('resumeRemote', () => {
        if (log) console.log('resume proxy server');
        remoteSockets.forEach((socket) => socket.resume());
        stopRemote = false;
      });

      server.listen(() => {
        localPort = server.address().port;
        if (log) console.log('TCP server accepting connection on port: ' + localPort);
        resolve();
      });
    });
  };
}

export default Proxy;
