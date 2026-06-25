# Third-Party Notices

HADAF is proprietary software. This notice lists external packages currently used by this private product workspace and does not grant a public licence to HADAF.

Supply-chain graph SHA-256: `c0ecda92c1954c66488d51888035bd29f107e9fad394063096da44269885563e`

Remote package provenance attestation is not available in H00-CORR-004; provenance is bounded to the committed pnpm lockfile and installed package metadata.

## External Packages

### @types/node 22.20.0

- Licence: MIT
- Scope: direct
- Dependency of: hadaf
- Provenance: pnpm lockfile integrity and installed package metadata
- Repository: https://github.com/DefinitelyTyped/DefinitelyTyped.git
- Homepage: https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/node

### ajv-formats 3.0.1

- Licence: MIT
- Scope: direct
- Dependency of: hadaf
- Provenance: pnpm lockfile integrity and installed package metadata
- Repository: git+https://github.com/ajv-validator/ajv-formats.git
- Homepage: https://github.com/ajv-validator/ajv-formats#readme

### ajv 8.20.0

- Licence: MIT
- Scope: direct
- Dependency of: ajv-formats@3.0.1, hadaf
- Provenance: pnpm lockfile integrity and installed package metadata
- Repository: ajv-validator/ajv
- Homepage: https://ajv.js.org

### fast-deep-equal 3.1.3

- Licence: MIT
- Scope: transitive
- Dependency of: ajv@8.20.0
- Provenance: pnpm lockfile integrity and installed package metadata
- Repository: git+https://github.com/epoberezkin/fast-deep-equal.git
- Homepage: https://github.com/epoberezkin/fast-deep-equal#readme

### fast-uri 3.1.2

- Licence: BSD-3-Clause
- Scope: transitive
- Dependency of: ajv@8.20.0
- Provenance: pnpm lockfile integrity and installed package metadata
- Repository: git+https://github.com/fastify/fast-uri.git
- Homepage: https://github.com/fastify/fast-uri

### json-schema-traverse 1.0.0

- Licence: MIT
- Scope: transitive
- Dependency of: ajv@8.20.0
- Provenance: pnpm lockfile integrity and installed package metadata
- Repository: git+https://github.com/epoberezkin/json-schema-traverse.git
- Homepage: https://github.com/epoberezkin/json-schema-traverse#readme

### require-from-string 2.0.2

- Licence: MIT
- Scope: transitive
- Dependency of: ajv@8.20.0
- Provenance: pnpm lockfile integrity and installed package metadata
- Repository: floatdrop/require-from-string

### typescript 6.0.3

- Licence: Apache-2.0
- Scope: direct
- Dependency of: hadaf
- Provenance: pnpm lockfile integrity and installed package metadata
- Repository: https://github.com/microsoft/TypeScript.git
- Homepage: https://www.typescriptlang.org/

### undici-types 6.21.0

- Licence: MIT
- Scope: transitive
- Dependency of: @types/node@22.20.0
- Provenance: pnpm lockfile integrity and installed package metadata
- Repository: git+https://github.com/nodejs/undici.git
- Homepage: https://undici.nodejs.org
