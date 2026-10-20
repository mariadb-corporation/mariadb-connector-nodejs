//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2026 MariaDB plc

'use strict';

import { assert, describe, test } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// CONJS-373: the SBOM validator must reject every deviation from what the security scanners expect.
//
// The SBOM tooling is npm-only (it drives cyclonedx-npm), and @cyclonedx/cyclonedx-library loads
// the libxmljs2 native addon at import, which Deno cannot link: skipped there.
const isDeno = typeof globalThis.Deno !== 'undefined';
const { artifactName, lockfileProductionPackages, sbomFileName, validateSbom } = isDeno
  ? {}
  : await import('../../tools/validate-sbom.js');

const packageJson = {
  name: 'mariadb',
  version: '3.5.4',
  license: 'LGPL-2.1-or-later',
  dependencies: { '@types/geojson': '^7946.0.16', denque: '^2.1.0', 'iconv-lite': '^0.7.2' }
};

const lockfile = {
  packages: {
    '': { name: 'mariadb', version: '3.5.4' },
    'node_modules/@types/geojson': { version: '7946.0.16' },
    'node_modules/denque': { version: '2.1.0' },
    'node_modules/iconv-lite': { version: '0.7.3' },
    'node_modules/iconv-lite/node_modules/safer-buffer': { version: '2.1.2' },
    'node_modules/vitest': { version: '4.1.0', dev: true }
  }
};

const mariadb = () => ({ name: 'MariaDB plc', url: ['https://mariadb.com'] });

const sha512 = (data) => createHash('sha512').update(data).digest('hex');

const component = (group, name, version, licenseId, supplier) => ({
  type: 'library',
  ...(group ? { group } : {}),
  name,
  version,
  'bom-ref': `mariadb@3.5.4|${group ? group + '/' : ''}${name}@${version}`,
  supplier: { name: supplier },
  licenses: [{ license: { id: licenseId } }],
  hashes: [{ alg: 'SHA-512', content: sha512(`${name}@${version}`) }],
  purl: `pkg:npm/${group ? encodeURIComponent(group) + '/' : ''}${name}@${version}`
});

const validBom = () => ({
  $schema: 'http://cyclonedx.org/schema/bom-1.6.schema.json',
  bomFormat: 'CycloneDX',
  specVersion: '1.6',
  serialNumber: 'urn:uuid:e0285337-cbb8-4728-bb62-e4276ab9fc93',
  version: 1,
  metadata: {
    timestamp: '2026-09-18T16:33:41.336Z',
    lifecycles: [{ phase: 'build' }],
    tools: { components: [{ type: 'application', name: 'cyclonedx-npm', group: '@cyclonedx', version: '6.0.1' }] },
    authors: [{ name: 'MariaDB plc' }],
    supplier: mariadb(),
    manufacturer: mariadb(),
    component: {
      type: 'library',
      name: 'mariadb',
      version: '3.5.4',
      'bom-ref': 'mariadb@3.5.4',
      supplier: mariadb(),
      licenses: [{ license: { id: 'LGPL-2.1-or-later' } }],
      purl: 'pkg:npm/mariadb@3.5.4'
    },
    properties: [{ name: 'package_name', value: 'mariadb-3.5.4.tgz' }]
  },
  components: [
    component('@types', 'geojson', '7946.0.16', 'MIT', 'DefinitelyTyped'),
    component(null, 'denque', '2.1.0', 'Apache-2.0', 'Invertase'),
    component(null, 'iconv-lite', '0.7.3', 'MIT', 'Alexander Shtuchkin'),
    component(null, 'safer-buffer', '2.1.2', 'MIT', 'Nikita Skovoroda')
  ],
  dependencies: [
    {
      ref: 'mariadb@3.5.4',
      dependsOn: [
        'mariadb@3.5.4|@types/geojson@7946.0.16',
        'mariadb@3.5.4|denque@2.1.0',
        'mariadb@3.5.4|iconv-lite@0.7.3'
      ]
    },
    { ref: 'mariadb@3.5.4|@types/geojson@7946.0.16' },
    { ref: 'mariadb@3.5.4|denque@2.1.0' },
    { ref: 'mariadb@3.5.4|iconv-lite@0.7.3', dependsOn: ['mariadb@3.5.4|safer-buffer@2.1.2'] },
    { ref: 'mariadb@3.5.4|safer-buffer@2.1.2' }
  ]
});

const validate = (bom) => validateSbom(bom, { packageJson, lockfile });

// applies `mutate` to a valid document and expects exactly the finding(s) matching `expected`
const rejects = async (mutate, ...expected) => {
  const bom = validBom();
  mutate(bom);
  const errors = await validate(bom);
  assert.isNotEmpty(errors, 'expected findings');
  for (const e of expected) {
    assert.isTrue(
      errors.some((msg) => msg.includes(e)),
      `expected a finding containing "${e}", got:\n${errors.join('\n')}`
    );
  }
};

describe.skipIf(isDeno)('SBOM naming', () => {
  test('artifact and file name', () => {
    assert.equal(artifactName(packageJson), 'mariadb-3.5.4.tgz');
    assert.equal(sbomFileName(packageJson), 'mariadb-3.5.4.cdx.json');
  });

  test('lockfile production packages', () => {
    const locked = lockfileProductionPackages(lockfile);
    assert.deepEqual([...locked.keys()].sort(), [
      '@types/geojson@7946.0.16',
      'denque@2.1.0',
      'iconv-lite@0.7.3',
      'safer-buffer@2.1.2'
    ]);
    assert.equal(locked.get('safer-buffer@2.1.2'), 'node_modules/iconv-lite/node_modules/safer-buffer');
  });
});

describe.skipIf(isDeno)('SBOM validation', () => {
  test('accepts a complete document', async () => {
    assert.deepEqual(await validate(validBom()), []);
  });

  test('accepts an SPDX license expression', async () => {
    const bom = validBom();
    bom.components[1].licenses = [{ expression: 'MIT OR Apache-2.0' }];
    assert.deepEqual(await validate(bom), []);
  });

  test('accepts a document without lockfile cross-check', async () => {
    assert.deepEqual(await validateSbom(validBom(), { packageJson }), []);
  });

  test('rejects schema violations', () => rejects((b) => (b.metadata.lifecycles = [{ phase: 'nope' }]), 'schema:'));
  test('rejects unknown properties (strict schema)', () => rejects((b) => (b.components[0].foo = 1), 'schema:'));
  test('rejects another spec version', () => rejects((b) => (b.specVersion = '1.5'), 'specVersion'));
  test('rejects a missing serial number', () => rejects((b) => delete b.serialNumber, 'serialNumber'));
  test('rejects a missing timestamp', () => rejects((b) => delete b.metadata.timestamp, 'timestamp'));
  test('rejects a missing build lifecycle', () => rejects((b) => delete b.metadata.lifecycles, 'lifecycles'));
  test('rejects a missing generator tool', () => rejects((b) => delete b.metadata.tools, 'tools'));
  test('rejects another supplier', () =>
    rejects(
      (b) => {
        b.metadata.supplier.name = 'ACME';
        b.metadata.manufacturer.name = 'ACME';
        b.metadata.authors = [{ name: 'ACME' }];
        b.metadata.component.supplier.name = 'ACME';
      },
      'metadata.supplier.name',
      'metadata.manufacturer.name',
      'metadata.authors',
      'main component supplier.name'
    ));
  test('rejects a missing package_name property', () => rejects((b) => delete b.metadata.properties, 'package_name'));
  test('rejects a wrong package_name property', () =>
    rejects((b) => (b.metadata.properties[0].value = 'mariadb'), 'package_name'));

  test('rejects a main component version differing from package.json', () =>
    rejects((b) => (b.metadata.component.version = '3.5.3'), 'main component version'));
  test('rejects a main component purl with qualifiers', () =>
    rejects((b) => (b.metadata.component.purl += '?vcs_url=x'), 'main component purl'));
  test('rejects a main component not declaring the package.json license', () =>
    rejects((b) => (b.metadata.component.licenses = [{ license: { id: 'MIT' } }]), 'LGPL-2.1-or-later'));
  test('rejects a main component that is not a library', () =>
    rejects((b) => (b.metadata.component.type = 'application'), 'main component type'));

  test('rejects a component without supplier', () => rejects((b) => delete b.components[1].supplier, 'supplier'));
  test('rejects a component without license', () => rejects((b) => (b.components[1].licenses = []), 'no license'));
  test('rejects a named (non SPDX) license', () =>
    rejects((b) => (b.components[1].licenses = [{ license: { name: 'Custom' } }]), 'not an SPDX id'));
  test('rejects an unknown SPDX id', () =>
    rejects((b) => (b.components[1].licenses = [{ license: { id: 'Apache-2.0-with-extras' } }]), 'not SPDX'));
  test('rejects an invalid SPDX expression', () =>
    rejects((b) => (b.components[1].licenses = [{ expression: 'MIT OR' }]), 'not SPDX'));
  test('rejects a component without purl', () => rejects((b) => delete b.components[1].purl, 'no purl'));
  test('rejects an invalid purl', () => rejects((b) => (b.components[1].purl = 'pkg:npm/'), 'is invalid'));
  test('rejects a purl of another type', () => rejects((b) => (b.components[1].purl = 'pkg:pypi/denque@2.1.0'), 'npm'));
  test('rejects a purl not matching the component', () =>
    rejects((b) => (b.components[1].purl = 'pkg:npm/denque@2.0.0'), 'does not match'));
  test('rejects a scoped purl not matching the group', () =>
    rejects((b) => (b.components[0].purl = 'pkg:npm/geojson@7946.0.16'), 'does not match'));
  test('rejects a component without hash', () => rejects((b) => delete b.components[1].hashes, 'no hash'));
  test('rejects an unknown hash algorithm', () =>
    rejects((b) => (b.components[1].hashes = [{ alg: 'MD5', content: 'a'.repeat(32) }]), 'hash algorithm MD5'));
  test('rejects a malformed hash', () =>
    rejects((b) => (b.components[1].hashes = [{ alg: 'SHA-512', content: 'xyz' }]), '128 hex characters'));
  test('accepts a main component without hash when no artifact is given', async () => {
    assert.deepEqual(await validate(validBom()), []);
  });
  test('rejects a malformed main component hash', () =>
    rejects((b) => (b.metadata.component.hashes = [{ alg: 'SHA-512', content: 'xyz' }]), '128 hex characters'));

  describe('with the packed artifact', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sbom-test-'));
    const artifact = join(dir, 'mariadb-3.5.4.tgz');
    writeFileSync(artifact, 'not really a tarball');
    const validateWithArtifact = (bom) => validateSbom(bom, { packageJson, lockfile, artifact });

    test('accepts the matching tarball hash', async () => {
      const bom = validBom();
      bom.metadata.component.hashes = [{ alg: 'SHA-512', content: sha512('not really a tarball') }];
      assert.deepEqual(await validateWithArtifact(bom), []);
    });
    test('rejects a main component without hash', async () => {
      const errors = await validateWithArtifact(validBom());
      assert.isTrue(
        errors.some((e) => e.includes('main component must carry the SHA-512')),
        errors.join('\n')
      );
    });
    test('rejects a hash of another tarball', async () => {
      const bom = validBom();
      bom.metadata.component.hashes = [{ alg: 'SHA-512', content: sha512('another tarball') }];
      const errors = await validateWithArtifact(bom);
      assert.isTrue(
        errors.some((e) => e.includes('main component must carry the SHA-512')),
        errors.join('\n')
      );
    });
  });

  test('rejects duplicate bom-refs', () =>
    rejects((b) => (b.components[1]['bom-ref'] = b.components[2]['bom-ref']), 'not unique'));

  test('rejects a component without dependencies entry', () =>
    rejects((b) => b.dependencies.splice(2, 1), 'no entry for mariadb@3.5.4|denque@2.1.0'));
  test('rejects a dependency on an unknown bom-ref', () =>
    rejects((b) => b.dependencies[0].dependsOn.push('ghost@1.0.0'), 'unknown bom-ref ghost@1.0.0'));
  test('rejects a dependencies entry for an unknown bom-ref', () =>
    rejects((b) => b.dependencies.push({ ref: 'ghost@1.0.0' }), 'unknown bom-ref ghost@1.0.0'));
  test('rejects a direct dependency not depending on the main component', () =>
    rejects((b) => b.dependencies[0].dependsOn.splice(1, 1), 'direct dependency denque'));

  test('rejects a lockfile production package missing from the SBOM', () =>
    rejects((b) => {
      b.components.splice(3, 1);
      b.dependencies.splice(4, 1);
      delete b.dependencies[3].dependsOn;
    }, 'safer-buffer@2.1.2 is missing from the SBOM'));
  test('rejects a version differing from the lockfile', () =>
    rejects(
      (b) => {
        b.components[3].version = '2.1.1';
        b.components[3].purl = 'pkg:npm/safer-buffer@2.1.1';
      },
      'safer-buffer@2.1.2 is missing from the SBOM',
      'safer-buffer@2.1.1 is not a production package'
    ));
  test('rejects a component that is not a production package', () =>
    rejects((b) => {
      b.components.push(component(null, 'vitest', '4.1.0', 'MIT', 'vitest'));
      b.dependencies.push({ ref: 'mariadb@3.5.4|vitest@4.1.0' });
    }, 'vitest@4.1.0 is not a production package'));
});
