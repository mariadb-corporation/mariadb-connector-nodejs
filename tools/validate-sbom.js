//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2026 MariaDB plc

'use strict';

// Validates a CycloneDX 1.6 JSON SBOM produced by tools/generate-sbom.js (CONJS-373).
//
//   node tools/validate-sbom.js [file] [--artifact <tarball>]
//
// default file: sbom/<name>-<version>.cdx.json. With --artifact, the main component must carry the
// SHA-512 of that tarball.
//
// Beyond the CycloneDX 1.6 JSON schema, the document is checked against the metadata the MariaDB
// security scanners expect, against package.json (main component, direct dependencies) and against
// package-lock.json (every production package, direct or transitive, is listed with its exact
// version). Package URLs are parsed with packageurl-js, licenses must be SPDX identifiers or SPDX
// expressions. Any finding fails the process (exit code 1) so that CI refuses to ship the SBOM.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PackageURL } from 'packageurl-js';
import spdxExpressionParse from 'spdx-expression-parse';
import { SPDX, Spec, Validation } from '@cyclonedx/cyclonedx-library';

export const SPEC_VERSION = '1.6';
export const SUPPLIER_NAME = 'MariaDB plc';
export const SUPPLIER_URL = 'https://mariadb.com';
// same property as the MariaDB server and the other connectors' SBOMs: the artifact file name
export const PACKAGE_NAME_PROPERTY = 'package_name';
export const LIFECYCLE_PHASE = 'build';
// CycloneDX hash algorithms accepted, with the hex digest length of each
const HASH_LENGTH = { 'SHA-256': 64, 'SHA-384': 96, 'SHA-512': 128 };

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Published artifact: the `npm pack` tarball name. */
export const artifactName = (pkg) => `${pkg.name}-${pkg.version}.tgz`;

/** Output file name, `<artifact name>.cdx.json`, the pattern expected by the security team scanners. */
export const sbomFileName = (pkg) => artifactName(pkg).replace(/\.tgz$/, '.cdx.json');

const componentId = (c) => (c.group ? `${c.group}/${c.name}` : c.name) + '@' + c.version;

/** Flattened list of all components, whatever their nesting. */
const allComponents = (components = []) => components.flatMap((c) => [c, ...allComponents(c.components)]);

/** Production packages from a lockfile v2/v3 `packages` map, keyed by `name@version`. */
export const lockfileProductionPackages = (lockfile) => {
  const found = new Map();
  for (const [path, entry] of Object.entries(lockfile.packages ?? {})) {
    if (path === '' || entry.dev || entry.link || entry.extraneous) continue;
    const name = entry.name ?? path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length);
    found.set(`${name}@${entry.version}`, path);
  }
  return found;
};

const isSpdxExpression = (expression) => {
  try {
    spdxExpressionParse(expression);
    return true;
  } catch {
    return false;
  }
};

/**
 * @param {object} bom parsed CycloneDX JSON document
 * @param {{ packageJson: object, lockfile?: object, artifact?: string }} ctx package.json and (optional)
 *   package-lock.json contents, and the tarball the main component must hash to
 * @returns {Promise<string[]>} findings, empty when the document is valid
 */
export async function validateSbom(bom, { packageJson, lockfile, artifact }) {
  const errors = [];
  const fail = (msg) => errors.push(msg);

  // 1. CycloneDX 1.6 JSON schema (strict: unknown properties are rejected)
  const schemaErrors = await new Validation.JsonStrictValidator(Spec.Version.v1dot6).validate(JSON.stringify(bom));
  if (schemaErrors) {
    for (const e of schemaErrors) fail(`schema: ${e.instancePath || '/'} ${e.message}`);
  }

  // 2. document level metadata
  if (bom.bomFormat !== 'CycloneDX') fail(`bomFormat must be "CycloneDX", got ${JSON.stringify(bom.bomFormat)}`);
  if (bom.specVersion !== SPEC_VERSION) fail(`specVersion must be "${SPEC_VERSION}", got ${bom.specVersion}`);
  if (bom.$schema !== `http://cyclonedx.org/schema/bom-${SPEC_VERSION}.schema.json`) {
    fail(`$schema must reference the CycloneDX ${SPEC_VERSION} schema, got ${bom.$schema}`);
  }
  if (!/^urn:uuid:[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(bom.serialNumber ?? '')) {
    fail(`serialNumber must be a urn:uuid, got ${bom.serialNumber}`);
  }
  if (!Number.isInteger(bom.version) || bom.version < 1) fail(`version must be a positive integer, got ${bom.version}`);

  const metadata = bom.metadata ?? {};
  if (Number.isNaN(Date.parse(metadata.timestamp ?? '')))
    fail(`metadata.timestamp must be a date, got ${metadata.timestamp}`);
  if (!(metadata.lifecycles ?? []).some((l) => l.phase === LIFECYCLE_PHASE)) {
    fail(`metadata.lifecycles must contain the "${LIFECYCLE_PHASE}" phase`);
  }
  const tools = metadata.tools?.components ?? [];
  if (!tools.some((t) => t.name && t.version))
    fail('metadata.tools.components must name the generator tool and version');
  const isMariaDB = (entity) => entity?.name === SUPPLIER_NAME;
  if (!isMariaDB(metadata.supplier)) fail(`metadata.supplier.name must be "${SUPPLIER_NAME}"`);
  if (!isMariaDB(metadata.manufacturer)) fail(`metadata.manufacturer.name must be "${SUPPLIER_NAME}"`);
  if (!(metadata.authors ?? []).some(isMariaDB)) fail(`metadata.authors must contain "${SUPPLIER_NAME}"`);
  const packageName = (metadata.properties ?? []).find((p) => p.name === PACKAGE_NAME_PROPERTY);
  if (packageName?.value !== artifactName(packageJson)) {
    fail(`metadata property ${PACKAGE_NAME_PROPERTY} must be ${artifactName(packageJson)}, got ${packageName?.value}`);
  }

  // 3. main component
  const main = metadata.component;
  if (!main) {
    fail('metadata.component is missing');
  } else {
    if (main.type !== 'library') fail(`main component type must be "library", got ${main.type}`);
    if (main.name !== packageJson.name) fail(`main component name must be ${packageJson.name}, got ${main.name}`);
    if (main.version !== packageJson.version) {
      fail(`main component version must be ${packageJson.version}, got ${main.version}`);
    }
    if (!main['bom-ref']) fail('main component has no bom-ref');
    const expectedPurl = `pkg:npm/${packageJson.name}@${packageJson.version}`;
    if (main.purl !== expectedPurl) fail(`main component purl must be ${expectedPurl}, got ${main.purl}`);
    if (!isMariaDB(main.supplier)) fail(`main component supplier.name must be "${SUPPLIER_NAME}"`);
    checkLicenses(main, packageJson.name, fail, packageJson.license);
    // the tarball hash is known only once packed (release): required with --artifact, else optional
    if (main.hashes || artifact) checkHashes(main, packageJson.name, fail);
    if (artifact) {
      const expected = createHash('sha512').update(readFileSync(artifact)).digest('hex');
      if (!(main.hashes ?? []).some((h) => h.alg === 'SHA-512' && h.content === expected)) {
        fail(`main component must carry the SHA-512 of ${artifact}: ${expected}`);
      }
    }
  }

  // 4. every component: identity, purl, supplier, SPDX license
  const components = allComponents(bom.components);
  const refs = new Map();
  if (main?.['bom-ref']) refs.set(main['bom-ref'], main);
  for (const c of components) {
    const id = componentId(c);
    if (!c.name || !c.version) fail(`component ${id} lacks a name or version`);
    if (!c['bom-ref']) fail(`component ${id} has no bom-ref`);
    else if (refs.has(c['bom-ref'])) fail(`bom-ref ${c['bom-ref']} is not unique`);
    else refs.set(c['bom-ref'], c);
    if (!c.supplier?.name) fail(`component ${id} has no supplier name`);
    checkPurl(c, id, fail);
    checkLicenses(c, id, fail);
    checkHashes(c, id, fail);
  }

  // 5. dependency graph: every component has an entry, every reference resolves
  const graph = new Map((bom.dependencies ?? []).map((d) => [d.ref, d.dependsOn ?? []]));
  for (const ref of refs.keys()) {
    if (!graph.has(ref)) fail(`dependencies has no entry for ${ref}`);
  }
  for (const [ref, dependsOn] of graph) {
    if (!refs.has(ref)) fail(`dependencies references unknown bom-ref ${ref}`);
    for (const dep of dependsOn) {
      if (!refs.has(dep)) fail(`dependencies of ${ref} reference unknown bom-ref ${dep}`);
    }
  }
  // direct dependencies of package.json are direct dependencies of the main component
  if (main?.['bom-ref']) {
    const direct = new Set(
      (graph.get(main['bom-ref']) ?? [])
        .map((ref) => refs.get(ref))
        .filter(Boolean)
        .map(fullName)
    );
    for (const name of Object.keys(packageJson.dependencies ?? {})) {
      if (!direct.has(name)) fail(`direct dependency ${name} is not a dependency of the main component`);
    }
  }

  // 6. package-lock.json: same production package set, same versions, nothing more, nothing less
  if (lockfile) {
    const locked = lockfileProductionPackages(lockfile);
    const listed = new Set(components.map(componentId));
    for (const id of locked.keys()) {
      if (!listed.has(id)) fail(`package-lock.json production package ${id} is missing from the SBOM`);
    }
    for (const id of listed) {
      if (!locked.has(id)) fail(`SBOM component ${id} is not a production package of package-lock.json`);
    }
  }

  return errors;
}

const fullName = (c) => (c.group ? `${c.group}/${c.name}` : c.name);

function checkPurl(c, id, fail) {
  if (!c.purl) return fail(`component ${id} has no purl`);
  let purl;
  try {
    purl = PackageURL.fromString(c.purl);
  } catch (e) {
    return fail(`component ${id} purl ${c.purl} is invalid: ${e.message}`);
  }
  if (purl.type !== 'npm') fail(`component ${id} purl type must be npm, got ${purl.type}`);
  if ((purl.namespace ?? undefined) !== c.group || purl.name !== c.name || purl.version !== c.version) {
    fail(`component ${id} purl ${c.purl} does not match its group/name/version`);
  }
}

function checkHashes(c, id, fail) {
  const hashes = c.hashes ?? [];
  if (hashes.length === 0) return fail(`component ${id} has no hash`);
  for (const { alg, content } of hashes) {
    const length = HASH_LENGTH[alg];
    if (!length) fail(`component ${id} hash algorithm ${alg} is not one of ${Object.keys(HASH_LENGTH).join(', ')}`);
    else if (!new RegExp(`^[0-9a-f]{${length}}$`).test(content ?? '')) {
      fail(`component ${id} ${alg} hash must be ${length} hex characters`);
    }
  }
}

function checkLicenses(c, id, fail, declared) {
  const licenses = c.licenses ?? [];
  if (licenses.length === 0) return fail(`component ${id} has no license`);
  for (const entry of licenses) {
    if (entry.expression !== undefined) {
      if (!isSpdxExpression(entry.expression))
        fail(`component ${id} license expression "${entry.expression}" is not SPDX`);
    } else if (entry.license?.id !== undefined) {
      if (!SPDX.isSupportedSpdxId(entry.license.id))
        fail(`component ${id} license id "${entry.license.id}" is not SPDX`);
    } else {
      fail(`component ${id} license ${JSON.stringify(entry.license?.name ?? entry)} is not an SPDX id or expression`);
    }
  }
  if (declared && !licenses.some((l) => l.license?.id === declared || l.expression === declared)) {
    fail(`component ${id} must declare the package.json license ${declared}`);
  }
}

export function loadProjectContext(root = projectRoot) {
  const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const lockPath = join(root, 'package-lock.json');
  const lockfile = existsSync(lockPath) ? JSON.parse(readFileSync(lockPath, 'utf8')) : undefined;
  return { packageJson, lockfile };
}

/** Validates a file, prints findings, returns true when valid. */
export async function validateSbomFile(file, ctx = loadProjectContext()) {
  if (!ctx.lockfile) {
    console.error('✗ package-lock.json not found: run `npm install` first, the SBOM is checked against it');
    return false;
  }
  if (!existsSync(file)) {
    console.error(`✗ ${file} not found: run \`npm run sbom\` first`);
    return false;
  }
  const errors = await validateSbom(JSON.parse(readFileSync(file, 'utf8')), ctx);
  for (const e of errors) console.error(`✗ ${e}`);
  if (errors.length > 0) {
    console.error(`\n${file}: ${errors.length} finding(s)`);
    return false;
  }
  console.log(`✓ ${file} is a valid CycloneDX ${SPEC_VERSION} SBOM`);
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const artifactIndex = args.indexOf('--artifact');
  const artifact = artifactIndex === -1 ? undefined : args.splice(artifactIndex, 2)[1];
  if (artifactIndex !== -1 && !(artifact && existsSync(artifact))) {
    console.error(`✗ --artifact: tarball not found: ${artifact}`);
    process.exit(1);
  }
  const ctx = { ...loadProjectContext(), artifact };
  const file = args[0] ?? join(projectRoot, 'sbom', sbomFileName(ctx.packageJson));
  validateSbomFile(file, ctx).then((ok) => process.exit(ok ? 0 : 1));
}
