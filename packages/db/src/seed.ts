import { faker } from '@faker-js/faker';
import { clickHouse, TABLE_NAMES } from './clickhouse/client';

const clientId = process.argv[2] || faker.string.uuid();
const domain = process.argv[3] || 'example.com';
const eventCount = Number(process.argv[4]) || 100;

const BROWSERS = ['Chrome', 'Firefox', 'Safari', 'Edge', 'Opera'];
const OS_NAMES = ['Windows', 'macOS', 'Linux', 'Android', 'iOS'];
const DEVICE_TYPES = ['desktop', 'mobile', 'tablet'];
// Custom events that would be tracked via track() calls
const CUSTOM_EVENTS = [
	'click',
	'button_click',
	'form_submit',
	'signup',
	'login',
	'logout',
	'purchase',
	'add_to_cart',
	'remove_from_cart',
	'checkout_started',
	'search',
	'filter_applied',
	'video_play',
	'video_pause',
	'download',
	'newsletter_signup',
	'contact_form',
	'feature_toggle',
	'share',
	'error_occurred',
	'api_call',
	'user_interaction',
];

const BLOG_CATEGORIES = [
	'tech',
	'business',
	'marketing',
	'design',
	'development',
	'startup',
	'ai',
	'saas',
	'mobile',
	'web',
	'data',
	'security',
	'cloud',
	'api',
	'tutorial',
];
const PRODUCT_CATEGORIES = [
	'software',
	'hardware',
	'books',
	'courses',
	'templates',
	'tools',
	'services',
	'consulting',
	'hosting',
	'analytics',
];
const COMPANY_SECTIONS = [
	'about',
	'team',
	'careers',
	'investors',
	'press',
	'contact',
	'support',
	'help',
	'faq',
	'terms',
	'privacy',
	'security',
	'status',
];

function generatePaths() {
	const paths = [
		'/',
		'/home',
		'/pricing',
		'/features',
		'/docs',
		'/api',
		'/login',
		'/signup',
		'/dashboard',
		'/settings',
		'/profile',
		'/search',
		'/checkout',
		'/cart',
		'/wishlist',
	];

	// Company pages
	for (const section of COMPANY_SECTIONS) {
		paths.push(`/${section}`);
	}

	// Blog paths
	for (const category of BLOG_CATEGORIES) {
		paths.push(`/blog/${category}`);
		for (let i = 0; i < 5; i++) {
			const slug = faker.lorem.slug({ min: 2, max: 6 });
			paths.push(`/blog/${category}/${slug}`);
		}
	}

	// Product/service paths
	for (const category of PRODUCT_CATEGORIES) {
		paths.push(`/products/${category}`);
		paths.push(`/services/${category}`);
		for (let i = 0; i < 3; i++) {
			const productName = faker.commerce
				.productName()
				.toLowerCase()
				.replace(/\s+/g, '-');
			paths.push(`/products/${category}/${productName}`);
		}
	}

	// Documentation paths
	const docSections = [
		'getting-started',
		'api-reference',
		'tutorials',
		'examples',
		'guides',
		'troubleshooting',
	];
	for (const section of docSections) {
		paths.push(`/docs/${section}`);
		for (let i = 0; i < 4; i++) {
			const docSlug = faker.lorem.slug({ min: 1, max: 3 });
			paths.push(`/docs/${section}/${docSlug}`);
		}
	}

	// User-generated content
	for (let i = 0; i < 20; i++) {
		const userId = faker.string.alphanumeric(8);
		paths.push(`/user/${userId}`);
		paths.push(`/profile/${userId}`);
	}

	return paths;
}

function generateReferrers() {
	return [
		'direct',
		'https://google.com/search',
		'https://www.google.com/search',
		'https://bing.com/search',
		'https://duckduckgo.com',
		'https://yahoo.com/search',
		'https://facebook.com',
		'https://www.facebook.com',
		'https://twitter.com',
		'https://x.com',
		'https://linkedin.com',
		'https://www.linkedin.com',
		'https://instagram.com',
		'https://reddit.com',
		'https://www.reddit.com',
		'https://youtube.com',
		'https://tiktok.com',
		'https://github.com',
		'https://stackoverflow.com',
		'https://medium.com',
		'https://dev.to',
		'https://hackernews.com',
		'https://producthunt.com',
		'https://indiehackers.com',
		'https://techcrunch.com',
		'https://vercel.com',
		'https://netlify.com',
		'https://aws.amazon.com',
		'https://cloud.google.com',
		'https://azure.microsoft.com',
		'https://digitalocean.com',
		'https://heroku.com',
		'https://railway.app',
		'https://planetscale.com',
		'https://supabase.com',
		'https://clerk.com',
		'https://auth0.com',
		'https://stripe.com',
		'https://paddle.com',
		'https://lemonsqueezy.com',
		'https://gumroad.com',
		'https://mailchimp.com',
		'https://convertkit.com',
		'https://substack.com',
		'https://notion.so',
		'https://airtable.com',
		'https://figma.com',
		'https://canva.com',
		'https://discord.com',
		'https://slack.com',
		'https://telegram.org',
		'https://whatsapp.com',
	];
}

function generateCustomProperties(eventName: string) {
	const baseProps: Record<string, unknown> = {};

	// Core databuddy.js events have specific property patterns
	switch (eventName) {
		case 'page_exit':
			// page_exit events include engagement metrics (handled in main event generation)
			return {};
		case 'link_out':
			return {
				href: faker.internet.url(),
				text: faker.lorem.words({ min: 1, max: 4 }),
			};
		case 'screen_view':
			// screen_view events include page_count (handled in main event generation)
			return {};
		case 'purchase':
		case 'order_completed':
			return {
				order_id: faker.string.alphanumeric(12),
				total_amount: faker.number.float({
					min: 10,
					max: 500,
					fractionDigits: 2,
				}),
				currency: faker.helpers.arrayElement([
					'USD',
					'EUR',
					'GBP',
					'CAD',
					'AUD',
				]),
				item_count: faker.number.int({ min: 1, max: 5 }),
				payment_method: faker.helpers.arrayElement([
					'card',
					'paypal',
					'apple_pay',
					'google_pay',
				]),
				coupon_used: faker.helpers.maybe(() => faker.lorem.word(), {
					probability: 0.3,
				}),
				shipping_method: faker.helpers.arrayElement([
					'standard',
					'express',
					'overnight',
				]),
			};
		case 'add_to_cart':
		case 'remove_from_cart':
			return {
				product_id: faker.string.alphanumeric(8),
				product_name: faker.commerce.productName(),
				price: faker.number.float({ min: 5, max: 200, fractionDigits: 2 }),
				quantity: faker.number.int({ min: 1, max: 3 }),
				category: faker.helpers.arrayElement(PRODUCT_CATEGORIES),
			};
		case 'search':
			return {
				query: faker.lorem.words({ min: 1, max: 4 }),
				results_count: faker.number.int({ min: 0, max: 100 }),
				filters_applied: faker.helpers.maybe(
					() =>
						faker.helpers.arrayElements(PRODUCT_CATEGORIES, { min: 1, max: 3 }),
					{ probability: 0.4 }
				),
			};
		case 'video_play':
		case 'video_started':
			return {
				video_id: faker.string.alphanumeric(10),
				video_title: faker.lorem.sentence({ min: 3, max: 8 }),
				video_duration: faker.number.int({ min: 30, max: 3600 }),
				quality: faker.helpers.arrayElement(['720p', '1080p', '4k']),
			};
		case 'signup':
		case 'account_created':
			return {
				registration_method: faker.helpers.arrayElement([
					'email',
					'google',
					'github',
					'facebook',
				]),
				referral_code: faker.helpers.maybe(() => faker.string.alphanumeric(8), {
					probability: 0.2,
				}),
				plan_selected: faker.helpers.arrayElement([
					'free',
					'starter',
					'pro',
					'enterprise',
				]),
			};
		case 'form_submit':
		case 'contact_form_submit':
			return {
				form_name: faker.helpers.arrayElement([
					'contact',
					'newsletter',
					'demo_request',
					'support',
				]),
				fields_count: faker.number.int({ min: 2, max: 8 }),
				submission_time: faker.number.int({ min: 15, max: 300 }),
			};
		case 'feature_used':
			return {
				feature_name: faker.helpers.arrayElement([
					'export',
					'import',
					'share',
					'collaborate',
					'analytics',
					'automation',
				]),
				usage_duration: faker.number.int({ min: 5, max: 180 }),
				user_tier: faker.helpers.arrayElement(['free', 'paid', 'trial']),
			};
		default:
			// Random additional properties for any event
			if (faker.datatype.boolean({ probability: 0.3 })) {
				baseProps.experiment_variant = faker.helpers.arrayElement([
					'control',
					'variant_a',
					'variant_b',
				]);
			}
			if (faker.datatype.boolean({ probability: 0.2 })) {
				baseProps.user_segment = faker.helpers.arrayElement([
					'new',
					'returning',
					'premium',
					'trial',
				]);
			}
			return baseProps;
	}
}

const DOT_REGEX = /\.$/;

function generatePageTitle(path: string): string {
	if (path === '/') {
		return 'Home';
	}
	if (path.startsWith('/blog/')) {
		const parts = path.split('/');
		if (parts.length === 3) {
			return `${parts[2].charAt(0).toUpperCase() + parts[2].slice(1)} Blog`;
		}
		return faker.lorem.sentence({ min: 4, max: 8 }).replace(DOT_REGEX, '');
	}
	if (path.startsWith('/products/')) {
		return `${faker.commerce.productName()} - Products`;
	}
	if (path.startsWith('/docs/')) {
		return `Documentation - ${path.split('/').pop()?.replace(/-/g, ' ')}`;
	}
	if (path.startsWith('/user/') || path.startsWith('/profile/')) {
		return `${faker.person.fullName()} - Profile`;
	}

	// Default title generation
	const pathName = path.substring(1).replace(/-/g, ' ').replace(/\//g, ' - ');
	return pathName.charAt(0).toUpperCase() + pathName.slice(1) || 'Page';
}

const PATHS = generatePaths();
const REFERRERS = generateReferrers();

// Generate realistic user pools and sessions
const UNIQUE_USERS = Math.max(10, Math.floor(eventCount / 8)); // ~8 events per user on average
const SESSIONS_PER_USER = 2.5; // Average sessions per user
const TOTAL_SESSIONS = Math.floor(UNIQUE_USERS * SESSIONS_PER_USER);

// Pre-generate user pool
const USER_POOL = Array.from({ length: UNIQUE_USERS }, () => ({
	anonymousId: `anon_${faker.string.uuid()}`,
	country: faker.location.countryCode(),
	region: faker.location.state(),
	city: faker.location.city(),
	timezone: faker.helpers.arrayElement([
		'America/New_York',
		'Europe/London',
		'Asia/Tokyo',
		'Australia/Sydney',
		'Pacific/Honolulu',
	]),
	language: faker.helpers.arrayElement([
		'en-US',
		'en-GB',
		'fr-FR',
		'de-DE',
		'es-ES',
		'pt-BR',
		'ja-JP',
	]),
	deviceType: faker.helpers.arrayElement(DEVICE_TYPES),
	browser: faker.helpers.arrayElement(BROWSERS),
	os: faker.helpers.arrayElement(OS_NAMES),
	screenResolution: `${faker.helpers.arrayElement([1920, 1366, 1440, 1280, 1024])}x${faker.helpers.arrayElement([1080, 768, 900, 720, 640])}`,
}));

// Pre-generate session pool
const SESSION_POOL = Array.from({ length: TOTAL_SESSIONS }, () => {
	const user = faker.helpers.arrayElement(USER_POOL);
	const sessionStartTime = faker.date.recent({ days: 30 }).getTime();
	return {
		sessionId: `sess_${faker.string.uuid()}`,
		anonymousId: user.anonymousId,
		sessionStartTime,
		user,
		eventsInSession: faker.number.int({ min: 1, max: 15 }), // 1-15 events per session
		referrer: faker.helpers.arrayElement(REFERRERS),
	};
});

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Seed script needs comprehensive data generation
function createSingleEvent(
	client: string,
	websiteDomain: string,
	eventIndex = 0
) {
	// Pick a session based on event distribution
	const sessionIndex = Math.floor(eventIndex / (eventCount / TOTAL_SESSIONS));
	const session = SESSION_POOL[Math.min(sessionIndex, SESSION_POOL.length - 1)];
	const user = session.user;

	// Generate event time within session (sessions can span up to 2 hours)
	const maxSessionDuration = 2 * 60 * 60 * 1000; // 2 hours
	const sessionProgress =
		(eventIndex % Math.ceil(eventCount / TOTAL_SESSIONS)) /
		Math.ceil(eventCount / TOTAL_SESSIONS);
	const baseTime =
		session.sessionStartTime + sessionProgress * maxSessionDuration;

	const path = faker.helpers.arrayElement(PATHS);

	// Determine if this is the last event in the session for page_exit
	const isLastEventInSession =
		sessionProgress > 0.8 || faker.datatype.boolean({ probability: 0.2 });

	// Generate event based on realistic distribution from databuddy.js
	let eventName: string;
	if (isLastEventInSession && faker.datatype.boolean({ probability: 0.8 })) {
		// 80% chance of page_exit for last events in session
		eventName = 'page_exit';
	} else {
		eventName = faker.helpers.weightedArrayElement([
			{ weight: 70, value: 'screen_view' }, // Main page views
			{ weight: 5, value: 'link_out' }, // Outgoing links
			{ weight: 25, value: faker.helpers.arrayElement(CUSTOM_EVENTS) }, // Custom events
		]);
	}

	const customProps = generateCustomProperties(eventName);
	const isPageExit = eventName === 'page_exit';

	return {
		id: faker.string.uuid(),
		client_id: client,
		event_name: eventName,
		anonymous_id: session.anonymousId,
		time: baseTime,
		session_id: session.sessionId,
		timestamp: baseTime,
		session_start_time: session.sessionStartTime,
		referrer: session.referrer === 'direct' ? undefined : session.referrer,
		url: `https://${websiteDomain}${path}`,
		path,
		title: generatePageTitle(path),
		ip: faker.internet.ip(),
		user_agent: faker.internet.userAgent(),
		browser_name: user.browser,
		browser_version: faker.system.semver(),
		os_name: user.os,
		os_version: faker.system.semver(),
		device_type: user.deviceType,
		device_brand:
			user.deviceType === 'mobile'
				? faker.helpers.arrayElement(['Apple', 'Samsung', 'Google'])
				: null,
		device_model:
			user.deviceType === 'mobile' ? faker.commerce.productName() : null,
		country: user.country,
		region: user.region,
		city: user.city,
		screen_resolution: user.screenResolution,
		viewport_size: `${faker.number.int({ min: 800, max: 1920 })}x${faker.number.int({ min: 600, max: 1080 })}`,
		language: user.language,
		timezone: user.timezone,
		connection_type: faker.helpers.arrayElement([
			'wifi',
			'4g',
			'ethernet',
			'3g',
		]),
		rtt: faker.number.int({ min: 10, max: 500 }),
		downlink: faker.number.float({ min: 1, max: 100, fractionDigits: 1 }),
		// Engagement metrics - only populated for page_exit events or screen_view
		time_on_page:
			isPageExit || eventName === 'screen_view'
				? faker.number.float({ min: 5, max: 600, fractionDigits: 1 })
				: undefined,
		scroll_depth: isPageExit
			? faker.number.float({ min: 10, max: 100, fractionDigits: 1 })
			: undefined,
		interaction_count: isPageExit
			? faker.number.int({ min: 0, max: 50 })
			: undefined,
		exit_intent: isPageExit ? (faker.datatype.boolean() ? 1 : 0) : 0,
		page_count:
			eventName === 'screen_view' || isPageExit
				? faker.number.int({ min: 1, max: 10 })
				: 1,
		is_bounce: isPageExit
			? faker.number.int({ min: 1, max: 10 }) === 1
				? 1
				: 0 // 10% bounce rate
			: 0,
		has_exit_intent: isPageExit
			? faker.datatype.boolean({ probability: 0.15 })
				? 1
				: 0 // 15% exit intent
			: undefined,
		page_size: faker.number.int({ min: 50_000, max: 5_000_000 }),
		// UTM parameters - from URL or referrer
		utm_source: faker.helpers.maybe(
			() =>
				faker.helpers.arrayElement(['google', 'facebook', 'twitter', 'email']),
			{ probability: 0.3 }
		),
		utm_medium: faker.helpers.maybe(
			() => faker.helpers.arrayElement(['cpc', 'organic', 'social', 'email']),
			{ probability: 0.3 }
		),
		utm_campaign: faker.helpers.maybe(() => faker.lorem.slug(), {
			probability: 0.2,
		}),

		// Performance metrics - only for screen_view events when trackPerformance is enabled
		load_time:
			eventName === 'screen_view'
				? faker.number.int({ min: 200, max: 5000 })
				: undefined,
		dom_ready_time:
			eventName === 'screen_view'
				? faker.number.int({ min: 100, max: 3000 })
				: undefined,
		dom_interactive:
			eventName === 'screen_view'
				? faker.number.int({ min: 50, max: 2000 })
				: undefined,
		ttfb:
			eventName === 'screen_view'
				? faker.number.int({ min: 50, max: 1000 })
				: undefined,
		connection_time:
			eventName === 'screen_view'
				? faker.number.int({ min: 10, max: 200 })
				: undefined,
		request_time:
			eventName === 'screen_view'
				? faker.number.int({ min: 20, max: 500 })
				: undefined,
		render_time:
			eventName === 'screen_view'
				? faker.number.int({ min: 50, max: 1000 })
				: undefined,
		redirect_time:
			eventName === 'screen_view'
				? faker.number.int({ min: 0, max: 100 })
				: undefined,
		domain_lookup_time:
			eventName === 'screen_view'
				? faker.number.int({ min: 5, max: 100 })
				: undefined,
		// Web Vitals - only for screen_view events with trackWebVitals enabled
		fcp:
			eventName === 'screen_view' &&
			faker.datatype.boolean({ probability: 0.3 })
				? faker.number.int({ min: 500, max: 4000 })
				: undefined,
		lcp:
			eventName === 'screen_view' &&
			faker.datatype.boolean({ probability: 0.3 })
				? faker.number.int({ min: 1000, max: 6000 })
				: undefined,
		cls:
			eventName === 'screen_view' &&
			faker.datatype.boolean({ probability: 0.3 })
				? faker.number.float({ min: 0, max: 0.5, fractionDigits: 3 })
				: undefined,
		fid:
			eventName === 'screen_view' &&
			faker.datatype.boolean({ probability: 0.2 })
				? faker.number.int({ min: 10, max: 300 })
				: undefined,
		inp:
			eventName === 'screen_view' &&
			faker.datatype.boolean({ probability: 0.2 })
				? faker.number.int({ min: 50, max: 500 })
				: undefined,
		href: faker.helpers.maybe(() => faker.internet.url(), {
			probability: 0.2,
		}),
		text: faker.helpers.maybe(() => faker.lorem.words({ min: 1, max: 5 }), {
			probability: 0.2,
		}),
		value: faker.helpers.maybe(() => faker.commerce.price(), {
			probability: 0.1,
		}),
		// Add event-specific properties
		...(eventName === 'page_exit' && {
			// page_exit events get unique eventId for deduplication
			event_id: `exit_${session.sessionId}_${btoa(path)}_${baseTime}`,
		}),
		...(eventName === 'screen_view' && {
			// screen_view events include performance data
			load_time: faker.number.int({ min: 200, max: 5000 }),
			dom_ready_time: faker.number.int({ min: 100, max: 3000 }),
			dom_interactive: faker.number.int({ min: 50, max: 2000 }),
			ttfb: faker.number.int({ min: 50, max: 1000 }),
			request_time: faker.number.int({ min: 20, max: 500 }),
			render_time: faker.number.int({ min: 50, max: 1000 }),
		}),

		properties: JSON.stringify(customProps),
		created_at: Date.now(),
	};
}

(async () => {
	console.log(
		`Generating ${eventCount} events for client: ${clientId} on domain: ${domain}`
	);
	console.log(
		`Creating realistic journeys: ${UNIQUE_USERS} users across ${TOTAL_SESSIONS} sessions`
	);

	const events = Array.from({ length: eventCount }, (_, index) =>
		createSingleEvent(clientId, domain, index)
	);

	// Sort events by time to ensure chronological order
	events.sort((a, b) => a.time - b.time);

	await clickHouse.insert({
		table: TABLE_NAMES.events,
		format: 'JSONEachRow',
		values: events,
	});

	console.log(`Inserted ${events.length} events for client ${clientId}`);
})();
