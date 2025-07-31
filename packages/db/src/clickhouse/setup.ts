import { initClickHouseSchema } from './schema';

(async () => {
	const result = await initClickHouseSchema();
	if (result.success) {
		console.info(result.message);
		process.exit(0);
	} else {
		console.error(result.message);
		if (result.error) {
			console.error(result.error);
		}
		process.exit(1);
	}
})();
