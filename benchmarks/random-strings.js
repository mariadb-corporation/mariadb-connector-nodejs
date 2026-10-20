//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2026 MariaDB plc

// Random strings for the insert benchmarks, generated once at load: generating them inside the
// timed function cost a quarter of the insert measurement. Letters, digits and emoji only, as in a
// typical workload: a string with nothing to escape takes the native encoder, one with a quote, a
// backslash or NUL the escaping loop (CONJS-382).
const chars = [...'123456789abcdefghijklmnop', '😎', '🌶', '🥂'];

const randomString = (length) => {
  let result = '';
  for (let i = length; i > 0; --i) result += chars[Math.floor(Math.random() * chars.length)];
  return result;
};

/**
 * A set of random strings, cycled through by the benchmark so that successive queries differ
 * without any generation cost in the timed function.
 *
 * @param count  number of strings
 * @param length length of each string, in characters
 * @returns {function(): string} next string
 */
export const randomStrings = (count, length) => {
  const strings = Array.from({ length: count }, () => randomString(length));
  let i = 0;
  return () => strings[i++ % count];
};
