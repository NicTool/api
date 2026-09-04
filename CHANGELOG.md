# Changelog

The format is based on [Keep a Changelog](https://keepachangelog.com/).

# CHANGES

### Unreleased

- fix: reject create conflicts and duplicate permission targets
- create: allocate ids internally and reject caller-supplied ids
- fix(sql): seed ns export types coredns & native for 2.x upgrade

### [3.0.3] - 2026-07-27

- many updates for data stores and NS backends
- feat(mysql): new NS columns: engine, listen, publisher, transport, dnssec
- change: */store/toml -> */store/file
- change(sql/*.sql): made setup non-destructive
- feat: self describing password hashes (#56)

### [3.0.2] - 2026-07-25

- dep(rr): bump version
- fix: generate conf.d/http.toml on 1st start

### 3.0.0-alpha.13 - 2026-07-24

- fix(sql): quote mysql 8 keyword rank
- fix: subgroup searching
- feat: paginate zone records (#53)

### 3.0.0-alpha.12 - 2026-04-14

- toml backend (#49)
  - add: TOML stores for group, nameserver, permission, session (#47)
  - move mysql teardown/disconnect into mysql classes
- fix: don't log sensitive information
- routes file reorg (#46)
- factories for groups (#44)
- ci: remove local codeql config (#43)
- ci: update permissions to be explicit (#42)
- docker compose support + env var config overrides (#40)

### 3.0.0-alpha.11 - 2026-04-07

- decorate user & group with permissions
- add some missing PUT routes
- better error handling validation errors
- constraining views by GID
- zone record factory & subclasses
- zone factory & subclasses
- user factory, toml, mysql, mongodb, elastic classes

### 3.0.0-alpha.10 - 2026-03-25

- config: replace .yaml with .toml
- zone_record can be empty, default 0
- feat(zone records): create and delete

### 3.0.0-alpha.9 - 2026-03-15

- feat(zone): use DataTable for list, added search/limit options
- routes/zr: add extra data about ZR parse failures

### 3.0.0-alpha.8 - 2026-03-14

- lib/zone: add limit option
- lib/nameserver.js: handle null fields from DB
- routes/zone: report zone name on validation failure

### 3.0.0-alpha.6 - 2025-04-08

- dep(eslint): upgraded to v9
- dep(\*): bump versions to latest
- feat(conf.d/http): added tls
- feat(session): added JWT for session auth
- feat(zone): removed location
- feat(routes/zone_record): added, fixes #17
- change(routes/users): result is always array
- change(routes/ns): GET id is optional, result is always array
- change(routes/zone): GET id is optional, result is always array

### 3.0.0-alpha.5 - 2024-03-06

- feat(lib/zone): added, with tests, fixes #22
- feat(lib/zone_record): added, with tests, fixes #23
- feat: default GET sets deleted=false
  - group, nameserver, permission, user, zone
- sql: return indicative boolean for delete
- test(zr): added maps from NT SQL 2 to dns-rr std formats

### 3.0.0-alpha.4 - 2024-03-05

- feat(lib/nameserver): added, with tests
- feat(routes/nameserver): added, with tests

### 3.0.0-alpha.3

- routes/permission: added GET, POST, DELETE
- permission.get: default search with deleted=0
- session.put: added
- session: store user/group info in cookie (saves DB trips)
- mysql(insert, select, update, delete): return just the query
- lib/group.get: convert booleans
- lib/user.get: convert booleans

[3.0.2]: https://github.com/NicTool/api/releases/tag/v3.0.2
[3.0.3]: https://github.com/NicTool/api/releases/tag/v3.0.3
[3.0.0-alpha.0]: https://github.com/NicTool/api/releases/tag/3.0.0-alpha.0
[3.0.0-alpha.1]: https://github.com/NicTool/api/releases/tag/3.0.0-alpha.1
[3.0.0-alpha.2]: https://github.com/NicTool/api/releases/tag/3.0.0-alpha.2
[3.0.0-alpha.3]: https://github.com/NicTool/api/releases/tag/3.0.0-alpha.3
[3.0.0-alpha.4]: https://github.com/NicTool/api/releases/tag/3.0.0-alpha.4
[3.0.0-alpha.5]: https://github.com/NicTool/api/releases/tag/3.0.0-alpha.5
[3.0.0-alpha.6]: https://github.com/NicTool/api/releases/tag/3.0.0-alpha.6
[3.0.0-alpha.9]: https://github.com/NicTool/api/releases/tag/3.0.0-alpha.9
[3.0.0]: https://github.com/NicTool/api/releases/tag/v3.0.0
[3.0.0-alpha.10]: https://github.com/NicTool/api/releases/tag/v3.0.0-alpha.10
[3.0.0-alpha.11]: https://github.com/NicTool/api/releases/tag/v3.0.0-alpha.11
[3.0.0-alpha.12]: https://github.com/NicTool/api/releases/tag/v3.0.0-alpha.12
[3.0.0-alpha.13]: https://github.com/NicTool/api/releases/tag/v3.0.0-alpha.13
[3.0.0-alpha.7]: https://github.com/NicTool/api/releases/tag/v3.0.0-alpha.7
[3.0.0-alpha.8]: https://github.com/NicTool/api/releases/tag/v3.0.0-alpha.8
