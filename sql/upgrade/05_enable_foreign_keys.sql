# Copyright 2004-2024 The Network People, Inc.
#
# Adds the referential constraints to a database created while they were
# disabled. New installs get these from sql/*.sql instead.
#
# Run 04_clear_orphan_rows.sql first: adding a constraint rebuilds the table,
# which re-validates every row. A failure with errno 150 means orphan rows
# remain; errno 1292 means a zero datetime does.
#
# Idempotent — each constraint is added only if absent, so this can be re-run
# after a partial failure without erroring on what already landed.
#
#   mysql nictool < 05_enable_foreign_keys.sql

DROP PROCEDURE IF EXISTS nt_add_fk;

DELIMITER //

CREATE PROCEDURE nt_add_fk(IN tbl VARCHAR(64), IN fk VARCHAR(64), IN clause TEXT)
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
         WHERE CONSTRAINT_SCHEMA = DATABASE()
           AND TABLE_NAME        = tbl
           AND CONSTRAINT_NAME   = fk
           AND CONSTRAINT_TYPE   = 'FOREIGN KEY'
    ) THEN
        SET @nt_ddl = CONCAT('ALTER TABLE `', tbl, '` ADD CONSTRAINT `', fk, '` ', clause);
        PREPARE nt_stmt FROM @nt_ddl;
        EXECUTE nt_stmt;
        DEALLOCATE PREPARE nt_stmt;
    END IF;
END //

DELIMITER ;

CALL nt_add_fk('nt_group_log', 'nt_group_log_ibfk_1',
    'FOREIGN KEY (`nt_group_id`) REFERENCES `nt_group` (`nt_group_id`) ON DELETE CASCADE ON UPDATE CASCADE');

CALL nt_add_fk('nt_group_subgroups', 'nt_group_subgroups_ibfk_1',
    'FOREIGN KEY (`nt_group_id`) REFERENCES `nt_group` (`nt_group_id`) ON DELETE CASCADE ON UPDATE CASCADE');

CALL nt_add_fk('nt_user_session', 'nt_user_session_ibfk_1',
    'FOREIGN KEY (`nt_user_id`) REFERENCES `nt_user` (`nt_user_id`) ON DELETE CASCADE ON UPDATE CASCADE');

CALL nt_add_fk('nt_user_session_log', 'nt_user_session_log_ibfk_1',
    'FOREIGN KEY (`nt_user_id`) REFERENCES `nt_user` (`nt_user_id`) ON DELETE CASCADE ON UPDATE CASCADE');

CALL nt_add_fk('nt_user_global_log', 'nt_user_global_log_ibfk_1',
    'FOREIGN KEY (`nt_user_id`) REFERENCES `nt_user` (`nt_user_id`) ON DELETE CASCADE ON UPDATE CASCADE');

CALL nt_add_fk('nt_nameserver', 'nt_nameserver_ibfk_1',
    'FOREIGN KEY (`nt_group_id`) REFERENCES `nt_group` (`nt_group_id`) ON DELETE CASCADE ON UPDATE CASCADE');

CALL nt_add_fk('nt_delegate', 'nt_delegate_ibfk_1',
    'FOREIGN KEY (`nt_group_id`) REFERENCES `nt_group` (`nt_group_id`) ON DELETE CASCADE ON UPDATE CASCADE');

CALL nt_add_fk('nt_zone_log', 'nt_zone_log_ibfk_1',
    'FOREIGN KEY (`nt_zone_id`) REFERENCES `nt_zone` (`nt_zone_id`) ON DELETE CASCADE ON UPDATE CASCADE');

CALL nt_add_fk('nt_zone_log', 'nt_zone_log_ibfk_2',
    'FOREIGN KEY (`nt_group_id`) REFERENCES `nt_group` (`nt_group_id`) ON DELETE CASCADE ON UPDATE CASCADE');

CALL nt_add_fk('nt_zone_log', 'nt_zone_log_ibfk_3',
    'FOREIGN KEY (`nt_user_id`) REFERENCES `nt_user` (`nt_user_id`) ON DELETE CASCADE ON UPDATE CASCADE');

CALL nt_add_fk('nt_zone_record', 'nt_zone_record_ibfk_1',
    'FOREIGN KEY (`nt_zone_id`) REFERENCES `nt_zone` (`nt_zone_id`) ON DELETE CASCADE ON UPDATE CASCADE');

CALL nt_add_fk('nt_zone_record_log', 'nt_zone_record_log_ibfk_1',
    'FOREIGN KEY (`nt_zone_id`) REFERENCES `nt_zone` (`nt_zone_id`) ON DELETE CASCADE ON UPDATE CASCADE');

CALL nt_add_fk('nt_zone_record_log', 'nt_zone_record_log_ibfk_2',
    'FOREIGN KEY (`nt_user_id`) REFERENCES `nt_user` (`nt_user_id`) ON DELETE CASCADE ON UPDATE CASCADE');

CALL nt_add_fk('nt_zone_record_log', 'nt_zone_record_log_ibfk_3',
    'FOREIGN KEY (`nt_zone_record_id`) REFERENCES `nt_zone_record` (`nt_zone_record_id`) ON DELETE CASCADE ON UPDATE CASCADE');

DROP PROCEDURE nt_add_fk;
