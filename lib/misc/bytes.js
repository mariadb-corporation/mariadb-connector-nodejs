//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2026 MariaDB plc

'use strict';

/**
 * Return a Buffer over the bytes of a Uint8Array parameter.
 * A Buffer is returned as is. A plain Uint8Array (from TextEncoder, crypto.getRandomValues, a fetch body, ...)
 * is wrapped in a Buffer that shares its memory, so a subarray view keeps its offset and length, and nothing is copied.
 *
 * @param {Uint8Array} value - binary parameter
 * @returns {Buffer} buffer over the same bytes
 */
export function toBuffer(value) {
  return Buffer.isBuffer(value) ? value : Buffer.from(value.buffer, value.byteOffset, value.byteLength);
}
