-- 扩展 files 元数据；新表由 backend-init-db 的 SQLAlchemy metadata.create_all 创建。

SET @has_files_original_name = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'files' AND COLUMN_NAME = 'original_name');
SET @sql = IF(@has_files_original_name = 0, "ALTER TABLE files ADD COLUMN original_name VARCHAR(255) NOT NULL DEFAULT '' COMMENT '上传时原始文件名'", 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_files_mime_type = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'files' AND COLUMN_NAME = 'mime_type');
SET @sql = IF(@has_files_mime_type = 0, "ALTER TABLE files ADD COLUMN mime_type VARCHAR(128) NOT NULL DEFAULT '' COMMENT '文件 MIME 类型'", 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_files_size_bytes = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'files' AND COLUMN_NAME = 'size_bytes');
SET @sql = IF(@has_files_size_bytes = 0, "ALTER TABLE files ADD COLUMN size_bytes BIGINT NOT NULL DEFAULT 0 COMMENT '文件大小（字节）'", 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_files_duration_ms = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'files' AND COLUMN_NAME = 'duration_ms');
SET @sql = IF(@has_files_duration_ms = 0, "ALTER TABLE files ADD COLUMN duration_ms INT NULL COMMENT '音视频时长（毫秒）'", 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_files_width = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'files' AND COLUMN_NAME = 'width');
SET @sql = IF(@has_files_width = 0, "ALTER TABLE files ADD COLUMN width INT NULL COMMENT '图片或视频宽度'", 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_files_height = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'files' AND COLUMN_NAME = 'height');
SET @sql = IF(@has_files_height = 0, "ALTER TABLE files ADD COLUMN height INT NULL COMMENT '图片或视频高度'", 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_files_checksum = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'files' AND COLUMN_NAME = 'checksum');
SET @sql = IF(@has_files_checksum = 0, "ALTER TABLE files ADD COLUMN checksum VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'SHA-256 校验值'", 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
