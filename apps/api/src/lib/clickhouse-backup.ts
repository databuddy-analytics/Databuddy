import { clickHouseOG, createClient } from "@databuddy/db";
import { env } from "@databuddy/env/api";
import { logger } from "@databuddy/shared/logger";

const backupClickHouse = createClient({
    url: env.CLICKHOUSE_URL,
    max_open_connections: 5,
    request_timeout: 3_600_000, // 1 hour
    keep_alive: {
        enabled: true,
        idle_socket_ttl: 8000,
    },
    compression: {
        request: true,
        response: true,
    },
});

export type BackupResult = {
    success: boolean;
    backupName?: string;
    backupPath?: string;
    error?: string;
    timestamp: string;
};

/**
 * Initialize backup tracking infrastructure
 * Creates internal database and backup tracking table
 */
async function ensureBackupTable(): Promise<void> {
    try {
        await clickHouseOG.command({
            query: "CREATE DATABASE IF NOT EXISTS internal",
        });

        await clickHouseOG.command({
            query: `
                CREATE TABLE IF NOT EXISTS internal.databuddy_backups (
                    backup_name String,
                    backup_path String,
                    backup_type Enum8('full' = 1, 'incremental' = 2),
                    base_backup_path String DEFAULT '',
                    size_bytes UInt64 DEFAULT 0,
                    compressed_size_bytes UInt64 DEFAULT 0,
                    num_files UInt64 DEFAULT 0,
                    timestamp DateTime DEFAULT now(),
                    status Enum8('started' = 1, 'completed' = 2, 'failed' = 3) DEFAULT 'started',
                    error String DEFAULT ''
                ) ENGINE = MergeTree()
                ORDER BY timestamp
            `,
        });
    } catch (error) {
        logger.error({ error }, "Failed to create backup tracking table");
    }
}

/**
 * Get the last successful backup path for incremental chain
 * Returns the most recent completed backup regardless of type
 */
async function getLastBackupPath(): Promise<string | null> {
    try {
        const result = await clickHouseOG.query({
            query: `
                SELECT backup_path
                FROM internal.databuddy_backups
                WHERE status = 'completed'
                ORDER BY timestamp DESC
                LIMIT 1
            `,
        });

        const data = await result.json<{ backup_path: string }>();
        return data.data[0]?.backup_path ?? null;
    } catch {
        return null;
    }
}

/**
 * Get backup metadata from ClickHouse system tables
 */
async function getBackupMetadata(backupName: string): Promise<{
    size_bytes: number;
    compressed_size_bytes: number;
    num_files: number;
} | null> {
    try {
        const result = await clickHouseOG.query({
            query: `
                SELECT 
                    total_size as size_bytes,
                    compressed_size as compressed_size_bytes,
                    num_files
                FROM system.backups
                WHERE name LIKE '%${backupName}%'
                AND status = 'BACKUP_CREATED'
                ORDER BY start_time DESC
                LIMIT 1
            `,
        });

        const data = await result.json<{
            size_bytes: string;
            compressed_size_bytes: string;
            num_files: string;
        }>();

        if (data.data[0]) {
            return {
                size_bytes: Number.parseInt(data.data[0].size_bytes, 10),
                compressed_size_bytes: Number.parseInt(
                    data.data[0].compressed_size_bytes,
                    10
                ),
                num_files: Number.parseInt(data.data[0].num_files, 10),
            };
        }

        return null;
    } catch {
        return null;
    }
}

/**
 * Creates a backup of ClickHouse database to S3-compatible storage
 * Automatically determines if incremental backup is possible
 * Supports AWS S3, Cloudflare R2, and Bunny Storage
 */
export async function performClickHouseBackup(): Promise<BackupResult> {
    const timestampStr = new Date().toISOString();
    const timestamp = timestampStr.replace(/[:.]/g, "-");
    const backupName = `databuddy-${timestamp}`;

    try {
        logger.info(`Starting ClickHouse backup: ${backupName}`);

        if (!env.R2_BUCKET) {
            logger.warn("R2_BUCKET not configured, skipping backup");
            return {
                success: false,
                error: "R2 backup not configured",
                timestamp: timestampStr,
            };
        }

        const r2Configured =
            env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_ENDPOINT;
        if (!r2Configured) {
            logger.warn("R2 credentials not configured, skipping backup");
            return {
                success: false,
                error: "R2 credentials not configured",
                timestamp: timestampStr,
            };
        }

        await ensureBackupTable();

        // Normalize endpoint (remove trailing slashes) and build path-style URL for Tigris/S3-compatible storage
        const endpoint = env.R2_ENDPOINT.replace(/\/+$/, '');
        const s3Url = `${endpoint}/${env.R2_BUCKET}/${backupName}`;
        const lastBackupPath = await getLastBackupPath();
        const isIncremental = lastBackupPath !== null;

        logger.info(
            `Backup type: ${isIncremental ? "incremental" : "full"}${isIncremental ? ` (base: ${lastBackupPath})` : ""}`
        );

        // Record backup start
        await clickHouseOG.command({
            query: `
                INSERT INTO internal.databuddy_backups (backup_name, backup_path, backup_type, base_backup_path, status)
                VALUES ('${backupName}', '${s3Url}', '${isIncremental ? "incremental" : "full"}', '${lastBackupPath ?? ""}', 'started')
            `,
        });

        // Build backup query with compression and throttling
        const baseBackupSetting = isIncremental
            ? `,base_backup = S3('${lastBackupPath}', '${env.R2_ACCESS_KEY_ID}', '${env.R2_SECRET_ACCESS_KEY}')`
            : "";

        const backupQuery = `
            BACKUP DATABASE analytics 
            TO S3('${s3Url}', '${env.R2_ACCESS_KEY_ID}', '${env.R2_SECRET_ACCESS_KEY}')
            SETTINGS 
                async = false,
                s3_max_redirects = 10,
                s3_retry_attempts = 5,
                s3_max_put_rps = 100,
                s3_max_put_burst = 50,
                compression_method = 'zstd',
                compression_level = 3,
                max_backup_bandwidth = 104857600,
                s3_use_virtual_addressing = false${baseBackupSetting}
        `;

        await backupClickHouse.command({ query: backupQuery });

        // Get backup metadata
        const metadata = await getBackupMetadata(backupName);
        const sizeMB = metadata
            ? (metadata.compressed_size_bytes / 1024 / 1024).toFixed(2)
            : "unknown";

        logger.info(
            `Backup completed: ${backupName} (${sizeMB}MB compressed, ${metadata?.num_files ?? 0} files)`
        );

        await clickHouseOG.command({
            query: `
                ALTER TABLE internal.databuddy_backups 
                UPDATE 
                    status = 'completed',
                    size_bytes = ${metadata?.size_bytes ?? 0},
                    compressed_size_bytes = ${metadata?.compressed_size_bytes ?? 0},
                    num_files = ${metadata?.num_files ?? 0}
                WHERE backup_name = '${backupName}'
            `,
        });

        return {
            success: true,
            backupName,
            backupPath: s3Url,
            timestamp: timestampStr,
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error({ error }, `ClickHouse backup failed: ${errorMessage}`);

        // Mark backup as failed
        try {
            await clickHouseOG.command({
                query: `
                    ALTER TABLE internal.databuddy_backups 
                    UPDATE status = 'failed', error = '${errorMessage.replace(/'/g, "\\'")}' 
                    WHERE backup_name = '${backupName}'
                `,
            });
        } catch { }

        return {
            success: false,
            error: errorMessage,
            timestamp: timestampStr,
        };
    }
}

/**
 * Lists available backups from tracking table
 */
export async function listBackups(): Promise<
    Array<{
        name: string;
        path: string;
        type: string;
        size_mb: number;
        compressed_size_mb: number;
        num_files: number;
        timestamp: string;
        status: string;
    }>
> {
    try {
        await ensureBackupTable();

        const result = await clickHouseOG.query({
            query: `
                SELECT 
                    backup_name as name,
                    backup_path as path,
                    backup_type as type,
                    round(size_bytes / 1024 / 1024, 2) as size_mb,
                    round(compressed_size_bytes / 1024 / 1024, 2) as compressed_size_mb,
                    num_files,
                    timestamp,
                    status
                FROM internal.databuddy_backups
                WHERE status = 'completed'
                ORDER BY timestamp DESC
                LIMIT 50
            `,
        });

        const backups = await result.json<{
            name: string;
            path: string;
            type: string;
            size_mb: number;
            compressed_size_mb: number;
            num_files: number;
            timestamp: string;
            status: string;
        }>();
        return backups.data;
    } catch (error) {
        logger.error({ error }, "Failed to list backups");
        return [];
    }
}

/**
 * Clean up old backups based on retention policy
 * Default retention: 30 days
 */
export async function cleanupOldBackups(retentionDays = 30): Promise<{
    success: boolean;
    deletedCount: number;
    error?: string;
}> {
    try {
        logger.info(`Starting backup cleanup (retention: ${retentionDays} days)`);

        await ensureBackupTable();

        // Get backups older than retention period
        const result = await clickHouseOG.query({
            query: `
                SELECT backup_name, backup_path
                FROM internal.databuddy_backups
                WHERE timestamp < now() - INTERVAL ${retentionDays} DAY
                AND status = 'completed'
                ORDER BY timestamp ASC
            `,
        });

        const oldBackups = await result.json<{
            backup_name: string;
            backup_path: string;
        }>();

        if (oldBackups.data.length === 0) {
            logger.info("No backups to clean up");
            return { success: true, deletedCount: 0 };
        }

        logger.info(
            `Found ${oldBackups.data.length} backups to clean up (tracking table only, manual R2 cleanup required)`
        );

        // Delete from tracking table
        await clickHouseOG.command({
            query: `
                DELETE FROM internal.databuddy_backups
                WHERE timestamp < now() - INTERVAL ${retentionDays} DAY
            `,
        });

        logger.info(
            `Cleaned up ${oldBackups.data.length} old backups from tracking table`
        );

        return {
            success: true,
            deletedCount: oldBackups.data.length,
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error({ error }, `Backup cleanup failed: ${errorMessage}`);

        return {
            success: false,
            deletedCount: 0,
            error: errorMessage,
        };
    }
}

/**
 * Restores a backup from S3
 * Supports both full database and table-level restore
 */
export async function restoreBackup(
    backupPath: string,
    options: {
        tables?: string[];
        database?: string;
    } = {}
): Promise<BackupResult> {
    const timestamp = new Date().toISOString();

    try {
        logger.info(`Starting ClickHouse restore from: ${backupPath}`);

        const r2Configured = env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY;
        if (!r2Configured) {
            logger.warn("R2 credentials not configured");
            return {
                success: false,
                error: "R2 credentials not configured",
                timestamp,
            };
        }

        const database = options.database ?? "analytics";
        const restoreTarget = options.tables
            ? `TABLE ${options.tables.map((t) => `${database}.${t}`).join(", ")}`
            : `DATABASE ${database}`;

        const restoreQuery = `
            RESTORE ${restoreTarget}
            FROM S3('${backupPath}', '${env.R2_ACCESS_KEY_ID}', '${env.R2_SECRET_ACCESS_KEY}')
            SETTINGS 
                async = false,
                s3_max_redirects = 10,
                s3_use_virtual_addressing = false
        `;

        await backupClickHouse.command({ query: restoreQuery });

        logger.info(`ClickHouse restore completed from: ${backupPath}`);

        return {
            success: true,
            backupPath,
            timestamp,
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error({ error }, `ClickHouse restore failed: ${errorMessage}`);

        return {
            success: false,
            error: errorMessage,
            timestamp,
        };
    }
}
