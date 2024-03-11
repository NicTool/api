# CHANGES

### Unreleased


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

### 3.0.0-alpha.3

- routes/permission: added GET, POST, DELETE
- permission.get: default search with deleted=0
- session.put: added
- session: store user/group info in cookie (saves DB trips)
- mysql(insert, select, update, delete): return just the query
- lib/group.get: convert booleans
- lib/user.get: convert booleans


[3.0.0-alpha.3]: https://github.com/NicTool/api/releases/tag/3.0.0-alpha.3
[3.0.0-alpha.4]: https://github.com/NicTool/api/releases/tag/3.0.0-alpha.4
[3.0.0-alpha.5]: https://github.com/NicTool/api/releases/tag/3.0.0-alpha.5
