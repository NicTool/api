# Copyright 2004-2026 The Network People, Inc.
#
# Add the nameserver export types introduced in NicTool 3.0 without
# changing existing ids.

INSERT INTO `nt_nameserver_export_type` (`name`, `descr`, `url`)
SELECT 'coredns', 'CoreDNS', 'coredns.io'
FROM DUAL
WHERE NOT EXISTS (
    SELECT 1 FROM `nt_nameserver_export_type` WHERE `name` = 'coredns'
);

INSERT INTO `nt_nameserver_export_type` (`name`, `descr`, `url`)
SELECT 'native', 'NicTool (in-process)', 'nictool.com'
FROM DUAL
WHERE NOT EXISTS (
    SELECT 1 FROM `nt_nameserver_export_type` WHERE `name` = 'native'
);
