const Errors = require("../misc/errors");

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
module.exports.splitQuery = function(sql) {
  let partList = [];
  let state = State.Normal;
  let lastChar = "\0";
  let singleQuotes = false;
  let lastParameterPosition = 0;
  let idx = 0;
  let car = sql.charAt(idx++);

  while (car !== "") {
    if (
      state === State.Escape &&
      !((car === "'" && singleQuotes) || (car === '"' && !singleQuotes))
    ) {
      state = State.String;
      car = sql.charAt(idx++);
      continue;
    }

    switch (car) {
      case "*":
        if (state === State.Normal && lastChar === "/") state = State.SlashStarComment;
        break;

      case "/":
        if (state === State.SlashStarComment && lastChar === "*") state = State.Normal;
        break;

      case "#":
        if (state === State.Normal) state = State.EOLComment;
        break;

      case "-":
        if (state === State.Normal && lastChar === "-") {
          state = State.EOLComment;
        }
        break;

      case "\n":
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

      case "\\":
        if (state === State.String) state = State.Escape;
        break;

      case "?":
        if (state === State.Normal) {
          partList.push(sql.substring(lastParameterPosition, idx - 1));
          lastParameterPosition = idx;
        }
        break;
      case "`":
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
module.exports.splitQueryPlaceholder = function(sql, info, initialValues, displaySql) {
  let partList = [];
  let values = [];
  let state = State.Normal;
  let lastChar = "\0";

  let singleQuotes = false;
  let lastParameterPosition = 0;

  let idx = 0;
  let car = sql.charAt(idx++);
  let placeholderName;

  while (car !== "") {
    if (
      state === State.Escape &&
      !((car === "'" && singleQuotes) || (car === '"' && !singleQuotes))
    ) {
      state = State.String;
      car = sql.charAt(idx++);
      continue;
    }

    switch (car) {
      case "*":
        if (state === State.Normal && lastChar === "/") state = State.SlashStarComment;
        break;

      case "/":
        if (state === State.SlashStarComment && lastChar === "*") state = State.Normal;
        break;

      case "#":
        if (state === State.Normal) state = State.EOLComment;
        break;

      case "-":
        if (state === State.Normal && lastChar === "-") {
          state = State.EOLComment;
        }
        break;

      case "\n":
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

      case "\\":
        if (state === State.String) state = State.Escape;
        break;

      case ":":
        if (state === State.Normal) {
          partList.push(sql.substring(lastParameterPosition, idx - 1));
          placeholderName = "";
          while (
            ((car = sql.charAt(idx++)) !== "" && (car >= "0" && car <= "9")) ||
            (car >= "A" && car <= "Z") ||
            (car >= "a" && car <= "z") ||
            car === "-" ||
            car === "_"
          ) {
            placeholderName += car;
          }
          idx--;
          const val = initialValues[placeholderName];
          if (val === undefined) {
            throw Errors.createError(
              "Placeholder '" + placeholderName + "' is not defined\n" + displaySql.call(),
              false,
              info,
              "HY000",
              Errors.ER_PLACEHOLDER_UNDEFINED
            );
          }
          values.push(val);
          lastParameterPosition = idx;
        }
        break;
      case "`":
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

/**
 * Split query according to parameters (question mark).
 *
 * The only rewritten queries follow these notation: INSERT [LOW_PRIORITY | DELAYED |
 * HIGH_PRIORITY] [IGNORE] [INTO] tbl_name [PARTITION (partition_list)] [(col,...)] {VALUES |
 * VALUE} (...) [ ON DUPLICATE KEY UPDATE col=expr [, col=expr] ... ] With expr without
 * parameter.
 *
 * Query with INSERT ... SELECT / containing LAST_INSERT_ID() will not be rewritten
 *
 * query parts will be split this way :
 * - pre-value part
 * - after value part
 * [- after parameter part] (after each parameter)
 * - ending part
 *
 * example : INSERT INTO MyTABLE VALUES (9, ?, 5, ?, 8) ON DUPLICATE KEY UPDATE col2=col2+10
 * will result in :
 * - pre-value       : "INSERT INTO MyTABLE VALUES"
 * - after value     : " (9, "
 * - after parameter : ", 5, "
 * - after parameter : ", 8)"
 * - ending          : " ON DUPLICATE KEY UPDATE col2=col2+10"
 *
 *
 * @returns {JSON} query separated by parameters
 */
module.exports.splitRewritableQuery = function(sql) {
  let reWritablePrepare = true;
  let multipleQueriesPrepare = true;
  let partList = [];
  let lastChar = "\0";

  let lastParameterPosition = 0;

  let preValuePart1 = null;
  let preValuePart2 = null;
  let postValuePart = null;

  let singleQuotes = false;

  let isInParenthesis = 0;
  let isFirstChar = true;
  let isInsert = false;
  let semicolon = false;
  let hasParam = false;
  let state = State.Normal;

  let idx = 0;
  let car = sql.charAt(idx++);
  while (car !== "") {
    if (
      state === State.Escape &&
      !((car === "'" && singleQuotes) || (car === '"' && !singleQuotes))
    ) {
      state = State.String;
      car = sql.charAt(idx++);
      continue;
    }

    switch (car) {
      case "*":
        if (state === State.Normal && lastChar === "/") {
          state = State.SlashStarComment;
        }
        break;

      case "/":
        if (state === State.SlashStarComment && lastChar === "*") {
          state = State.Normal;
        }
        break;

      case "#":
        if (state === State.Normal) {
          state = State.EOLComment;
        }
        break;

      case "-":
        if (state === State.Normal && lastChar === "-") {
          state = State.EOLComment;
        }
        break;

      case "\n":
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
      case ";":
        if (state === State.Normal) {
          semicolon = true;
          multipleQueriesPrepare = false;
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

      case "\\":
        if (state === State.String) {
          state = State.Escape;
        }
        break;

      case "?":
        if (state === State.Normal) {
          hasParam = true;
          let part = sql.substring(lastParameterPosition, idx - 1);
          lastParameterPosition = idx;

          if (preValuePart1 === null) {
            preValuePart1 = part;
            preValuePart2 = "";
          } else if (preValuePart2 === null) {
            preValuePart2 = part;
          } else {
            if (postValuePart) {
              //having parameters after the last ")" of value is not rewritable
              reWritablePrepare = false;
              partList.push(postValuePart + part);
              postValuePart = null;
            } else partList.push(part);
          }
        }
        break;
      case "`":
        if (state === State.Backtick) {
          state = State.Normal;
        } else if (state === State.Normal) {
          state = State.Backtick;
        }
        break;

      case "s":
      case "S":
        if (
          state === State.Normal &&
          postValuePart === null &&
          sql.length > idx + 5 &&
          (sql.charAt(idx) === "e" || sql.charAt(idx) === "E") &&
          (sql.charAt(idx + 1) === "l" || sql.charAt(idx + 1) === "L") &&
          (sql.charAt(idx + 2) === "e" || sql.charAt(idx + 2) === "E") &&
          (sql.charAt(idx + 3) === "c" || sql.charAt(idx + 3) === "C") &&
          (sql.charAt(idx + 4) === "t" || sql.charAt(idx + 4) === "T")
        ) {
          //field/table name might contain 'select'
          if (
            idx > 1 &&
            (sql.charAt(idx - 2) > " " && "();><=-+,".indexOf(sql.charAt(idx - 2)) === -1)
          ) {
            break;
          }
          if (sql.charAt(idx + 5) > " " && "();><=-+,".indexOf(sql.charAt(idx + 5)) === -1) {
            break;
          }

          //SELECT queries, INSERT FROM SELECT not rewritable
          reWritablePrepare = false;
        }
        break;
      case "v":
      case "V":
        if (
          state === State.Normal &&
          !preValuePart1 &&
          (lastChar === ")" || lastChar <= " ") &&
          sql.length > idx + 6 &&
          (sql.charAt(idx) === "a" || sql.charAt(idx) === "A") &&
          (sql.charAt(idx + 1) === "l" || sql.charAt(idx + 1) === "L") &&
          (sql.charAt(idx + 2) === "u" || sql.charAt(idx + 2) === "U") &&
          (sql.charAt(idx + 3) === "e" || sql.charAt(idx + 3) === "E") &&
          (sql.charAt(idx + 4) === "s" || sql.charAt(idx + 4) === "S") &&
          (sql.charAt(idx + 5) === "(" || sql.charAt(idx + 5) <= " ")
        ) {
          idx += 5;
          preValuePart1 = sql.substring(lastParameterPosition, idx);
          lastParameterPosition = idx;
        }
        break;
      case "l":
      case "L":
        if (
          state === State.Normal &&
          sql.length > idx + 13 &&
          (sql.charAt(idx) === "a" || sql.charAt(idx) === "A") &&
          (sql.charAt(idx + 1) === "s" || sql.charAt(idx + 1) === "S") &&
          (sql.charAt(idx + 2) === "t" || sql.charAt(idx + 2) === "T") &&
          sql.charAt(idx + 3) === "_" &&
          (sql.charAt(idx + 4) === "i" || sql.charAt(idx + 4) === "I") &&
          (sql.charAt(idx + 5) === "n" || sql.charAt(idx + 5) === "N") &&
          (sql.charAt(idx + 6) === "s" || sql.charAt(idx + 6) === "S") &&
          (sql.charAt(idx + 7) === "e" || sql.charAt(idx + 7) === "E") &&
          (sql.charAt(idx + 8) === "r" || sql.charAt(idx + 8) === "R") &&
          (sql.charAt(idx + 9) === "t" || sql.charAt(idx + 9) === "T") &&
          sql.charAt(idx + 10) === "_" &&
          (sql.charAt(idx + 11) === "i" || sql.charAt(idx + 11) === "I") &&
          (sql.charAt(idx + 12) === "d" || sql.charAt(idx + 12) === "D") &&
          sql.charAt(idx + 13) === "("
        ) {
          reWritablePrepare = false;
          idx += 13;
        }
        break;
      case "(":
        if (state === State.Normal) {
          isInParenthesis++;
        }
        break;
      case ")":
        if (state === State.Normal) {
          isInParenthesis--;
          if (isInParenthesis == 0 && preValuePart2 !== null && postValuePart === null) {
            postValuePart = sql.substring(lastParameterPosition, idx);
            lastParameterPosition = idx;
          }
        }
        break;
      default:
        if (state === State.Normal && isFirstChar && car > " ") {
          if (
            (car === "I" || car === "i") &&
            sql.length > idx + 6 &&
            (sql.charAt(idx) === "n" || sql.charAt(idx) === "N") &&
            (sql.charAt(idx + 1) === "s" || sql.charAt(idx + 1) === "S") &&
            (sql.charAt(idx + 2) === "e" || sql.charAt(idx + 2) === "E") &&
            (sql.charAt(idx + 3) === "r" || sql.charAt(idx + 3) === "R") &&
            (sql.charAt(idx + 4) === "t" || sql.charAt(idx + 4) === "T") &&
            (sql.charAt(idx + 5) === "(" || sql.charAt(idx + 5) <= " ")
          ) {
            isInsert = true;
          }
          isFirstChar = false;
        }
        //multiple queries
        if (state == State.Normal && semicolon && car >= " ") {
          reWritablePrepare = false;
          multipleQueriesPrepare = true;
        }
        break;
    }

    lastChar = car;
    car = sql.charAt(idx++);
  }

  if (state === State.EOLComment) multipleQueriesPrepare = false;

  if (!hasParam) {
    //permit to have rewrite without parameter
    if (preValuePart1 === null) {
      partList.unshift("");
      partList.unshift(sql);
    } else {
      partList.unshift(sql.substring(lastParameterPosition, idx));
      partList.unshift(preValuePart1);
    }
    lastParameterPosition = idx;
  } else {
    partList.unshift(preValuePart2 !== null ? preValuePart2 : "");
    partList.unshift(preValuePart1 !== null ? preValuePart1 : "");
  }

  if (!isInsert) {
    reWritablePrepare = false;
  }

  //postValuePart is the value after the last parameter and parenthesis
  //if no param, don't add to the list.
  if (hasParam) {
    partList.push(postValuePart !== null ? postValuePart : "");
  }
  partList.push(sql.substring(lastParameterPosition, idx));

  return {
    partList: partList,
    reWritable: reWritablePrepare,
    multipleQueries: multipleQueriesPrepare
  };
};

module.exports.searchPlaceholder = function(sql, info, initialValues, displaySql) {
  let sqlPlaceHolder = "";
  const rowNumber = initialValues.length;
  let values = new Array(rowNumber);
  for (let i = 0; i < rowNumber; i++) values[i] = [];
  let state = State.Normal;
  let lastChar = "\0";

  let singleQuotes = false;
  let lastParameterPosition = 0;

  let idx = 0;
  let car = sql.charAt(idx++);
  let placeholderName;

  while (car !== "") {
    if (
      state === State.Escape &&
      !((car === "'" && singleQuotes) || (car === '"' && !singleQuotes))
    ) {
      state = State.String;
      lastChar = car;
      car = sql.charAt(idx++);
      continue;
    }

    switch (car) {
      case "*":
        if (state === State.Normal && lastChar === "/") state = State.SlashStarComment;
        break;

      case "/":
        if (state === State.SlashStarComment && lastChar === "*") state = State.Normal;
        break;

      case "#":
        if (state === State.Normal) state = State.EOLComment;
        break;

      case "-":
        if (state === State.Normal && lastChar === "-") {
          state = State.EOLComment;
        }
        break;

      case "\n":
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

      case "\\":
        if (state === State.String) state = State.Escape;
        break;

      case ":":
        if (state === State.Normal) {
          sqlPlaceHolder += sql.substring(lastParameterPosition, idx - 1) + "?";
          placeholderName = "";
          while (
            ((car = sql.charAt(idx++)) !== "" && (car >= "0" && car <= "9")) ||
            (car >= "A" && car <= "Z") ||
            (car >= "a" && car <= "z") ||
            car === "-" ||
            car === "_"
          ) {
            placeholderName += car;
          }
          idx--;
          for (let i = 0; i < rowNumber; i++) {
            const val = initialValues[i][placeholderName];
            if (val !== undefined) {
              values[i].push(val);
            } else {
              values[i].push(null);
            }
          }
          lastParameterPosition = idx;
        }
        break;
      case "`":
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

  return { sql: sqlPlaceHolder, values: values };
};

/**
 * Split query according to named parameters.
 *
 * The only rewritten queries follow these notation: INSERT [LOW_PRIORITY | DELAYED |
 * HIGH_PRIORITY] [IGNORE] [INTO] tbl_name [PARTITION (partition_list)] [(col,...)] {VALUES |
 * VALUE} (...) [ ON DUPLICATE KEY UPDATE col=expr [, col=expr] ... ] With expr without
 * parameter.
 *
 * Query with INSERT ... SELECT / containing LAST_INSERT_ID() will not be rewritten
 *
 * query parts will be split this way :
 * - pre-value part
 * - after value part
 * [- after parameter part] (after each parameter)
 * - ending part
 *
 * example : INSERT INTO MyTABLE VALUES (9, :param1, 5, :param2, 8) ON DUPLICATE KEY UPDATE col2=col2+10
 * will result in :
 * - pre-value       : "INSERT INTO MyTABLE VALUES"
 * - after value     : " (9, "
 * - after parameter : ", 5, "
 * - after parameter : ", 8)"
 * - ending          : " ON DUPLICATE KEY UPDATE col2=col2+10"
 *
 *
 * @returns {JSON} query separated by parameters
 */
module.exports.splitRewritableNamedParameterQuery = function(sql, initialValues) {
  let reWritablePrepare = true;
  let multipleQueriesPrepare = true;
  let partList = [];
  let values = new Array(initialValues.length);
  for (let i = 0; i < values.length; i++) values[i] = [];
  let lastChar = "\0";

  let lastParameterPosition = 0;

  let preValuePart1 = null;
  let preValuePart2 = null;
  let postValuePart = null;

  let singleQuotes = false;

  let isInParenthesis = 0;
  let isFirstChar = true;
  let isInsert = false;
  let semicolon = false;
  let hasParam = false;
  let placeholderName;
  let state = State.Normal;

  let idx = 0;
  let car = sql.charAt(idx++);
  while (car !== "") {
    if (
      state === State.Escape &&
      !((car === "'" && singleQuotes) || (car === '"' && !singleQuotes))
    ) {
      state = State.String;
      car = sql.charAt(idx++);
      continue;
    }

    switch (car) {
      case "*":
        if (state === State.Normal && lastChar === "/") {
          state = State.SlashStarComment;
        }
        break;

      case "/":
        if (state === State.SlashStarComment && lastChar === "*") {
          state = State.Normal;
        }
        break;

      case "#":
        if (state === State.Normal) {
          state = State.EOLComment;
        }
        break;

      case "-":
        if (state === State.Normal && lastChar === "-") {
          state = State.EOLComment;
        }
        break;

      case "\n":
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
      case ";":
        if (state === State.Normal) {
          semicolon = true;
          multipleQueriesPrepare = false;
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

      case "\\":
        if (state === State.String) {
          state = State.Escape;
        }
        break;

      case ":":
        if (state === State.Normal) {
          let part = sql.substring(lastParameterPosition, idx - 1);
          placeholderName = "";
          while (
            ((car = sql.charAt(idx++)) !== "" && (car >= "0" && car <= "9")) ||
            (car >= "A" && car <= "Z") ||
            (car >= "a" && car <= "z") ||
            car === "-" ||
            car === "_"
          ) {
            placeholderName += car;
          }
          idx--;
          hasParam = true;
          initialValues.forEach((row, idx) => {
            if (row[placeholderName] !== undefined) {
              values[idx].push(row[placeholderName]);
            } else {
              values[idx].push(null);
            }
          });

          lastParameterPosition = idx;

          if (preValuePart1 === null) {
            preValuePart1 = part;
            preValuePart2 = "";
          } else if (preValuePart2 === null) {
            preValuePart2 = part;
          } else {
            if (postValuePart) {
              //having parameters after the last ")" of value is not rewritable
              reWritablePrepare = false;
              partList.push(postValuePart + part);
              postValuePart = null;
            } else partList.push(part);
          }
        }
        break;

      case "`":
        if (state === State.Backtick) {
          state = State.Normal;
        } else if (state === State.Normal) {
          state = State.Backtick;
        }
        break;

      case "s":
      case "S":
        if (
          state === State.Normal &&
          postValuePart === null &&
          sql.length > idx + 5 &&
          (sql.charAt(idx) === "e" || sql.charAt(idx) === "E") &&
          (sql.charAt(idx + 1) === "l" || sql.charAt(idx + 1) === "L") &&
          (sql.charAt(idx + 2) === "e" || sql.charAt(idx + 2) === "E") &&
          (sql.charAt(idx + 3) === "c" || sql.charAt(idx + 3) === "C") &&
          (sql.charAt(idx + 4) === "t" || sql.charAt(idx + 4) === "T")
        ) {
          //field/table name might contain 'select'
          if (
            idx > 1 &&
            (sql.charAt(idx - 2) > " " && "();><=-+,".indexOf(sql.charAt(idx - 2)) === -1)
          ) {
            break;
          }
          if (sql.charAt(idx + 5) > " " && "();><=-+,".indexOf(sql.charAt(idx + 5)) === -1) {
            break;
          }

          //SELECT queries, INSERT FROM SELECT not rewritable
          reWritablePrepare = false;
        }
        break;
      case "v":
      case "V":
        if (
          state === State.Normal &&
          !preValuePart1 &&
          (lastChar === ")" || lastChar <= " ") &&
          sql.length > idx + 6 &&
          (sql.charAt(idx) === "a" || sql.charAt(idx) === "A") &&
          (sql.charAt(idx + 1) === "l" || sql.charAt(idx + 1) === "L") &&
          (sql.charAt(idx + 2) === "u" || sql.charAt(idx + 2) === "U") &&
          (sql.charAt(idx + 3) === "e" || sql.charAt(idx + 3) === "E") &&
          (sql.charAt(idx + 4) === "s" || sql.charAt(idx + 4) === "S") &&
          (sql.charAt(idx + 5) === "(" || sql.charAt(idx + 5) <= " ")
        ) {
          idx += 5;
          preValuePart1 = sql.substring(lastParameterPosition, idx);
          lastParameterPosition = idx;
        }
        break;
      case "l":
      case "L":
        if (
          state === State.Normal &&
          sql.length > idx + 13 &&
          (sql.charAt(idx) === "a" || sql.charAt(idx) === "A") &&
          (sql.charAt(idx + 1) === "s" || sql.charAt(idx + 1) === "S") &&
          (sql.charAt(idx + 2) === "t" || sql.charAt(idx + 2) === "T") &&
          sql.charAt(idx + 3) === "_" &&
          (sql.charAt(idx + 4) === "i" || sql.charAt(idx + 4) === "I") &&
          (sql.charAt(idx + 5) === "n" || sql.charAt(idx + 5) === "N") &&
          (sql.charAt(idx + 6) === "s" || sql.charAt(idx + 6) === "S") &&
          (sql.charAt(idx + 7) === "e" || sql.charAt(idx + 7) === "E") &&
          (sql.charAt(idx + 8) === "r" || sql.charAt(idx + 8) === "R") &&
          (sql.charAt(idx + 9) === "t" || sql.charAt(idx + 9) === "T") &&
          sql.charAt(idx + 10) === "_" &&
          (sql.charAt(idx + 11) === "i" || sql.charAt(idx + 11) === "I") &&
          (sql.charAt(idx + 12) === "d" || sql.charAt(idx + 12) === "D") &&
          sql.charAt(idx + 13) === "("
        ) {
          reWritablePrepare = false;
          idx += 13;
        }
        break;
      case "(":
        if (state === State.Normal) {
          isInParenthesis++;
        }
        break;
      case ")":
        if (state === State.Normal) {
          isInParenthesis--;
          if (isInParenthesis == 0 && preValuePart2 !== null && postValuePart === null) {
            postValuePart = sql.substring(lastParameterPosition, idx);
            lastParameterPosition = idx;
          }
        }
        break;
      default:
        if (state === State.Normal && isFirstChar && car > " ") {
          if (
            (car === "I" || car === "i") &&
            sql.length > idx + 6 &&
            (sql.charAt(idx) === "n" || sql.charAt(idx) === "N") &&
            (sql.charAt(idx + 1) === "s" || sql.charAt(idx + 1) === "S") &&
            (sql.charAt(idx + 2) === "e" || sql.charAt(idx + 2) === "E") &&
            (sql.charAt(idx + 3) === "r" || sql.charAt(idx + 3) === "R") &&
            (sql.charAt(idx + 4) === "t" || sql.charAt(idx + 4) === "T") &&
            (sql.charAt(idx + 5) === "(" || sql.charAt(idx + 5) <= " ")
          ) {
            isInsert = true;
          }
          isFirstChar = false;
        }
        //multiple queries
        if (state == State.Normal && semicolon && car >= " ") {
          reWritablePrepare = false;
          multipleQueriesPrepare = true;
        }
        break;
    }

    lastChar = car;
    car = sql.charAt(idx++);
  }

  if (state === State.EOLComment) multipleQueriesPrepare = false;

  if (!hasParam) {
    //permit to have rewrite without parameter
    if (preValuePart1 === null) {
      partList.unshift("");
      partList.unshift(sql);
    } else {
      partList.unshift(sql.substring(lastParameterPosition, idx));
      partList.unshift(preValuePart1);
    }
    lastParameterPosition = idx;
  } else {
    partList.unshift(preValuePart2 !== null ? preValuePart2 : "");
    partList.unshift(preValuePart1 !== null ? preValuePart1 : "");
  }

  if (!isInsert) {
    reWritablePrepare = false;
  }

  //postValuePart is the value after the last parameter and parenthesis
  //if no param, don't add to the list.
  if (hasParam) {
    partList.push(postValuePart !== null ? postValuePart : "");
  }
  partList.push(sql.substring(lastParameterPosition, idx));

  return {
    partList: partList,
    reWritable: reWritablePrepare,
    multipleQueries: multipleQueriesPrepare,
    values: values
  };
};
