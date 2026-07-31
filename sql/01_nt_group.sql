#
# Copyright 2001 Dajoba, LLC - <info@dajoba.com>
# Copyright 2004-2024 The Network People, Inc.

CREATE TABLE IF NOT EXISTS `nt_group` (
    nt_group_id       INT UNSIGNED NOT NULL AUTO_INCREMENT,
    parent_group_id   INT UNSIGNED NOT NULL DEFAULT 0,
    name              varchar(255) NOT NULL,
    deleted           tinyint(1) unsigned NOT NULL DEFAULT 0,
    PRIMARY KEY (`nt_group_id`),
    KEY `nt_group_idx1` (`parent_group_id`),
    KEY `nt_group_idx2` (`name`(191)),
    KEY `nt_group_idx3` (`deleted`)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;


CREATE TABLE IF NOT EXISTS nt_group_log(
    nt_group_log_id     INT UNSIGNED NOT NULL AUTO_INCREMENT,
    nt_group_id         INT UNSIGNED NOT NULL,
    nt_user_id          INT UNSIGNED NOT NULL,
    action              ENUM('added','modified','deleted','moved') NOT NULL,
    timestamp           INT UNSIGNED NOT NULL,
    modified_group_id   INT UNSIGNED NOT NULL,
    parent_group_id     INT UNSIGNED,
    name                VARCHAR(255),
    PRIMARY KEY (`nt_group_log_id`),
    KEY `nt_group_log_idx1` (`nt_group_id`),
    KEY `nt_group_log_idx2` (`timestamp`),
    CONSTRAINT `nt_group_log_ibfk_1` FOREIGN KEY (`nt_group_id`) REFERENCES `nt_group` (`nt_group_id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin ROW_FORMAT=COMPRESSED;


CREATE TABLE IF NOT EXISTS nt_group_subgroups(
    nt_group_id         INT UNSIGNED NOT NULL,
    nt_subgroup_id      INT UNSIGNED NOT NULL,
    `rank`              INT UNSIGNED NOT NULL,
    KEY `nt_group_subgroups_idx1` (`nt_group_id`),
    KEY `nt_group_subgroups_idx2` (`nt_subgroup_id`),
    CONSTRAINT `nt_group_subgroups_ibfk_1` FOREIGN KEY (`nt_group_id`) REFERENCES `nt_group` (`nt_group_id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

INSERT IGNORE INTO `nt_group` (`nt_group_id`, `parent_group_id`, `name`)
VALUES
    (1,0,'NicTool');

# The log row carries no explicit id and nt_group_log has no unique key over
# these columns, guard on the row already being there.
INSERT INTO nt_group_log(nt_group_id, nt_user_id, action, timestamp, modified_group_id, parent_group_id)
SELECT 1, 1, 'added', UNIX_TIMESTAMP(), 1, 0
FROM DUAL WHERE NOT EXISTS
    (SELECT 1 FROM nt_group_log WHERE modified_group_id=1 AND action='added');
