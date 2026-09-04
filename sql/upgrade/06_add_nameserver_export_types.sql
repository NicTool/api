# Copyright 2004-2026 The Network People, Inc.
#
# The nameserver export types NicTool 3.0 added. A database created by 2.x
# stops at knot (id 8), so an upgraded install cannot create a coredns or a
# native nameserver.
#
# Idempotent, so it is safe to re-run:
#
#   mysql nictool < 06_add_nameserver_export_types.sql
#
# A duplicate-entry failure on the ALTER means the table already holds two
# rows with the same name; drop the one no nameserver references first.

SET @have_name_key = (
    SELECT COUNT(*) FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 'nt_nameserver_export_type'
       AND INDEX_NAME   = 'name'
);

SET @nt_ddl = IF(@have_name_key, 'DO 0',
    'ALTER TABLE `nt_nameserver_export_type` ADD UNIQUE KEY `name` (`name`)');

PREPARE nt_stmt FROM @nt_ddl;
EXECUTE nt_stmt;
DEALLOCATE PREPARE nt_stmt;

INSERT IGNORE INTO `nt_nameserver_export_type` (`name`, `descr`, `url`)
VALUES ('coredns','CoreDNS','coredns.io'),
       ('native','NicTool (in-process)','nictool.com');
