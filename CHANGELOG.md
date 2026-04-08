# Changelog

The format is based on [Keep a Changelog](https://keepachangelog.com/).

# CHANGES

### Unreleased

### [3.0.0-alpha.11] - 2026-04-07

- decorate user & group with permissions
- add some missing PUT routes
- better error handling validation errors
- constraining views by GID
- zone record factory & subclasses
- zone factory & subclasses
- user factory, toml, mysql, mongodb, elastic classes

### [3.0.0-alpha.10] - 2026-03-25

- config: replace .yaml with .toml
- zone_record can be empty, default 0
- feat(zone records): create and delete

### [3.0.0-alpha.9] - 2026-03-15

- feat(zone): use DataTable for list, added search/limit options
- routes/zr: add extra data about ZR parse failures

### [3.0.0-alpha.8] - 2026-03-14

- lib/zone: add limit option
- lib/nameserver.js: handle null fields from DB
- routes/zone: report zone name on validation failure

### [3.0.0-alpha.6] - 2025-04-08

- dep(eslint): upgraded to v9
- dep(\*): bump versions to latest
- feat(conf.d/http): added tls
- feat(session): added JWT for session auth
- feat(zone): removed location
- feat(routes/zone_record): added, fixes #17
- change(routes/users): result is always array
- change(routes/ns): GET id is optional, result is always array
- change(routes/zone): GET id is optional, result is always array

### [3.0.0-alpha.5] - 2024-03-06

- feat(lib/zone): added, with tests, fixes #22
- feat(lib/zone_record): added, with tests, fixes #23
- feat: default GET sets deleted=false
  - group, nameserver, permission, user, zone
- sql: return indicative boolean for delete
- test(zr): added maps from NT SQL 2 to dns-rr std formats

### [3.0.0-alpha.4] - 2024-03-05

- feat(lib/nameserver): added, with tests
- feat(routes/nameserver): added, with tests

### [3.0.0-alpha.3]

- routes/permission: added GET, POST, DELETE
- permission.get: default search with deleted=0
- session.put: added
- session: store user/group info in cookie (saves DB trips)
- mysql(insert, select, update, delete): return just the query
- lib/group.get: convert booleans
- lib/user.get: convert booleans


[3.0.0-alpha.0]: https://github.com/NicTool/api/releases/tag/3.0.0-alpha.0
[3.0.0-alpha.1]: https://github.com/NicTool/api/releases/tag/3.0.0-alpha.1
[3.0.0-alpha.2]: https://github.com/NicTool/api/releases/tag/3.0.0-alpha.2
[3.0.0-alpha.3]: https://github.com/NicTool/api/releases/tag/3.0.0-alpha.3
[3.0.0-alpha.4]: https://github.com/NicTool/api/releases/tag/3.0.0-alpha.4
[3.0.0-alpha.5]: https://github.com/NicTool/api/releases/tag/3.0.0-alpha.5
[3.0.0-alpha.6]: https://github.com/NicTool/api/releases/tag/3.0.0-alpha.6
[3.0.0-alpha.7]: https://github.com/NicTool/api/releases/tag/v3.0.0-alpha.7
[3.0.0-alpha.8]: https://github.com/NicTool/api/releases/tag/v3.0.0-alpha.8
[3.0.0-alpha.9]: https://github.com/NicTool/api/releases/tag/v3.0.0-alpha.9
[3.0.0-alpha.10]: https://github.com/NicTool/api/releases/tag/v3.0.0-alpha.10
[3.0.0-alpha.11]: https://github.com/NicTool/api/releases/tag/v3.0.0-alpha.11
