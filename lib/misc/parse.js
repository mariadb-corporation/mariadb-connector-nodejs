//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2026 MariaDB plc

import * as Errors from '../misc/errors.js';

const SLASH_BYTE = '/'.charCodeAt(0);
const STAR_BYTE = '*'.charCodeAt(0);
const BACKSLASH_BYTE = '\\'.charCodeAt(0);
const HASH_BYTE = '#'.charCodeAt(0);
const MINUS_BYTE = '-'.charCodeAt(0);
const LINE_FEED_BYTE = '\n'.charCodeAt(0);
const DBL_QUOTE_BYTE = '"'.charCodeAt(0);
const QUOTE_BYTE = "'".charCodeAt(0);
const RADICAL_BYTE = '`'.charCodeAt(0);
const QUESTION_MARK_BYTE = '?'.charCodeAt(0);
const COLON_BYTE = ':'.charCodeAt(0);
const SEMICOLON_BYTE = ';'.charCodeAt(0);

/**
 * Bytes that have a meaning outside strings and comments, per parser.
 * Any other byte is skipped in a tight loop.
 */
const specialBytes = (chars) => {
  const table = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) table[chars.charCodeAt(i)] = 1;
  return table;
};
const SPLIT_SPECIAL = specialBytes('*#-"\'?`');
const PLACEHOLDER_SPECIAL = specialBytes('*/#-"\'?:`');
const SEARCH_SPECIAL = specialBytes('*#-"\':`');
const QUERIES_SPECIAL = specialBytes('*/#-"\';`');

/** bytes allowed in a placeholder name: 0-9, A-Z, a-z, '-' and '_' */
const PLACEHOLDER_NAME = specialBytes('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_');

/**
 * Search for question mark positions.
 * Question marks in comment are not taken into account
 *
 * @returns {Array} question mark position
 */
export function splitQuery(query) {
  const paramPositions = [];
  const len = query.length;
  // the byte before index i is only looked at ("/*", "--") from this index
  let lookBehindFrom = 1;
  let i = 0;

  while (i < len) {
    const currentChar = query[i];
    if (SPLIT_SPECIAL[currentChar] === 0) {
      i++;
      continue;
    }
    switch (currentChar) {
      case QUESTION_MARK_BYTE:
        // the byte following a placeholder is not interpreted
        paramPositions.push(i, ++i);
        lookBehindFrom = i + 2;
        break;

      case QUOTE_BYTE:
      case DBL_QUOTE_BYTE:
        // string: skip to the closing quote, a backslash escaping the next byte
        i++;
        while (i < len && query[i] !== currentChar) {
          if (query[i] === BACKSLASH_BYTE) i++;
          i++;
        }
        break;

      case RADICAL_BYTE:
        i++;
        while (i < len && query[i] !== RADICAL_BYTE) i++;
        break;

      case HASH_BYTE:
        i++;
        while (i < len && query[i] !== LINE_FEED_BYTE) i++;
        break;

      case MINUS_BYTE:
        // '--' starts a comment only if followed by whitespace or control character
        // (not in expressions like '2--1'), or at end of query
        if (i >= lookBehindFrom && query[i - 1] === MINUS_BYTE && (i + 1 >= len || query[i + 1] <= 0x20)) {
          i++;
          while (i < len && query[i] !== LINE_FEED_BYTE) i++;
        }
        break;

      case STAR_BYTE:
        if (i >= lookBehindFrom && query[i - 1] === SLASH_BYTE) {
          // comment: skip to the first '/' preceded by '*'
          i++;
          while (i < len && !(query[i] === SLASH_BYTE && query[i - 1] === STAR_BYTE)) i++;
          lookBehindFrom = i + 2;
        }
        break;
    }
    i++;
  }
  return paramPositions;
}

/**
 * Split the query according to parameters using placeholder.
 *
 * @param query           query bytes
 * @param info            connection information
 * @param initialValues   placeholder object
 * @param displaySql      display sql function
 * @returns {{paramPositions: Array, values: Array}}
 */
export function splitQueryPlaceholder(query, info, initialValues, displaySql) {
  // values not consumed yet, for '?' that takes the first one remaining:
  // only built if a '?' is met, most queries using only named placeholders
  let placeholderValues = null;
  let usedNames = null;
  let paramPositions = [];
  let values = [];
  const len = query.length;
  // the byte before index i is only looked at ("/*", "//", "--") from this index
  let lookBehindFrom = 1;
  let i = 0;

  while (i < len) {
    const car = query[i];
    if (PLACEHOLDER_SPECIAL[car] === 0) {
      i++;
      continue;
    }
    switch (car) {
      case QUESTION_MARK_BYTE: {
        if (placeholderValues === null) {
          placeholderValues = Object.assign({}, initialValues);
          if (usedNames !== null) {
            for (let k = 0; k < usedNames.length; k++) delete placeholderValues[usedNames[k]];
          }
        }
        const key = Object.keys(placeholderValues)[0];
        values.push(placeholderValues[key]);
        delete placeholderValues[key];

        // the byte following a placeholder is not interpreted
        paramPositions.push(i, ++i);
        lookBehindFrom = i + 2;
        break;
      }

      case COLON_BYTE: {
        let j = 1;

        while (
          (i + j < len && query[i + j] >= '0'.charCodeAt(0) && query[i + j] <= '9'.charCodeAt(0)) ||
          (query[i + j] >= 'A'.charCodeAt(0) && query[i + j] <= 'Z'.charCodeAt(0)) ||
          (query[i + j] >= 'a'.charCodeAt(0) && query[i + j] <= 'z'.charCodeAt(0)) ||
          query[i + j] === '-'.charCodeAt(0) ||
          query[i + j] === '_'.charCodeAt(0)
        ) {
          j++;
        }

        paramPositions.push(i, i + j);

        const placeholderName = query.toString('utf8', i + 1, i + j);
        // the byte following a placeholder is not interpreted
        i += j;
        lookBehindFrom = i + 2;
        // a value can be used by several placeholders
        const val = initialValues[placeholderName];
        if (placeholderValues !== null) {
          delete placeholderValues[placeholderName];
        } else if (usedNames === null) {
          usedNames = [placeholderName];
        } else {
          usedNames.push(placeholderName);
        }

        if (val === undefined) {
          throw Errors.createError(
            `Placeholder '${placeholderName}' is not defined`,
            Errors.client.ER_PLACEHOLDER_UNDEFINED,
            info,
            'HY000',
            displaySql.call()
          );
        }
        values.push(val);
        break;
      }

      case QUOTE_BYTE:
      case DBL_QUOTE_BYTE:
        // string: skip to the closing quote, a backslash escaping the next byte
        i++;
        while (i < len && query[i] !== car) {
          if (query[i] === BACKSLASH_BYTE) i++;
          i++;
        }
        break;

      case RADICAL_BYTE:
        i++;
        while (i < len && query[i] !== RADICAL_BYTE) i++;
        break;

      case HASH_BYTE:
        i++;
        while (i < len && query[i] !== LINE_FEED_BYTE) i++;
        break;

      case SLASH_BYTE:
        if (i >= lookBehindFrom && query[i - 1] === SLASH_BYTE) {
          i++;
          while (i < len && query[i] !== LINE_FEED_BYTE) i++;
        }
        break;

      case MINUS_BYTE:
        // '--' starts a comment only if followed by whitespace or control character
        // (not in expressions like '2--1'), or at end of query
        if (i >= lookBehindFrom && query[i - 1] === MINUS_BYTE && (i + 1 >= len || query[i + 1] <= 0x20)) {
          i++;
          while (i < len && query[i] !== LINE_FEED_BYTE) i++;
        }
        break;

      case STAR_BYTE:
        if (i >= lookBehindFrom && query[i - 1] === SLASH_BYTE) {
          // comment: skip to the first '/' preceded by '*'
          i++;
          while (i < len && !(query[i] === SLASH_BYTE && query[i - 1] === STAR_BYTE)) i++;
          lookBehindFrom = i + 2;
        }
        break;
    }
    i++;
  }
  return { paramPositions: paramPositions, values: values };
}

export function searchPlaceholder(sql) {
  let sqlPlaceHolder = '';
  const placeHolderIndex = [];
  const len = sql.length;
  let lastParameterPosition = 0;
  // the char before index i is only looked at ("/*", "--") from this index
  let lookBehindFrom = 1;
  let i = 0;

  while (i < len) {
    const car = sql.charCodeAt(i);
    if (car > 0x7f || SEARCH_SPECIAL[car] === 0) {
      i++;
      continue;
    }
    switch (car) {
      case COLON_BYTE: {
        let j = i + 1;
        let nameChar;
        while (j < len && (nameChar = sql.charCodeAt(j)) <= 0x7f && PLACEHOLDER_NAME[nameChar] === 1) j++;
        sqlPlaceHolder += sql.substring(lastParameterPosition, i) + '?';
        placeHolderIndex.push(sql.substring(i + 1, j));
        lastParameterPosition = j;
        i = j - 1;
        break;
      }

      case QUOTE_BYTE:
      case DBL_QUOTE_BYTE: {
        // string: skip to the closing quote, a backslash escaping the next char
        let strChar;
        i++;
        while (i < len && (strChar = sql.charCodeAt(i)) !== car) {
          if (strChar === BACKSLASH_BYTE) i++;
          i++;
        }
        break;
      }

      case RADICAL_BYTE:
        i++;
        while (i < len && sql.charCodeAt(i) !== RADICAL_BYTE) i++;
        break;

      case HASH_BYTE:
        i++;
        while (i < len && sql.charCodeAt(i) !== LINE_FEED_BYTE) i++;
        break;

      case MINUS_BYTE:
        // '--' starts a comment only if followed by whitespace or control character
        // (not in expressions like '2--1'), or at end of query
        if (
          i >= lookBehindFrom &&
          sql.charCodeAt(i - 1) === MINUS_BYTE &&
          (i + 1 >= len || sql.charCodeAt(i + 1) <= 0x20)
        ) {
          i++;
          while (i < len && sql.charCodeAt(i) !== LINE_FEED_BYTE) i++;
        }
        break;

      case STAR_BYTE:
        if (i >= lookBehindFrom && sql.charCodeAt(i - 1) === SLASH_BYTE) {
          // comment: skip to the first '/' preceded by '*'
          i++;
          while (i < len && !(sql.charCodeAt(i) === SLASH_BYTE && sql.charCodeAt(i - 1) === STAR_BYTE)) i++;
          lookBehindFrom = i + 2;
        }
        break;
    }
    i++;
  }
  if (lastParameterPosition === 0) {
    sqlPlaceHolder = sql;
  } else {
    sqlPlaceHolder += sql.substring(lastParameterPosition);
  }

  return { sql: sqlPlaceHolder, placeHolderIndex: placeHolderIndex };
}

/**
 * Ensure that filename requested by server corresponds to query
 * protocol : https://mariadb.com/kb/en/library/local_infile-packet/
 *
 * @param sql         query
 * @param parameters  parameters if any
 * @param fileName    server requested file
 * @returns {boolean} is filename corresponding to query
 */
export function validateFileName(sql, parameters, fileName) {
  // `fileName` comes from the server (LOCAL INFILE request packet), so every regex
  // metacharacter must be escaped before it is interpolated below. Interpolating it
  // unescaped let a malicious server inject regex syntax, causing either a crash
  // (`new RegExp` throwing on an invalid pattern) or catastrophic backtracking
  // (ReDoS) that freezes the event loop.
  // Backslashes are expanded to match two literal backslashes because the client SQL
  // escapes them: the server sends 'C:\Temp\myFile.txt', the query has 'C:\\Temp\\myFile.txt'.
  const escapedFileName = fileName.replace(/[\\.*+?^${}()|[\]]/g, (ch) => (ch === '\\' ? '\\\\\\\\' : '\\' + ch));
  // eslint-disable-next-line security/detect-non-literal-regexp -- fileName fully escaped above
  let queryValidator = new RegExp(
    "^(\\s*\\/\\*([^\\*]|\\*[^\\/])*\\*\\/)*\\s*LOAD\\s+DATA\\s+((LOW_PRIORITY|CONCURRENT)\\s+)?LOCAL\\s+INFILE\\s+'" +
      escapedFileName +
      "'",
    'i'
  );
  if (queryValidator.test(sql)) return true;

  if (parameters != null) {
    queryValidator = new RegExp(
      '^(\\s*\\/\\*([^\\*]|\\*[^\\/])*\\*\\/)*\\s*LOAD\\s+DATA\\s+((LOW_PRIORITY|CONCURRENT)\\s+)?' +
        'LOCAL\\s+INFILE\\s+\\?',
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
}

/**
 * Parse commands from buffer, returns queries separated by ';'
 * (the last one is not parsed)
 *
 * @param bufState buffer
 * @returns {*[]} array of queries contained in buffer
 */
export function parseQueries(bufState) {
  const queries = [];
  const buffer = bufState.buffer;
  const start = bufState.offset;
  const end = bufState.end;
  let i = start;

  while (i < end) {
    const currByte = buffer[i];
    if (QUERIES_SPECIAL[currByte] === 0) {
      i++;
      continue;
    }
    switch (currByte) {
      case SEMICOLON_BYTE:
        queries.push(buffer.toString('utf8', bufState.offset, i));
        bufState.offset = i + 1;
        break;

      case QUOTE_BYTE:
      case DBL_QUOTE_BYTE:
        // string: skip to the closing quote, a backslash escaping the next byte
        i++;
        while (i < end && buffer[i] !== currByte) {
          if (buffer[i] === BACKSLASH_BYTE) i++;
          i++;
        }
        break;

      case RADICAL_BYTE:
        i++;
        while (i < end && buffer[i] !== RADICAL_BYTE) i++;
        break;

      case HASH_BYTE:
        i++;
        while (i < end && buffer[i] !== LINE_FEED_BYTE) i++;
        break;

      case SLASH_BYTE:
      case MINUS_BYTE:
        // '//' or '--' : comment to end of line
        if (i > start && buffer[i - 1] === currByte) {
          i++;
          while (i < end && buffer[i] !== LINE_FEED_BYTE) i++;
        }
        break;

      case STAR_BYTE:
        if (i > start && buffer[i - 1] === SLASH_BYTE) {
          // comment: skip to the first '/' preceded by '*'
          i++;
          while (i < end && !(buffer[i] === SLASH_BYTE && buffer[i - 1] === STAR_BYTE)) i++;
        }
        break;
    }
    i++;
  }
  return queries;
}
