import { applyClickHouseSchema } from "./apply";

(async () => {
	try {
		const result = await applyClickHouseSchema();
		console.info(
			`Applied ClickHouse schema: ${result.tables} tables, ${result.views} views across ${result.databases.join(", ")}`
		);
		process.exit(0);
	} catch (error) {
		console.error("Failed to apply ClickHouse schema:", error);
		process.exit(1);
	}
})();
