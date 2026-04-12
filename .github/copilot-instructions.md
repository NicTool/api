# NicTool API Copilot Instructions

## Commands

- Install dependencies: `npm install`
- Start the API in production mode: `npm run start`
- Start the API in watch mode: `npm run develop`
- Run the full test suite: `npm test`
- Run one test file with fixture setup/teardown: `npm test -- routes/session.test.js`
- Run one library test file with fixture setup/teardown: `npm test -- lib/config.test.js`
- Run tests in watch mode: `npm run watch`
- Run lint: `npm run lint`
- Run formatting check: `npm run prettier`
- Run coverage: `npm run test:coverage`

Local tests expect MySQL plus the NicTool schema. CI initializes it with `sh sql/init-mysql.sh`, and `test.sh` recreates fixtures before each run.

## Architecture

- `server.js` only starts the Hapi server from `routes/index.js`.
- `routes/index.js` is the composition root: it loads TOML config via `lib/config.js`, registers Hapi plugins, configures JWT auth as the default auth strategy, enables Swagger docs, and mounts each resource route module.
- `routes/*.js` own HTTP concerns only. They validate requests and responses with `@nictool/validate`, coerce route/query params, call the corresponding `lib/` module, and return NicTool’s standard JSON envelope with resource data plus `meta.api.version`.
- `lib/<resource>/index.js` is usually a backend selector. The active implementation comes from `NICTOOL_DATA_STORE` and defaults to MySQL; some resources also support TOML, MongoDB, or Elasticsearch backends.
- The real persistence logic lives under `lib/<resource>/store/*.js`. These stores translate between API-friendly field names and the legacy NicTool schema (`nt_*` columns), using helpers like `mapToDbColumn`, `objectToDb`, and `dbToObject`.
- `lib/mysql.js` is the shared query builder/executor. Repositories rely on it for SQL generation rather than embedding ad hoc parameter handling in route files.
- Auth is session-backed but bearer-token based: `POST /session` authenticates through the user repo, creates an `nt_user_session` row via `lib/user/session.js`, and returns a JWT. Almost every other route runs under the default JWT auth strategy.
- Group, user, and permission behavior is coupled. Group creation also creates a group-level permission row, user reads attach effective permissions, and permission resolution falls back from explicit user permissions to group permissions.
- DNS data has an extra translation layer. `lib/zone_record/store/mysql.js` validates records with `@nictool/dns-resource-record` and maps NicTool’s legacy zone-record columns to RFC-style record fields.
- Config comes from `conf.d/*.toml`, with runtime overrides from `NICTOOL_DB_*` and `NICTOOL_HTTP_*`. `lib/config.js` also auto-loads TLS material from any `.pem` file in `conf.d/`.

## Conventions

- Preserve the route/lib split: request parsing, auth, and response shaping stay in `routes/`; DB and domain logic stay in `lib/`.
- Keep request and response schemas in sync with `@nictool/validate`. Route handlers consistently declare both `validate` and `response.schema`.
- Return the existing response envelope shape instead of raw rows. Resource payloads use keys like `user`, `group`, `zone`, `zone_record`, or `nameserver`, and responses include `meta: { api, msg }`.
- Default auth is global. New public routes must opt out explicitly with route-level auth config, like `auth: { mode: 'try' }` on `POST /session`.
- Soft delete is the default behavior across repositories. `delete()` usually sets `deleted = 1`, reads hide deleted rows unless `deleted: true` or `?deleted=true` is passed, and `destroy()` is reserved for hard-delete cleanup in tests or fixtures.
- Reuse the legacy-schema mapping helpers instead of hand-rolling field conversions. Most repos convert booleans, nested permission/export objects, and short API names into the older DB layout before writing and normalize them again on read.
- When changing group or user behavior, check permission side effects too. Group creation/update touches permission rows, and user reads/write paths may change `inherit_group_permissions` handling.
- Route tests use `init()` plus `server.inject()` instead of booting a live server. They usually establish auth by calling `POST /session` and then pass `Authorization: Bearer <token>` to protected routes.
- The test entrypoint is `test.sh`, not raw `node --test`, when you need DB-backed behavior. It tears fixtures down, recreates them, and then runs the requested test target.
- Zone-record changes must preserve the existing record-field translation logic. Special cases like zero `weight`/`priority` retention for `SRV`, `URI`, `HTTPS`, and `SVCB` are intentional.
