const Errors = require('../misc/errors');

const State = {
  Normal: 1 /* inside  query */,
  String: 2 /* inside string */,
  SlashStarComment: 3 /* inside slash-star comment */,
  Escape: 4 /* found backslash */,
  EOLComment: 5 /* # comment, or // comment, or -- comment */,
  Backtick: 6 /* found backtick */,
  Placeholder: 7 /* found placeholder */
};

/**
 * Split query according to parameters (question mark).
 * Question mark in comment are not taken in account
 *
 * @returns {Array} query separated by parameters
 */
module.exports.splitQuery = function (sql) {
  let partList = [];
  let state = State.Normal;
  let lastChar = '\0';
  let singleQuotes = false;
  let lastParameterPosition = 0;
  let idx = 0;
  let car = sql.charAt(idx++);

  while (car !== '') {
    if (state === State.Escape && !((car === "'" && singleQuotes) || (car === '"' && !singleQuotes))) {
      state = State.String;
      car = sql.charAt(idx++);
      continue;
    }

    switch (car) {
      case '*':
        if (state === State.Normal && lastChar === '/') state = State.SlashStarComment;
        break;

      case '/':
        if (state === State.SlashStarComment && lastChar === '*') state = State.Normal;
        break;

      case '#':
        if (state === State.Normal) state = State.EOLComment;
        break;

      case '-':
        if (state === State.Normal && lastChar === '-') {
          state = State.EOLComment;
        }
        break;

      case '\n':
        if (state === State.EOLComment) {
          state = State.Normal;
        }
        break;

      case '"':
        if (state === State.Normal) {
          state = State.String;
          singleQuotes = false;
        } else if (state === State.String && !singleQuotes) {
          state = State.Normal;
        } else if (state === State.Escape && !singleQuotes) {
          state = State.String;
        }
        break;

      case "'":
        if (state === State.Normal) {
          state = State.String;
          singleQuotes = true;
        } else if (state === State.String && singleQuotes) {
          state = State.Normal;
        } else if (state === State.Escape && singleQuotes) {
          state = State.String;
        }
        break;

      case '\\':
        if (state === State.String) state = State.Escape;
        break;

      case '?':
        if (state === State.Normal) {
          partList.push(sql.substring(lastParameterPosition, idx - 1));
          lastParameterPosition = idx;
        }
        break;
      case '`':
        if (state === State.Backtick) {
          state = State.Normal;
        } else if (state === State.Normal) {
          state = State.Backtick;
        }
        break;
    }
    lastChar = car;

    car = sql.charAt(idx++);
  }
  if (lastParameterPosition === 0) {
    partList.push(sql);
  } else {
    partList.push(sql.substring(lastParameterPosition));
  }

  return partList;
};

/**
 * Split query according to parameters using placeholder.
 *
 * @param sql             sql with placeholders
 * @param info            connection information
 * @param initialValues   placeholder object
 * @param displaySql      display sql function
 * @returns {{parts: Array, values: Array}}
 */
module.exports.splitQueryPlaceholder = function (sql, info, initialValues, displaySql) {
  let partList = [];
  let values = [];
  let state = State.Normal;
  let lastChar = '\0';

  let singleQuotes = false;
  let lastParameterPosition = 0;

  let idx = 0;
  let car = sql.charAt(idx++);
  let placeholderName;

  while (car !== '') {
    if (state === State.Escape && !((car === "'" && singleQuotes) || (car === '"' && !singleQuotes))) {
      state = State.String;
      car = sql.charAt(idx++);
      continue;
    }

    switch (car) {
      case '*':
        if (state === State.Normal && lastChar === '/') state = State.SlashStarComment;
        break;

      case '/':
        if (state === State.SlashStarComment && lastChar === '*') state = State.Normal;
        break;

      case '#':
        if (state === State.Normal) state = State.EOLComment;
        break;

      case '-':
        if (state === State.Normal && lastChar === '-') {
          state = State.EOLComment;
        }
        break;

      case '\n':
        if (state === State.EOLComment) {
          state = State.Normal;
        }
        break;

      case '"':
        if (state === State.Normal) {
          state = State.String;
          singleQuotes = false;
        } else if (state === State.String && !singleQuotes) {
          state = State.Normal;
        } else if (state === State.Escape && !singleQuotes) {
          state = State.String;
        }
        break;

      case "'":
        if (state === State.Normal) {
          state = State.String;
          singleQuotes = true;
        } else if (state === State.String && singleQuotes) {
          state = State.Normal;
          singleQuotes = false;
        } else if (state === State.Escape && singleQuotes) {
          state = State.String;
        }
        break;

      case '\\':
        if (state === State.String) state = State.Escape;
        break;

      case ':':
        if (state === State.Normal) {
          partList.push(sql.substring(lastParameterPosition, idx - 1));
          placeholderName = '';
          while (
            ((car = sql.charAt(idx++)) !== '' && car >= '0' && car <= '9') ||
            (car >= 'A' && car <= 'Z') ||
            (car >= 'a' && car <= 'z') ||
            car === '-' ||
            car === '_'
          ) {
            placeholderName += car;
          }
          idx--;
          const val = initialValues[placeholderName];
          if (val === undefined) {
            throw Errors.createError(
              `Placeholder '${placeholderName}' is not defined`,
              Errors.ER_PLACEHOLDER_UNDEFINED,
              info,
              'HY000',
              displaySql.call()
            );
          }
          values.push(val);
          lastParameterPosition = idx;
        }
        break;
      case '`':
        if (state === State.Backtick) {
          state = State.Normal;
        } else if (state === State.Normal) {
          state = State.Backtick;
        }
    }
    lastChar = car;

    car = sql.charAt(idx++);
  }
  if (lastParameterPosition === 0) {
    partList.push(sql);
  } else {
    partList.push(sql.substring(lastParameterPosition));
  }

  return { parts: partList, values: values };
};

module.exports.searchPlaceholder = function (sql) {
  let sqlPlaceHolder = '';
  let placeHolderIndex = [];
  let state = State.Normal;
  let lastChar = '\0';

  let singleQuotes = false;
  let lastParameterPosition = 0;

  let idx = 0;
  let car = sql.charAt(idx++);
  let placeholderName;

  while (car !== '') {
    if (state === State.Escape && !((car === "'" && singleQuotes) || (car === '"' && !singleQuotes))) {
      state = State.String;
      lastChar = car;
      car = sql.charAt(idx++);
      continue;
    }

    switch (car) {
      case '*':
        if (state === State.Normal && lastChar == '/') state = State.SlashStarComment;
        break;

      case '/':
        if (state === State.SlashStarComment && lastChar == '*') state = State.Normal;
        break;

      case '#':
        if (state === State.Normal) state = State.EOLComment;
        break;

      case '-':
        if (state === State.Normal && lastChar == '-') {
          state = State.EOLComment;
        }
        break;

      case '\n':
        if (state === State.EOLComment) {
          state = State.Normal;
        }
        break;

      case '"':
        if (state === State.Normal) {
          state = State.String;
          singleQuotes = false;
        } else if (state === State.String && !singleQuotes) {
          state = State.Normal;
        } else if (state === State.Escape && !singleQuotes) {
          state = State.String;
        }
        break;

      case "'":
        if (state === State.Normal) {
          state = State.String;
          singleQuotes = true;
        } else if (state === State.String && singleQuotes) {
          state = State.Normal;
          singleQuotes = false;
        } else if (state === State.Escape && singleQuotes) {
          state = State.String;
        }
        break;

      case '\\':
        if (state === State.String) state = State.Escape;
        break;

      case ':':
        if (state === State.Normal) {
          sqlPlaceHolder += sql.substring(lastParameterPosition, idx - 1) + '?';
          placeholderName = '';
          while (
            ((car = sql.charAt(idx++)) !== '' && car >= '0' && car <= '9') ||
            (car >= 'A' && car <= 'Z') ||
            (car >= 'a' && car <= 'z') ||
            car === '-' ||
            car === '_'
          ) {
            placeholderName += car;
          }
          idx--;
          placeHolderIndex.push(placeholderName);
          lastParameterPosition = idx;
        }
        break;
      case '`':
        if (state === State.Backtick) {
          state = State.Normal;
        } else if (state === State.Normal) {
          state = State.Backtick;
        }
    }
    lastChar = car;

    car = sql.charAt(idx++);
  }
  if (lastParameterPosition === 0) {
    sqlPlaceHolder = sql;
  } else {
    sqlPlaceHolder += sql.substring(lastParameterPosition);
  }

  return { sql: sqlPlaceHolder, placeHolderIndex: placeHolderIndex };
};

/**
 * Ensure that filename requested by server corresponds to query
 * protocol : https://mariadb.com/kb/en/library/local_infile-packet/
 *
 * @param sql         query
 * @param parameters  parameters if any
 * @param fileName    server requested file
 * @returns {boolean} is filename corresponding to query
 */
module.exports.validateFileName = function (sql, parameters, fileName) {
  // in case of windows, file name in query are escaped
  // so for example LOAD DATA LOCAL INFILE 'C:\\Temp\\myFile.txt' ...
  // but server return 'C:\Temp\myFile.txt'
  // so with regex escaped, must test LOAD DATA LOCAL INFILE 'C:\\\\Temp\\\\myFile.txt'
  let queryValidator = new RegExp(
    "^(\\s*\\/\\*([^\\*]|\\*[^\\/])*\\*\\/)*\\s*LOAD\\s+DATA\\s+((LOW_PRIORITY|CONCURRENT)\\s+)?LOCAL\\s+INFILE\\s+'" +
      fileName.replace(/\\/g, '\\\\\\\\').replace('.', '\\.') +
      "'",
    'i'
  );
  if (queryValidator.test(sql)) return true;

  if (parameters != null) {
    queryValidator = new RegExp(
      '^(\\s*\\/\\*([^\\*]|\\*[^\\/])*\\*\\/)*\\s*LOAD\\s+DATA\\s+((LOW_PRIORITY|CONCURRENT)\\s+)?LOCAL\\s+INFILE\\s+\\?',
      'i'
    );
    if (queryValidator.test(sql) && parameters.length > 0) {
      if (Array.isArray(parameters)) {
        return parameters[0].toLowerCase() === fileName.toLowerCase();
      }
      return parameters.toLowerCase() === fileName.toLowerCase();
    }
  }
  return false;
};
