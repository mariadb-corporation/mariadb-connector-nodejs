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
