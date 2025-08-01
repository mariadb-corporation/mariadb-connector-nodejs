//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

import packageJson from './package.json' with { type: 'json' };

export function hasMinVersion(nodeVersionStr, connectorRequirement) {
  const versNode = nodeVersionStr.split('.');
  const versReq = connectorRequirement.split('.');

  const majorNode = Number(versNode[0]);
  const majorReq = Number(versReq[0]);
  if (majorNode > majorReq) return true;
  if (majorNode < majorReq) return false;

  if (versReq.length === 1) return true;

  const minorNode = Number(versNode[1]);
  const minorReq = Number(versReq[1]);
  return minorNode >= minorReq;
}

const requirement = packageJson.engines.node;
const connectorRequirement = requirement.replace('>=', '').trim();
const currentNodeVersion = process.version.replace('v', '');
if (!hasMinVersion(currentNodeVersion, connectorRequirement)) {
  console.error(`please upgrade node: mariadb requires at least version ${connectorRequirement}`);
  process.exit(1);
}
