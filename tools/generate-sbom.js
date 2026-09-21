//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2026 MariaDB plc

'use strict';

// Generates the CycloneDX 1.6 JSON software bill of materials of the published npm package (CONJS-373),
// written to sbom/<name>-<version>.cdx.json, then validates it with tools/validate-sbom.js.
//
//   node tools/generate-sbom.js [--artifact <tarball>]
//
// With --artifact (the release workflow, after `npm pack`), the SHA-512 of the tarball is recorded on
// the main component, so the SBOM identifies the exact artifact it describes.
//
// @cyclonedx/cyclonedx-npm lists the production dependency tree (direct and transitive, as installed
// from package-lock.json) with versions, package URLs, hashes and SPDX licenses. The document is then
// completed with what the tool cannot know: MariaDB plc as author, supplier and manufacturer, the
// build lifecycle, the package_name property (the npm tarball name, as the other MariaDB SBOMs name
// their artifact) and a supplier for every dependency.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LIFECYCLE_PHASE,
  PACKAGE_NAME_PROPERTY,
  SPEC_VERSION,
  SUPPLIER_NAME,
  SUPPLIER_URL,
  artifactName,
  loadProjectContext,
  sbomFileName,
  validateSbom
} from './validate-sbom.js';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const mariadb = () => ({ name: SUPPLIER_NAME, url: [SUPPLIER_URL] });

/** Runs @cyclonedx/cyclonedx-npm on the project and returns the parsed document. */
function generateBaseBom() {
  const bin = join(projectRoot, 'node_modules', '@cyclonedx', 'cyclonedx-npm', 'bin', 'cyclonedx-npm-cli.js');
  if (!existsSync(bin)) throw new Error('@cyclonedx/cyclonedx-npm is not installed: run `npm install` first');
  const args = [
    bin,
    '--omit',
    'dev', // production dependencies only
    '--spec-version',
    SPEC_VERSION,
    '--output-format',
    'JSON',
    '--mc-type',
    'library',
    '--short-PURLs', // pkg:npm/<name>@<version>, no qualifier
    '--flatten-components',
    '--validate',
    '--output-file',
    '-'
  ];
  const json = execFileSync(process.execPath, args, {
    cwd: projectRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'inherit']
  });
  return JSON.parse(json);
}

/** npm "person" field: `Name <email> (url)` or `{ name, email, url }`. */
function parsePerson(person) {
  if (!person) return null;
  if (typeof person === 'string') {
    const m = /^\s*([^<(]+?)\s*(?:<[^>]*>)?\s*(?:\(([^)]*)\))?\s*$/.exec(person);
    return m ? { name: m[1], url: m[2] } : { name: person.trim() };
  }
  return person.name ? { name: person.name, url: person.url } : null;
}

/** GitHub/GitLab/Bitbucket owner of a repository URL, as a fallback supplier. */
function repositoryOwner(repository) {
  const url = typeof repository === 'string' ? repository : repository?.url;
  const m = /(github\.com|gitlab\.com|bitbucket\.org)[/:]([^/]+)\/[^/]+/i.exec(url ?? '');
  return m ? { name: m[2], url: `https://${m[1].toLowerCase()}/${m[2]}` } : null;
}

/**
 * Supplier of a dependency: its author, else the owner of its source repository (DefinitelyTyped,
 * nodejs...), else its first maintainer or contributor. Read from the installed package.json, at the
 * path recorded by cyclonedx-npm.
 */
function dependencySupplier(component) {
  const path = component.properties?.find((p) => p.name === 'cdx:npm:package:path')?.value;
  if (!path) throw new Error(`no installation path for ${component.name}@${component.version}`);
  const pkg = JSON.parse(readFileSync(join(projectRoot, path, 'package.json'), 'utf8'));
  const supplier =
    parsePerson(pkg.author) ??
    repositoryOwner(pkg.repository) ??
    parsePerson(pkg.maintainers?.[0]) ??
    parsePerson(pkg.contributors?.[0]);
  if (!supplier) throw new Error(`cannot determine the supplier of ${component.name}@${component.version}`);
  return supplier.url ? { name: supplier.name, url: [supplier.url] } : { name: supplier.name };
}

/** Hash of a dependency, as recorded by npm (registry integrity) on its distribution reference. */
function distributionHashes(component) {
  const distribution = component.externalReferences?.find((r) => r.type === 'distribution' && r.hashes?.length);
  return distribution?.hashes.map(({ alg, content }) => ({ alg, content }));
}

function completeBom(bom, packageJson, artifact) {
  const { metadata } = bom;

  metadata.lifecycles = [{ phase: LIFECYCLE_PHASE }];
  metadata.authors = [{ name: SUPPLIER_NAME }];
  metadata.supplier = mariadb();
  metadata.manufacturer = mariadb();
  metadata.properties = [
    ...(metadata.properties ?? []).filter((p) => p.name !== PACKAGE_NAME_PROPERTY),
    { name: PACKAGE_NAME_PROPERTY, value: artifactName(packageJson) }
  ];

  const main = metadata.component;
  main.purl = `pkg:npm/${packageJson.name}@${packageJson.version}`;
  main.supplier = mariadb();
  main.manufacturer = mariadb();
  main.publisher = SUPPLIER_NAME;
  if (artifact) {
    if (basename(artifact) !== artifactName(packageJson)) {
      throw new Error(`artifact ${basename(artifact)} does not match the expected ${artifactName(packageJson)}`);
    }
    main.hashes = [{ alg: 'SHA-512', content: createHash('sha512').update(readFileSync(artifact)).digest('hex') }];
  }

  for (const component of bom.components ?? []) {
    component.supplier = dependencySupplier(component);
    const hashes = distributionHashes(component);
    if (!hashes) throw new Error(`no distribution hash for ${component.name}@${component.version}`);
    component.hashes = hashes;
  }
  return bom;
}

async function main() {
  const ctx = loadProjectContext(projectRoot);
  if (!ctx.lockfile) throw new Error('package-lock.json not found: run `npm install` first');
  const artifactIndex = process.argv.indexOf('--artifact');
  const artifact = artifactIndex === -1 ? undefined : process.argv[artifactIndex + 1];
  if (artifactIndex !== -1 && !(artifact && existsSync(artifact))) {
    throw new Error(`--artifact: tarball not found: ${artifact}`);
  }

  const bom = completeBom(generateBaseBom(), ctx.packageJson, artifact);
  const outDir = join(projectRoot, 'sbom');
  const file = join(outDir, sbomFileName(ctx.packageJson));
  mkdirSync(outDir, { recursive: true });
  writeFileSync(file, JSON.stringify(bom, null, 2) + '\n');

  const count = (bom.components ?? []).length;
  const hash = bom.metadata.component.hashes?.[0];
  console.log(`✓ generated ${file} (${bom.metadata.component.purl}, ${count} dependencies)`);
  if (hash) console.log(`  ${basename(artifact)} ${hash.alg} ${hash.content}`);

  const errors = await validateSbom(bom, { ...ctx, artifact });
  for (const e of errors) console.error(`✗ ${e}`);
  if (errors.length > 0) {
    console.error(`\n${file}: ${errors.length} finding(s)`);
    process.exit(1);
  }
  console.log(`✓ ${file} is a valid CycloneDX ${SPEC_VERSION} SBOM`);
}

main().catch((e) => {
  console.error(`✗ ${e.message}`);
  process.exit(1);
});
