'use strict';

/**
 * Script that permit to read server source error code to generate error-codes.js file.
 * change <i> version </i> to indicate mariadb source files.
 */

const https = require('https');
const fs = require('fs');
const readline = require('readline');
const os = require('os');
const path = require('path');

const version = '10.5';
const extendedUrl = 'https://raw.githubusercontent.com/MariaDB/server/' + version + '/sql/share/errmsg-utf8.txt';
const baseUrl = 'https://raw.githubusercontent.com/MariaDB/server/' + version + '/include/my_base.h';
const fileName = path.join(os.tmpdir(), 'mariadb_errmsg.txt');
const fileNameBase = path.join(os.tmpdir(), 'my_base.h');
const destFileName = path.join(__dirname, '/../lib/const/error-code.js');

const download = function (url, dest, cb) {
  const file = fs.createWriteStream(dest);
  https
    .get(url, function (response) {
      response.pipe(file);
      file.on('finish', function () {
        file.close(cb);
      });
    })
    .on('error', function (err) {
      // Handle errors
      fs.unlink(dest);
      if (cb) cb(err.message);
    });
};

let counter = 1;
let pause = true;
const maria_errors = [];

const writeFile = function () {
  fs.unlink(destFileName, (err) => {});
  const writer = fs.createWriteStream(destFileName);

  const header =
    '"use strict";\n\n' +
    '/**\n' +
    ' * File generated using test/tools/generate-mariadb.js\n' +
    ' * from MariaDB ' +
    version +
    '\n' +
    ' *\n' +
    ' * !!!!!! DO NOT CHANGE MANUALLY !!!!!!\n' +
    ' */\n\n' +
    'let codes = {};\n';
  writer.write(header);

  for (let i = 0; i < maria_errors.length; i++) {
    if (maria_errors[i]) writer.write('codes[' + i + "] = '" + maria_errors[i] + "';\n");
  }
  writer.end('\nmodule.exports.codes = codes;\n');
  console.log('finished');
};

const parseExtended = function (err) {
  if (err) return console.log(err);
  const lineReader = readline.createInterface({
    input: fs.createReadStream(fileName)
  });

  lineReader.on('line', function (line) {
    if (line.length > 0) {
      let car;
      switch ((car = line.charAt(0))) {
        case '#':
        case ' ':
          return;
        default:
          if (car.match(/[a-zA-Z]/i)) {
            if (line.includes('start-error-number')) {
              counter = Number.parseInt(line.substr(19).trim());
              pause = false;
            } else if (line.includes('skip-to-error-number')) {
              counter = Number.parseInt(line.substr(21).trim());
            } else if (!pause) {
              const words = line.split(' ');
              maria_errors[counter++] = words[0];
            }
          }
      }
    }
  });

  lineReader.on('close', function () {
    pause = true;
    download(baseUrl, fileNameBase, parseBase);
  });
};

const parseBase = function (err) {
  if (err) return console.log(err);
  const lineReader = readline.createInterface({
    input: fs.createReadStream(fileNameBase)
  });

  const re = /(^(#define\s)([A-Z_]+)(\s|\t)+([0-9]+))/i;
  lineReader.on('line', function (line) {
    if (line.length > 0) {
      if (line.includes('#define HA_ERR_FIRST')) {
        pause = false;
      } else if (line.includes('#define HA_ERR_LAST')) {
        pause = true;
      } else if (!pause) {
        const reg = line.match(re);
        if (reg) {
          maria_errors[reg[5]] = reg[3];
        }
      }
    }
  });

  lineReader.on('close', function () {
    writeFile();
  });
};

download(extendedUrl, fileName, parseExtended);
