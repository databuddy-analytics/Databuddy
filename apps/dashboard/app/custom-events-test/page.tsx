'use client';

import { useState } from 'react';
import {
	executeCustomSQL,
	sendAPIRequestEvent,
	sendBatchCustomEvents,
	sendCustomEvent,
} from './actions';

const getSQLExamples = () => [
	// Basic analytics queries
	`SELECT
  event_name,
  count() as total_events,
  uniq(anonymous_id) as unique_users,
  uniq(session_id) as unique_sessions
FROM analytics.custom_events
WHERE timestamp >= now() - INTERVAL 7 DAY
GROUP BY event_name
ORDER BY total_events DESC`,

	// Properties-based queries
	`SELECT
  properties.source AS source,
  properties.category AS category,
  count() as events,
  uniq(anonymous_id) as users
FROM analytics.custom_events
WHERE
  timestamp >= now() - INTERVAL 30 DAY
  AND properties.source IS NOT NULL
GROUP BY properties.source, properties.category
ORDER BY events DESC
LIMIT 10`,

	// Time-based analysis
	`SELECT
  toStartOfHour(timestamp) as hour,
  event_name,
  count() as events_per_hour
FROM analytics.custom_events
WHERE timestamp >= now() - INTERVAL 24 HOUR
GROUP BY hour, event_name
ORDER BY hour DESC, events_per_hour DESC
LIMIT 20`,

	// Revenue analysis
	`SELECT
  properties.product_id:int as product_id,
  sum(properties.value:float) as total_revenue,
  count() as purchases
FROM analytics.custom_events
WHERE
  timestamp >= now() - INTERVAL 30 DAY
  AND event_name = 'purchase'
  AND properties.value:float > 0
GROUP BY properties.product_id:int
ORDER BY total_revenue DESC
LIMIT 10`,

	// User behavior analysis
	`SELECT
  anonymous_id,
  count() as total_events,
  min(timestamp) as first_event,
  max(timestamp) as last_event
FROM analytics.custom_events
WHERE timestamp >= now() - INTERVAL 7 DAY
GROUP BY anonymous_id
HAVING total_events > 5
ORDER BY total_events DESC
LIMIT 20`,

	// "Malicious" but blocked patterns (these should be rejected by the API)
	'SELECT * FROM analytics.custom_events; DROP TABLE analytics.custom_events; --',

	// Another blocked pattern
	'SELECT * FROM analytics.custom_events WHERE 1=1 UNION SELECT * FROM analytics.errors --',

	// Properties syntax abuse (should be handled safely)
	"SELECT JSONExtractInt(properties, 'user_id') as user_id, JSONExtractString(properties, 'password') as password FROM analytics.custom_events",

	// Complex query with CTE
	`WITH user_stats AS (
  SELECT
    anonymous_id,
    count() as event_count,
    min(timestamp) as first_seen
  FROM analytics.custom_events
  WHERE timestamp >= now() - INTERVAL 30 DAY
  GROUP BY anonymous_id
)
SELECT
  us.anonymous_id,
  us.event_count,
  us.first_seen,
  ce.event_name,
  count() as event_type_count
FROM user_stats us
JOIN analytics.custom_events ce ON us.anonymous_id = ce.anonymous_id
WHERE ce.timestamp >= now() - INTERVAL 30 DAY
GROUP BY us.anonymous_id, us.event_count, us.first_seen, ce.event_name
ORDER BY us.event_count DESC, event_type_count DESC
LIMIT 50`,

	// Navigation analytics using properties.section
	`SELECT
  properties.section AS section,
  properties.item AS item,
  count() as clicks,
  uniq(anonymous_id) as unique_users
FROM analytics.custom_events
WHERE 
  event_name = 'navbar-nav-click'
  AND timestamp >= now() - INTERVAL 7 DAY
  AND properties.section IS NOT NULL
GROUP BY properties.section, properties.item
ORDER BY clicks DESC`,

	// Button click analysis with properties
	`SELECT
  properties.button_text AS button_text,
  properties.page_path AS page_path,
  properties.section AS section,
  count() as clicks,
  uniq(session_id) as unique_sessions
FROM analytics.custom_events
WHERE 
  event_name = 'button-click'
  AND timestamp >= now() - INTERVAL 24 HOUR
GROUP BY properties.button_text, properties.page_path, properties.section
ORDER BY clicks DESC
LIMIT 20`,

	// Form interaction tracking
	`SELECT
  properties.form_name AS form_name,
  properties.field_name AS field_name,
  properties.action AS action,
  count() as interactions
FROM analytics.custom_events
WHERE 
  event_name IN ('form-field-focus', 'form-field-blur', 'form-submit')
  AND timestamp >= now() - INTERVAL 3 DAY
  AND properties.form_name IS NOT NULL
GROUP BY properties.form_name, properties.field_name, properties.action
ORDER BY interactions DESC`,

	// Feature usage analysis
	`SELECT
  properties.feature_name AS feature_name,
  properties.user_plan AS user_plan,
  count() as usage_count,
  uniq(anonymous_id) as unique_users,
  countIf(properties.success = 'true') as successful_uses
FROM analytics.custom_events
WHERE 
  event_name = 'feature-used'
  AND timestamp >= now() - INTERVAL 14 DAY
GROUP BY properties.feature_name, properties.user_plan
ORDER BY usage_count DESC`,

	// Search behavior analysis
	`SELECT
  properties.search_term AS search_term,
  properties.search_category AS search_category,
  properties.results_count:int as results_count,
  count() as search_count,
  avg(properties.results_count:int) as avg_results
FROM analytics.custom_events
WHERE 
  event_name = 'search-performed'
  AND timestamp >= now() - INTERVAL 7 DAY
  AND properties.search_term IS NOT NULL
GROUP BY properties.search_term, properties.search_category, properties.results_count:int
HAVING search_count > 1
ORDER BY search_count DESC
LIMIT 25`,

	// API Request Analysis with Parameters (matches user's example)
	`SELECT 
  toStartOfMonth(timestamp) as month_start,
  countIf(properties.success = 'true') as success,
  count() as total_requests
FROM analytics.custom_events
WHERE 
  event_name = 'api_request'
  AND properties.workspaceId = '\${workspaceId}'
  AND timestamp >= toDateTime(\${cutoffTimestamp})
GROUP BY month_start
ORDER BY month_start DESC
LIMIT 24`,

	// Workspace Activity with Parameters
	`SELECT
  properties.workspaceId as workspace_id,
  properties.type as request_type,
  count() as total_requests,
  countIf(properties.success = 'true') as successful_requests,
  countIf(properties.deniedReason IS NOT NULL) as denied_requests
FROM analytics.custom_events
WHERE 
  event_name = 'api_request'
  AND properties.workspaceId = '\${workspaceId}'
  AND timestamp >= now() - INTERVAL \${daysPeriod} DAY
GROUP BY properties.workspaceId, properties.type
ORDER BY total_requests DESC`,

	// Project Activity with Template Literals
	`SELECT
  properties.projectId as project_id,
  properties.apiCallName as api_call,
  properties.languageCode as language,
  count() as usage_count,
  avg(properties.responseSize) as avg_response_size
FROM analytics.custom_events
WHERE 
  event_name = 'api_request'
  AND properties.projectId = '\${projectId}'
  AND properties.workspaceId = '\${workspaceId}'
  AND timestamp >= toDateTime(\${startTimestamp})
GROUP BY properties.projectId, properties.apiCallName, properties.languageCode
ORDER BY usage_count DESC
LIMIT \${limitRows}`,

	// Error Analysis with Parameters
	`SELECT
  properties.deniedReason as error_reason,
  properties.type as request_type,
  count() as error_count,
  uniq(properties.projectId) as affected_projects
FROM analytics.custom_events
WHERE 
  event_name = 'api_request'
  AND properties.workspaceId = '\${workspaceId}'
  AND properties.success = 'false'
  AND timestamp >= now() - INTERVAL \${daysPeriod} DAY
GROUP BY properties.deniedReason, properties.type
ORDER BY error_count DESC`,
];

const generateRandomId = () => Math.random().toString(36).substring(2, 15);
const generateRandomSessionId = () => `session_${generateRandomId()}`;
const generateRandomAnonymousId = () => `anon_${generateRandomId()}`;

const createInitialFormData = () => ({
	clientId: 'OXmNQsViBT-FOS_wZCTHc',
	apiKey: '',
	name: 'test_event',
	anonymousId: generateRandomAnonymousId(),
	sessionId: generateRandomSessionId(),
	properties: JSON.stringify(
		{
			value: Math.floor(Math.random() * 1000),
			currency: 'USD',
			category: 'test',
			source: 'dashboard',
		},
		null,
		2
	),
});

const createInitialSqlParameters = () =>
	JSON.stringify(
		{
			workspaceId: `workspace_${generateRandomId()}`,
			cutoffTimestamp: Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60, // 30 days ago
			daysPeriod: 30,
			projectId: `project_${generateRandomId()}`,
			startTimestamp: Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60, // 7 days ago
			limitRows: 20,
		},
		null,
		2
	);

const createInitialApiRequestData = () => ({
	projectId: `project_${generateRandomId()}`,
	elementId: `elem_${generateRandomId()}`,
	type: 'translation',
	workspaceId: `workspace_${generateRandomId()}`,
	deniedReason: '',
	apiCallName: 'translate_text',
	languageCode: 'en',
	namespaceId: `ns_${generateRandomId()}`,
	responseSize: Math.floor(Math.random() * 5000) + 100,
	success: true,
	timestamp: Math.floor(Date.now() / 1000),
});

const TabButtons = ({
	activeTab,
	setActiveTab,
}: {
	activeTab: string;
	setActiveTab: (tab: 'single' | 'batch' | 'api-request' | 'sql') => void;
}) => (
	<div className="mb-6 border-b">
		<div className="flex space-x-4">
			<button
				className={`border-b-2 px-4 py-2 font-medium text-sm ${
					activeTab === 'single'
						? 'border-blue-500 text-blue-600'
						: 'border-transparent text-gray-500 hover:text-gray-700'
				}`}
				onClick={() => setActiveTab('single')}
				type="button"
			>
				Single Event
			</button>
			<button
				className={`border-b-2 px-4 py-2 font-medium text-sm ${
					activeTab === 'batch'
						? 'border-blue-500 text-blue-600'
						: 'border-transparent text-gray-500 hover:text-gray-700'
				}`}
				onClick={() => setActiveTab('batch')}
				type="button"
			>
				Batch Events
			</button>
			<button
				className={`border-b-2 px-4 py-2 font-medium text-sm ${
					activeTab === 'api-request'
						? 'border-blue-500 text-blue-600'
						: 'border-transparent text-gray-500 hover:text-gray-700'
				}`}
				onClick={() => setActiveTab('api-request')}
				type="button"
			>
				API Requests
			</button>
			<button
				className={`border-b-2 px-4 py-2 font-medium text-sm ${
					activeTab === 'sql'
						? 'border-blue-500 text-blue-600'
						: 'border-transparent text-gray-500 hover:text-gray-700'
				}`}
				onClick={() => setActiveTab('sql')}
				type="button"
			>
				Query Events
			</button>
		</div>
	</div>
);

const _FormFields = ({
	activeTab,
	formData,
	setFormData,
	batchData,
	setBatchData,
	apiRequestData,
	setApiRequestData,
	sqlQuery,
	setSqlQuery,
	sqlParameters,
	setSqlParameters,
}: {
	activeTab: string;
	formData: {
		clientId: string;
		apiKey: string;
		name: string;
		anonymousId: string;
		sessionId: string;
		properties: string;
	};
	setFormData: (data: {
		clientId: string;
		apiKey: string;
		name: string;
		anonymousId: string;
		sessionId: string;
		properties: string;
	}) => void;
	batchData: string;
	setBatchData: (data: string) => void;
	apiRequestData: {
		projectId: string;
		elementId: string;
		type: string;
		workspaceId: string;
		deniedReason: string;
		apiCallName: string;
		languageCode: string;
		namespaceId: string;
		responseSize: number;
		success: boolean;
		timestamp: number;
	};
	setApiRequestData: (data: {
		projectId: string;
		elementId: string;
		type: string;
		workspaceId: string;
		deniedReason: string;
		apiCallName: string;
		languageCode: string;
		namespaceId: string;
		responseSize: number;
		success: boolean;
		timestamp: number;
	}) => void;
	sqlQuery: string;
	setSqlQuery: (query: string) => void;
	sqlParameters: string;
	setSqlParameters: (params: string) => void;
}) => {
	if (activeTab === 'single') {
		return (
			<>
				<div>
					<label className="mb-1 block font-medium text-sm" htmlFor="name">
						Event Name *
					</label>
					<input
						className="w-full rounded border p-2"
						id="name"
						onChange={(e) => setFormData({ ...formData, name: e.target.value })}
						placeholder="purchase"
						required
						type="text"
						value={formData.name}
					/>
				</div>

				<div>
					<label
						className="mb-1 block font-medium text-sm"
						htmlFor="anonymousId"
					>
						Anonymous ID
					</label>
					<input
						className="w-full rounded border p-2"
						id="anonymousId"
						onChange={(e) =>
							setFormData({ ...formData, anonymousId: e.target.value })
						}
						placeholder="anon_user_123"
						type="text"
						value={formData.anonymousId}
					/>
				</div>

				<div>
					<label className="mb-1 block font-medium text-sm" htmlFor="sessionId">
						Session ID
					</label>
					<input
						className="w-full rounded border p-2"
						id="sessionId"
						onChange={(e) =>
							setFormData({ ...formData, sessionId: e.target.value })
						}
						placeholder="session_456"
						type="text"
						value={formData.sessionId}
					/>
				</div>

				<div>
					<label
						className="mb-1 block font-medium text-sm"
						htmlFor="properties"
					>
						Properties (JSON)
					</label>
					<textarea
						className="h-24 w-full rounded border p-2"
						id="properties"
						onChange={(e) =>
							setFormData({ ...formData, properties: e.target.value })
						}
						placeholder='{"value": 99.99, "currency": "USD", "product_id": "prod_123"}'
						value={formData.properties}
					/>
				</div>
			</>
		);
	}

	if (activeTab === 'batch') {
		return (
			<div>
				<label className="mb-1 block font-medium text-sm" htmlFor="batchEvents">
					Batch Events (JSON Array) *
				</label>
				<textarea
					className="h-64 w-full rounded border p-2 font-mono text-sm"
					id="batchEvents"
					onChange={(e) => setBatchData(e.target.value)}
					placeholder={`[
  {
    "name": "purchase",
    "anonymousId": "anon_user_123",
    "sessionId": "session_456",
    "timestamp": 1704067200000,
    "properties": {
      "value": 99.99,
      "currency": "USD",
      "product_id": "prod_123"
    }
  }
]`}
					required
					value={batchData}
				/>
			</div>
		);
	}

	if (activeTab === 'api-request') {
		return (
			<>
				<div className="grid grid-cols-2 gap-4">
					<div>
						<label
							className="mb-1 block font-medium text-sm"
							htmlFor="projectId"
						>
							Project ID
						</label>
						<input
							className="w-full rounded border p-2 font-mono text-sm"
							id="projectId"
							onChange={(e) =>
								setApiRequestData({
									...apiRequestData,
									projectId: e.target.value,
								})
							}
							placeholder="project_abc123"
							type="text"
							value={apiRequestData.projectId}
						/>
					</div>
					<div>
						<label
							className="mb-1 block font-medium text-sm"
							htmlFor="workspaceId"
						>
							Workspace ID *
						</label>
						<input
							className="w-full rounded border p-2 font-mono text-sm"
							id="workspaceId"
							onChange={(e) =>
								setApiRequestData({
									...apiRequestData,
									workspaceId: e.target.value,
								})
							}
							placeholder="workspace_xyz789"
							required
							type="text"
							value={apiRequestData.workspaceId}
						/>
					</div>
				</div>
				<div className="grid grid-cols-2 gap-4">
					<div>
						<label
							className="mb-1 block font-medium text-sm"
							htmlFor="requestType"
						>
							Request Type
						</label>
						<select
							className="w-full rounded border p-2"
							id="requestType"
							onChange={(e) =>
								setApiRequestData({ ...apiRequestData, type: e.target.value })
							}
							value={apiRequestData.type}
						>
							<option value="translation">Translation</option>
							<option value="chat">Chat</option>
							<option value="completion">Completion</option>
							<option value="summarization">Summarization</option>
							<option value="detection">Detection</option>
						</select>
					</div>
					<div>
						<label
							className="mb-1 block font-medium text-sm"
							htmlFor="apiCallName"
						>
							API Call Name
						</label>
						<input
							className="w-full rounded border p-2"
							id="apiCallName"
							onChange={(e) =>
								setApiRequestData({
									...apiRequestData,
									apiCallName: e.target.value,
								})
							}
							placeholder="translate_text"
							type="text"
							value={apiRequestData.apiCallName}
						/>
					</div>
				</div>
				<div className="grid grid-cols-3 gap-4">
					<div>
						<label
							className="mb-1 block font-medium text-sm"
							htmlFor="languageCode"
						>
							Language Code
						</label>
						<input
							className="w-full rounded border p-2"
							id="languageCode"
							onChange={(e) =>
								setApiRequestData({
									...apiRequestData,
									languageCode: e.target.value,
								})
							}
							placeholder="en"
							type="text"
							value={apiRequestData.languageCode}
						/>
					</div>
					<div>
						<label
							className="mb-1 block font-medium text-sm"
							htmlFor="responseSize"
						>
							Response Size (bytes)
						</label>
						<input
							className="w-full rounded border p-2"
							id="responseSize"
							onChange={(e) =>
								setApiRequestData({
									...apiRequestData,
									responseSize: Number.parseInt(e.target.value, 10) || 0,
								})
							}
							placeholder="1024"
							type="number"
							value={apiRequestData.responseSize}
						/>
					</div>
					<div>
						<label
							className="mb-1 block font-medium text-sm"
							htmlFor="timestamp"
						>
							Timestamp (Unix)
						</label>
						<input
							className="w-full rounded border p-2 font-mono text-sm"
							id="timestamp"
							onChange={(e) =>
								setApiRequestData({
									...apiRequestData,
									timestamp:
										Number.parseInt(e.target.value, 10) ||
										Math.floor(Date.now() / 1000),
								})
							}
							placeholder={Math.floor(Date.now() / 1000).toString()}
							type="number"
							value={apiRequestData.timestamp}
						/>
					</div>
				</div>
				<div>
					<label
						className="mb-1 block font-medium text-sm"
						htmlFor="deniedReason"
					>
						Denied Reason (leave empty for success)
					</label>
					<select
						className="w-full rounded border p-2"
						id="deniedReason"
						onChange={(e) => {
							const denied = e.target.value;
							setApiRequestData({
								...apiRequestData,
								deniedReason: denied,
								success: !denied,
							});
						}}
						value={apiRequestData.deniedReason}
					>
						<option value="">Success (no error)</option>
						<option value="quota_exceeded">Quota Exceeded</option>
						<option value="invalid_key">Invalid API Key</option>
						<option value="rate_limited">Rate Limited</option>
						<option value="insufficient_balance">Insufficient Balance</option>
						<option value="invalid_request">Invalid Request</option>
					</select>
				</div>
			</>
		);
	}

	return (
		<>
			<div>
				<label className="mb-1 block font-medium text-sm" htmlFor="sqlQuery">
					Custom SQL Query *
				</label>
				<textarea
					className="h-48 w-full rounded border p-2 font-mono text-sm"
					id="sqlQuery"
					onChange={(e) => setSqlQuery(e.target.value)}
					placeholder={`SELECT
  event_name,
  count() as total_events,
  uniq(anonymous_id) as unique_users
FROM analytics.custom_events
WHERE timestamp >= now() - INTERVAL 7 DAY
GROUP BY event_name
ORDER BY total_events DESC`}
					required
					value={sqlQuery}
				/>
				<p className="mt-1 text-gray-500 text-xs">
					Use template literals like <code>$workspaceId</code> and{' '}
					<code>$cutoffTimestamp</code> for parameterized queries.
				</p>
			</div>
			<div>
				<label
					className="mb-1 block font-medium text-sm"
					htmlFor="sqlParameters"
				>
					Query Parameters (JSON)
				</label>
				<textarea
					className="h-32 w-full rounded border p-2 font-mono text-sm"
					id="sqlParameters"
					onChange={(e) => setSqlParameters(e.target.value)}
					placeholder={`{
  "workspaceId": "workspace_abc123",
  "cutoffTimestamp": 1640995200,
  "daysPeriod": 30,
  "limitRows": 20
}`}
					value={sqlParameters}
				/>
				<p className="mt-1 text-gray-500 text-xs">
					Parameters for template literals in your query. Leave empty if not
					using parameters.
				</p>
			</div>
		</>
	);
};

export default function CustomEventsTestPage() {
	const [formData, setFormData] = useState(createInitialFormData());

	const [batchData, setBatchData] = useState(() =>
		JSON.stringify(
			[
				{
					name: 'purchase',
					anonymousId: generateRandomAnonymousId(),
					sessionId: generateRandomSessionId(),
					timestamp: Date.now(),
					properties: {
						value: Math.floor(Math.random() * 500) + 50,
						currency: 'USD',
						product_id: `prod_${generateRandomId()}`,
						category: 'ecommerce',
					},
				},
				{
					name: 'signup',
					anonymousId: generateRandomAnonymousId(),
					sessionId: generateRandomSessionId(),
					timestamp: Date.now(),
					properties: {
						plan: 'premium',
						source: 'landing_page',
						campaign: 'summer_promo',
					},
				},
				{
					name: 'navbar-nav-click',
					anonymousId: generateRandomAnonymousId(),
					sessionId: generateRandomSessionId(),
					timestamp: Date.now(),
					properties: {
						section: 'main-nav',
						item: 'pricing',
						page_path: '/dashboard',
						user_authenticated: 'true',
					},
				},
				{
					name: 'button-click',
					anonymousId: generateRandomAnonymousId(),
					sessionId: generateRandomSessionId(),
					timestamp: Date.now(),
					properties: {
						button_text: 'Get Started',
						page_path: '/landing',
						section: 'hero',
						button_type: 'cta',
					},
				},
				{
					name: 'search-performed',
					anonymousId: generateRandomAnonymousId(),
					sessionId: generateRandomSessionId(),
					timestamp: Date.now(),
					properties: {
						search_term: 'analytics dashboard',
						search_category: 'features',
						results_count: 12,
						search_duration_ms: 245,
					},
				},
			],
			null,
			2
		)
	);

	const [sqlQuery, setSqlQuery] = useState(`SELECT
  event_name,
  count() as total_events,
  uniq(anonymous_id) as unique_users,
  uniq(session_id) as unique_sessions
FROM analytics.custom_events
WHERE timestamp >= now() - INTERVAL 7 DAY
GROUP BY event_name
ORDER BY total_events DESC`);

	const [sqlParameters, setSqlParameters] = useState(
		createInitialSqlParameters()
	);
	const [apiRequestData, setApiRequestData] = useState(
		createInitialApiRequestData()
	);

	const [response, setResponse] = useState<Record<string, unknown> | null>(
		null
	);
	const [loading, setLoading] = useState(false);
	const [activeTab, setActiveTab] = useState<
		'single' | 'batch' | 'api-request' | 'sql'
	>('single');

	const regenerateSingleData = () => {
		setFormData({
			...formData,
			anonymousId: generateRandomAnonymousId(),
			sessionId: generateRandomSessionId(),
			properties: JSON.stringify(
				{
					value: Math.floor(Math.random() * 1000),
					currency: 'USD',
					category: 'test',
					source: 'dashboard',
					timestamp: new Date().toISOString(),
				},
				null,
				2
			),
		});
	};

	const regenerateBatchData = () => {
		setBatchData(
			JSON.stringify(
				[
					{
						name: 'purchase',
						anonymousId: generateRandomAnonymousId(),
						sessionId: generateRandomSessionId(),
						timestamp: Date.now(),
						properties: {
							value: Math.floor(Math.random() * 500) + 50,
							currency: 'USD',
							product_id: `prod_${generateRandomId()}`,
							category: 'ecommerce',
						},
					},
					{
						name: 'signup',
						anonymousId: generateRandomAnonymousId(),
						sessionId: generateRandomSessionId(),
						timestamp: Date.now(),
						properties: {
							plan: ['free', 'premium', 'enterprise'][
								Math.floor(Math.random() * 3)
							],
							source: ['landing_page', 'email', 'social'][
								Math.floor(Math.random() * 3)
							],
							campaign: `campaign_${generateRandomId()}`,
						},
					},
				],
				null,
				2
			)
		);
	};

	const regenerateApiRequestData = () => {
		setApiRequestData({
			projectId: `project_${generateRandomId()}`,
			elementId: `elem_${generateRandomId()}`,
			type: ['translation', 'chat', 'completion', 'summarization'][
				Math.floor(Math.random() * 4)
			],
			workspaceId: `workspace_${generateRandomId()}`,
			deniedReason:
				Math.random() > 0.8
					? ['quota_exceeded', 'invalid_key', 'rate_limited'][
							Math.floor(Math.random() * 3)
						]
					: '',
			apiCallName: [
				'translate_text',
				'chat_completion',
				'summarize_doc',
				'detect_language',
			][Math.floor(Math.random() * 4)],
			languageCode: ['en', 'es', 'fr', 'de', 'it'][
				Math.floor(Math.random() * 5)
			],
			namespaceId: `ns_${generateRandomId()}`,
			responseSize: Math.floor(Math.random() * 5000) + 100,
			success: Math.random() > 0.2,
			timestamp: Math.floor(Date.now() / 1000),
		});
	};

	const regenerateSqlData = () => {
		const queries = getSQLExamples();
		setSqlQuery(queries[Math.floor(Math.random() * queries.length)]);
		setSqlParameters(
			JSON.stringify(
				{
					workspaceId: `workspace_${generateRandomId()}`,
					cutoffTimestamp:
						Math.floor(Date.now() / 1000) -
						Math.floor(Math.random() * 90) * 24 * 60 * 60,
					daysPeriod: [7, 14, 30, 60, 90][Math.floor(Math.random() * 5)],
					projectId: `project_${generateRandomId()}`,
					startTimestamp:
						Math.floor(Date.now() / 1000) -
						Math.floor(Math.random() * 30) * 24 * 60 * 60,
					limitRows: [10, 20, 50, 100][Math.floor(Math.random() * 4)],
				},
				null,
				2
			)
		);
	};

	const regenerateRandomData = () => {
		if (activeTab === 'single') {
			regenerateSingleData();
		} else if (activeTab === 'batch') {
			regenerateBatchData();
		} else if (activeTab === 'api-request') {
			regenerateApiRequestData();
		} else {
			regenerateSqlData();
		}
		setResponse(null);
	};

	const handleSingleSubmit = async () => {
		const result = await sendCustomEvent({
			clientId: formData.clientId,
			name: formData.name,
			anonymousId: formData.anonymousId || undefined,
			sessionId: formData.sessionId || undefined,
			properties: formData.properties
				? JSON.parse(formData.properties)
				: undefined,
		});
		setResponse(result);
	};

	const handleBatchSubmit = async () => {
		const batchEvents = JSON.parse(batchData);
		const result = await sendBatchCustomEvents(formData.clientId, batchEvents);
		setResponse(result);
	};

	const handleApiRequestSubmit = async () => {
		const result = await sendAPIRequestEvent({
			clientId: formData.clientId,
			...apiRequestData,
		});
		setResponse(result);
	};

	const handleSqlSubmit = async () => {
		let parameters: Record<string, string | number | boolean> | undefined;
		try {
			parameters = sqlParameters ? JSON.parse(sqlParameters) : undefined;
		} catch (err) {
			throw new Error(
				`Invalid JSON in parameters: ${err instanceof Error ? err.message : 'Unknown error'}`
			);
		}

		const result = await executeCustomSQL({
			clientId: formData.clientId,
			apiKey: formData.apiKey,
			query: sqlQuery,
			parameters,
		});
		setResponse(result);
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setLoading(true);

		try {
			if (activeTab === 'single') {
				await handleSingleSubmit();
			} else if (activeTab === 'batch') {
				await handleBatchSubmit();
			} else if (activeTab === 'api-request') {
				await handleApiRequestSubmit();
			} else {
				await handleSqlSubmit();
			}
		} catch (error) {
			console.error('Submit error:', error);
			setResponse({
				error: error instanceof Error ? error.message : 'Unknown error',
			});
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="mx-auto max-w-2xl p-6">
			<h1 className="mb-6 font-bold text-2xl">Custom Events Test</h1>

			<TabButtons activeTab={activeTab} setActiveTab={setActiveTab} />

			<form className="space-y-4" onSubmit={handleSubmit}>
				<div>
					<label className="mb-1 block font-medium text-sm" htmlFor="clientId">
						Client ID *
					</label>
					<input
						className="w-full rounded border p-2"
						id="clientId"
						onChange={(e) =>
							setFormData({ ...formData, clientId: e.target.value })
						}
						placeholder="web_123"
						required
						type="text"
						value={formData.clientId}
					/>
				</div>

				<div>
					<label className="mb-1 block font-medium text-sm" htmlFor="apiKey">
						API Key {activeTab === 'sql' ? '*' : '(for SQL queries)'}
					</label>
					<input
						className="w-full rounded border p-2 font-mono text-sm"
						id="apiKey"
						onChange={(e) =>
							setFormData({ ...formData, apiKey: e.target.value })
						}
						placeholder="dbdy_your_api_key_here"
						required={activeTab === 'sql'}
						type="password"
						value={formData.apiKey}
					/>
					<p className="mt-1 text-gray-500 text-xs">
						API key is required for custom SQL queries. Get one from your
						dashboard settings.
					</p>
				</div>

				{activeTab === 'single' ? (
					<>
						<div>
							<label className="mb-1 block font-medium text-sm" htmlFor="name">
								Event Name *
							</label>
							<input
								className="w-full rounded border p-2"
								id="name"
								onChange={(e) =>
									setFormData({ ...formData, name: e.target.value })
								}
								placeholder="purchase"
								required
								type="text"
								value={formData.name}
							/>
						</div>

						<div>
							<label
								className="mb-1 block font-medium text-sm"
								htmlFor="anonymousId"
							>
								Anonymous ID
							</label>
							<input
								className="w-full rounded border p-2"
								id="anonymousId"
								onChange={(e) =>
									setFormData({ ...formData, anonymousId: e.target.value })
								}
								placeholder="anon_user_123"
								type="text"
								value={formData.anonymousId}
							/>
						</div>

						<div>
							<label
								className="mb-1 block font-medium text-sm"
								htmlFor="sessionId"
							>
								Session ID
							</label>
							<input
								className="w-full rounded border p-2"
								id="sessionId"
								onChange={(e) =>
									setFormData({ ...formData, sessionId: e.target.value })
								}
								placeholder="session_456"
								type="text"
								value={formData.sessionId}
							/>
						</div>

						<div>
							<label
								className="mb-1 block font-medium text-sm"
								htmlFor="properties"
							>
								Properties (JSON)
							</label>
							<textarea
								className="h-24 w-full rounded border p-2"
								id="properties"
								onChange={(e) =>
									setFormData({ ...formData, properties: e.target.value })
								}
								placeholder='{"value": 99.99, "currency": "USD", "product_id": "prod_123"}'
								value={formData.properties}
							/>
						</div>
					</>
				) : activeTab === 'batch' ? (
					<div>
						<label
							className="mb-1 block font-medium text-sm"
							htmlFor="batchEvents"
						>
							Batch Events (JSON Array) *
						</label>
						<textarea
							className="h-64 w-full rounded border p-2 font-mono text-sm"
							id="batchEvents"
							onChange={(e) => setBatchData(e.target.value)}
							placeholder={`[
  {
    "name": "purchase",
    "anonymousId": "anon_user_123",
    "sessionId": "session_456",
    "timestamp": 1704067200000,
    "properties": {
      "value": 99.99,
      "currency": "USD",
      "product_id": "prod_123"
    }
  },
  {
    "name": "signup",
    "anonymousId": "anon_user_124",
    "sessionId": "session_457",
    "properties": {
      "plan": "premium",
      "source": "landing_page"
    }
  }
]`}
							required
							value={batchData}
						/>
					</div>
				) : activeTab === 'api-request' ? (
					<>
						<div className="grid grid-cols-2 gap-4">
							<div>
								<label
									className="mb-1 block font-medium text-sm"
									htmlFor="projectId"
								>
									Project ID
								</label>
								<input
									className="w-full rounded border p-2 font-mono text-sm"
									id="projectId"
									onChange={(e) =>
										setApiRequestData({
											...apiRequestData,
											projectId: e.target.value,
										})
									}
									placeholder="project_abc123"
									type="text"
									value={apiRequestData.projectId}
								/>
							</div>
							<div>
								<label
									className="mb-1 block font-medium text-sm"
									htmlFor="workspaceId"
								>
									Workspace ID *
								</label>
								<input
									className="w-full rounded border p-2 font-mono text-sm"
									id="workspaceId"
									onChange={(e) =>
										setApiRequestData({
											...apiRequestData,
											workspaceId: e.target.value,
										})
									}
									placeholder="workspace_xyz789"
									required
									type="text"
									value={apiRequestData.workspaceId}
								/>
							</div>
						</div>

						<div className="grid grid-cols-2 gap-4">
							<div>
								<label
									className="mb-1 block font-medium text-sm"
									htmlFor="requestType"
								>
									Request Type
								</label>
								<select
									className="w-full rounded border p-2"
									id="requestType"
									onChange={(e) =>
										setApiRequestData({
											...apiRequestData,
											type: e.target.value,
										})
									}
									value={apiRequestData.type}
								>
									<option value="translation">Translation</option>
									<option value="chat">Chat</option>
									<option value="completion">Completion</option>
									<option value="summarization">Summarization</option>
									<option value="detection">Detection</option>
								</select>
							</div>
							<div>
								<label
									className="mb-1 block font-medium text-sm"
									htmlFor="apiCallName"
								>
									API Call Name
								</label>
								<input
									className="w-full rounded border p-2"
									id="apiCallName"
									onChange={(e) =>
										setApiRequestData({
											...apiRequestData,
											apiCallName: e.target.value,
										})
									}
									placeholder="translate_text"
									type="text"
									value={apiRequestData.apiCallName}
								/>
							</div>
						</div>

						<div className="grid grid-cols-3 gap-4">
							<div>
								<label
									className="mb-1 block font-medium text-sm"
									htmlFor="languageCode"
								>
									Language Code
								</label>
								<input
									className="w-full rounded border p-2"
									id="languageCode"
									onChange={(e) =>
										setApiRequestData({
											...apiRequestData,
											languageCode: e.target.value,
										})
									}
									placeholder="en"
									type="text"
									value={apiRequestData.languageCode}
								/>
							</div>
							<div>
								<label
									className="mb-1 block font-medium text-sm"
									htmlFor="responseSize"
								>
									Response Size (bytes)
								</label>
								<input
									className="w-full rounded border p-2"
									id="responseSize"
									onChange={(e) =>
										setApiRequestData({
											...apiRequestData,
											responseSize: Number.parseInt(e.target.value, 10) || 0,
										})
									}
									placeholder="1024"
									type="number"
									value={apiRequestData.responseSize}
								/>
							</div>
							<div>
								<label
									className="mb-1 block font-medium text-sm"
									htmlFor="timestamp"
								>
									Timestamp (Unix)
								</label>
								<input
									className="w-full rounded border p-2 font-mono text-sm"
									id="timestamp"
									onChange={(e) =>
										setApiRequestData({
											...apiRequestData,
											timestamp:
												Number.parseInt(e.target.value, 10) ||
												Math.floor(Date.now() / 1000),
										})
									}
									placeholder={Math.floor(Date.now() / 1000).toString()}
									type="number"
									value={apiRequestData.timestamp}
								/>
							</div>
						</div>

						<div>
							<label
								className="mb-1 block font-medium text-sm"
								htmlFor="deniedReason"
							>
								Denied Reason (leave empty for success)
							</label>
							<select
								className="w-full rounded border p-2"
								id="deniedReason"
								onChange={(e) => {
									const denied = e.target.value;
									setApiRequestData({
										...apiRequestData,
										deniedReason: denied,
										success: !denied,
									});
								}}
								value={apiRequestData.deniedReason}
							>
								<option value="">Success (no error)</option>
								<option value="quota_exceeded">Quota Exceeded</option>
								<option value="invalid_key">Invalid API Key</option>
								<option value="rate_limited">Rate Limited</option>
								<option value="insufficient_balance">
									Insufficient Balance
								</option>
								<option value="invalid_request">Invalid Request</option>
							</select>
						</div>
					</>
				) : (
					<>
						<div>
							<label
								className="mb-1 block font-medium text-sm"
								htmlFor="sqlQuery"
							>
								Custom SQL Query *
							</label>
							<textarea
								className="h-48 w-full rounded border p-2 font-mono text-sm"
								id="sqlQuery"
								onChange={(e) => setSqlQuery(e.target.value)}
								placeholder={`SELECT
  event_name,
  count() as total_events,
  uniq(anonymous_id) as unique_users
FROM analytics.custom_events
WHERE timestamp >= now() - INTERVAL 7 DAY
GROUP BY event_name
ORDER BY total_events DESC`}
								required
								value={sqlQuery}
							/>
							<p className="mt-1 text-gray-500 text-xs">
								Use template literals like <code>$workspaceId</code> and{' '}
								<code>$cutoffTimestamp</code> for parameterized queries.
							</p>
						</div>

						<div>
							<label
								className="mb-1 block font-medium text-sm"
								htmlFor="sqlParameters"
							>
								Query Parameters (JSON)
							</label>
							<textarea
								className="h-32 w-full rounded border p-2 font-mono text-sm"
								id="sqlParameters"
								onChange={(e) => setSqlParameters(e.target.value)}
								placeholder={`{
  "workspaceId": "workspace_abc123",
  "cutoffTimestamp": 1640995200,
  "daysPeriod": 30,
  "limitRows": 20
}`}
								value={sqlParameters}
							/>
							<p className="mt-1 text-gray-500 text-xs">
								Parameters for template literals in your query. Leave empty if
								not using parameters.
							</p>
						</div>
					</>
				)}

				<div className="flex gap-4">
					<button
						className="flex-1 rounded border border-gray-300 p-2 text-gray-700 hover:bg-gray-50"
						disabled={loading}
						onClick={regenerateRandomData}
						type="button"
					>
						🔄 Regenerate Random Data
					</button>
					<button
						className="flex-1 rounded bg-blue-500 p-2 text-white hover:bg-blue-600 disabled:opacity-50"
						disabled={loading}
						type="submit"
					>
						{loading
							? 'Sending...'
							: activeTab === 'single'
								? 'Send Custom Event'
								: activeTab === 'batch'
									? 'Send Batch Custom Events'
									: activeTab === 'api-request'
										? 'Send API Request Event'
										: 'Execute SQL Query'}
					</button>
				</div>
			</form>

			{response && (
				<div className="mt-6">
					<h2 className="mb-2 font-semibold text-lg">Response:</h2>
					{response.error ? (
						<div className="overflow-auto rounded border-red-500 border-l-4 bg-red-50 p-4">
							<div className="flex">
								<div className="flex-shrink-0">
									<span className="text-red-500">❌</span>
								</div>
								<div className="ml-3">
									<h3 className="font-medium text-red-800">Query Failed</h3>
									<div className="mt-2 text-red-700 text-sm">
										{typeof response.error === 'string' &&
										response.error.includes('💡') ? (
											<div className="space-y-2">
												{response.error
													.split('\n\n💡 Suggestion: ')
													.map((part, idx) => (
														<div key={`error-${idx}`}>
															{idx === 0 ? (
																<p>
																	<strong>Error:</strong> {part}
																</p>
															) : (
																<div className="mt-3 rounded border-blue-400 border-l-4 bg-blue-50 p-3">
																	<p className="text-blue-800">
																		<strong>💡 Suggestion:</strong> {part}
																	</p>
																</div>
															)}
														</div>
													))}
											</div>
										) : (
											<p>{String(response.error)}</p>
										)}
									</div>
									{response &&
										typeof response === 'object' &&
										'code' in response &&
										response.code && (
											<p className="mt-2 font-mono text-red-600 text-xs">
												Error Code: {String(response.code)}
											</p>
										)}
								</div>
							</div>
						</div>
					) : (
						<div className="space-y-4">
							<div className="overflow-auto rounded border-green-500 border-l-4 bg-green-50 p-4">
								<div className="flex">
									<div className="flex-shrink-0">
										<span className="text-green-500">✅</span>
									</div>
									<div className="ml-3">
										<h3 className="font-medium text-green-800">
											Query Successful
										</h3>
										{response.data && Array.isArray(response.data) && (
											<p className="mt-1 text-green-700 text-sm">
												Returned {response.data.length} row
												{response.data.length !== 1 ? 's' : ''}
											</p>
										)}
									</div>
								</div>
							</div>
							<pre className="overflow-auto rounded bg-gray-100 p-4 text-sm">
								{JSON.stringify(response, null, 2)}
							</pre>
						</div>
					)}
				</div>
			)}

			<div className="mt-6 text-gray-600 text-sm">
				{activeTab === 'single' ? (
					<>
						<h3 className="mb-2 font-medium">Single Event API Endpoint:</h3>
						<code className="block rounded bg-gray-100 p-2">
							POST basket.databuddy.cc/?client_id={'{website_id}'}
						</code>

						<h3 className="mt-4 mb-2 font-medium">Example Request:</h3>
						<pre className="overflow-auto rounded bg-gray-100 p-2 text-xs">
							{`{
  "type": "custom",
  "name": "purchase",
  "anonymousId": "anon_user_123",
  "sessionId": "session_456",
  "timestamp": 1704067200000,
  "properties": {
    "value": 99.99,
    "currency": "USD",
    "product_id": "prod_123"
  }
}`}
						</pre>
					</>
				) : activeTab === 'batch' ? (
					<>
						<h3 className="mb-2 font-medium">Batch Events API Endpoint:</h3>
						<code className="block rounded bg-gray-100 p-2">
							POST basket.databuddy.cc/batch?client_id={'{website_id}'}
						</code>

						<h3 className="mt-4 mb-2 font-medium">Example Request:</h3>
						<pre className="overflow-auto rounded bg-gray-100 p-2 text-xs">
							{`[
  {
    "type": "custom",
    "name": "purchase",
    "anonymousId": "anon_user_123",
    "sessionId": "session_456",
    "timestamp": 1704067200000,
    "properties": {
      "value": 99.99,
      "currency": "USD",
      "product_id": "prod_123"
    }
  },
  {
    "type": "custom",
    "name": "signup",
    "anonymousId": "anon_user_124",
    "sessionId": "session_457",
    "properties": {
      "plan": "premium",
      "source": "landing_page"
    }
  }
]`}
						</pre>
					</>
				) : activeTab === 'api-request' ? (
					<>
						<h3 className="mb-2 font-medium">
							API Request Event (User's Use Case):
						</h3>
						<code className="block rounded bg-gray-100 p-2">
							POST basket.databuddy.cc/?client_id={'{website_id}'}
						</code>

						<h3 className="mt-4 mb-2 font-medium">
							Example Request (matches your format):
						</h3>
						<pre className="overflow-auto rounded bg-gray-100 p-2 text-xs">
							{`{
  "type": "custom",
  "name": "api_request",
  "properties": {
    "projectId": "project_abc123",
    "elementId": "elem_456",
    "type": "translation",
    "workspaceId": "workspace_xyz789",
    "deniedReason": null,
    "timestamp": 1704067200,
    "apiCallName": "translate_text",
    "languageCode": "en",
    "namespaceId": "ns_789",
    "responseSize": 2048,
    "success": true
  },
  "timestamp": "2023-12-31T00:00:00.000Z"
}`}
						</pre>

						<h3 className="mt-4 mb-2 font-medium">
							Troubleshooting Custom Events:
						</h3>
						<ul className="list-inside list-disc space-y-1 text-xs">
							<li>
								<strong>Events not showing in dashboard?</strong> Check the
								browser console for errors and network requests
							</li>
							<li>
								<strong>Verify client_id:</strong> Make sure it matches your
								website's client ID exactly
							</li>
							<li>
								<strong>Check timestamp format:</strong> Use Unix timestamp
								(seconds) or ISO date string
							</li>
							<li>
								<strong>Properties structure:</strong> Ensure properties is a
								valid JSON object
							</li>
							<li>
								<strong>Network issues:</strong> Check if requests are reaching
								basket.databuddy.cc (status 200)
							</li>
							<li>
								<strong>Data processing:</strong> Custom events may take 1-2
								minutes to appear in dashboard
							</li>
						</ul>

						<h3 className="mt-4 mb-2 font-medium">Debug Steps:</h3>
						<ol className="list-inside list-decimal space-y-1 text-xs">
							<li>Open browser DevTools → Console tab</li>
							<li>
								Check Network tab for successful POST requests to
								basket.databuddy.cc
							</li>
							<li>Verify API response is {`{"success": true}`}</li>
							<li>Try sending a simple test event with minimal properties</li>
							<li>Wait 2-3 minutes for data processing pipeline</li>
							<li>Check raw events table if dashboard views are empty</li>
						</ol>
					</>
				) : (
					<>
						<h3 className="mb-2 font-medium">Custom SQL API Endpoint:</h3>
						<code className="block rounded bg-gray-100 p-2">
							POST api.databuddy.cc/v1/custom-sql/execute
						</code>

						<h3 className="mt-4 mb-2 font-medium">
							Example Request (with parameters):
						</h3>
						<pre className="overflow-auto rounded bg-gray-100 p-2 text-xs">
							{`{
  "query": "SELECT toStartOfMonth(timestamp) as month_start, countIf(properties.success = 'true') as success, count() as total_requests FROM analytics.custom_events WHERE name = 'api_request' AND properties.workspaceId = '\${workspaceId}' AND timestamp >= toDateTime(\${cutoffTimestamp}) GROUP BY month_start ORDER BY month_start DESC LIMIT 24",
  "clientId": "your-client-id",
  "parameters": {
    "workspaceId": "workspace_abc123",
    "cutoffTimestamp": 1640995200
  }
}`}
						</pre>

						<h3 className="mt-4 mb-2 font-medium">Requirements:</h3>
						<ul className="list-inside list-disc space-y-1 text-xs">
							<li>
								<strong>API Key Required:</strong> Custom SQL queries need
								authentication
							</li>
							<li>
								<strong>Automatic Client Filtering:</strong> The API
								automatically adds client_id filtering based on your API key
								permissions
							</li>
							<li>
								API key must have <code>read:analytics</code> or{' '}
								<code>write:custom-sql</code> scope
							</li>
							<li>
								Queries are automatically filtered by client ID for security
							</li>
						</ul>

						<h3 className="mt-4 mb-2 font-medium">Query Features:</h3>
						<ul className="list-inside list-disc space-y-1 text-xs">
							<li>
								<strong>Parameters:</strong> Use <code>$paramName</code>{' '}
								template literals for parameterized queries
							</li>
							<li>
								<strong>Properties:</strong> Use <code>properties.X</code>{' '}
								syntax for JSON property access (automatically extracted as
								strings)
							</li>
							<li>
								<strong>Query Start:</strong> Queries must start with SELECT or
								WITH
							</li>
							<li>
								<strong>Timestamp:</strong> Use <code>timestamp</code> column
								for filtering custom events
							</li>
							<li>
								<strong>Tables:</strong> <code>analytics.custom_events</code>,{' '}
								<code>analytics.events</code>, <code>analytics.errors</code>,
								etc.
							</li>
							<li>
								<strong>Security:</strong> Client filtering is automatically
								applied based on your API key permissions
							</li>
						</ul>

						<h3 className="mt-4 mb-2 font-medium">Security Testing:</h3>
						<p className="text-gray-600 text-xs">
							The examples include some "malicious" patterns that should be
							blocked by the API's security measures. Try them to see how the
							system protects against SQL injection and unauthorized operations.
						</p>
					</>
				)}
			</div>
		</div>
	);
}
