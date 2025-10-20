export {
	checkExtensionSafety,
	type DatabaseStats,
	type ExtensionInfo,
	getAvailableExtensions,
	getDatabaseStats,
	getExtensions,
	getTableStats,
	resetExtensionStats,
	safeDropExtension,
	safeInstallExtension,
	type TableStats,
	updateExtension,
} from './monitoring';

export {
	activateOnlineAdvisor,
	applyIndexRecommendation,
	applyStatisticsRecommendation,
	checkOnlineAdvisorEnabled,
	checkPgStatStatementsEnabled,
	getCurrentUserInfo,
	getExecutorStats,
	getOnlineAdvisorIndexes,
	getOnlineAdvisorStatistics,
	getPerformanceMetrics,
	getPerformanceStatements,
	resetPerformanceStats,
} from './performance';

export {
	buildPostgresUrl,
	type PostgresConnectionInfo,
	parsePostgresUrl,
	testConnection,
} from './postgres';
