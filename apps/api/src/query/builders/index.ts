import { CustomEventsBuilders } from "./custom-events";
import { DevicesBuilders } from "./devices";
import { EngagementBuilders } from "./engagement";
import { ErrorsBuilders } from "./errors";
import { GeoBuilders } from "./geo";
import { LinksBuilders } from "./links";
import { PagesBuilders } from "./pages";
import { PerformanceBuilders } from "./performance";
import { ProfilesBuilders } from "./profiles";
import { SessionsBuilders } from "./sessions";
import { SummaryBuilders } from "./summary";
import { TrafficBuilders } from "./traffic";
import { VitalsBuilders } from "./vitals";

export const QueryBuilders = {
	...SummaryBuilders,
	...PagesBuilders,
	...TrafficBuilders,
	...DevicesBuilders,
	...GeoBuilders,
	...ErrorsBuilders,
	...PerformanceBuilders,
	...SessionsBuilders,
	...CustomEventsBuilders,
	...ProfilesBuilders,
	...LinksBuilders,
	...EngagementBuilders,
	...VitalsBuilders,
};

export type QueryType = keyof typeof QueryBuilders;
