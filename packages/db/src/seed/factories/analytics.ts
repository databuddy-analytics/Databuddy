import type { SeedContext } from '../context';
import { createId } from '../utils/ids';
import { addMs, recentDateMs } from '../utils/time';

const BROWSERS = ['Chrome', 'Firefox', 'Safari', 'Edge', 'Opera'];
const OS_NAMES = ['Windows', 'macOS', 'Linux', 'Android', 'iOS'];
const DEVICE_TYPES = ['desktop', 'mobile', 'tablet'] as const;

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
] as const;

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
] as const;

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
] as const;

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
] as const;

export interface AnalyticsUserProfile {
	anonymousId: string;
	country: string;
	region: string;
	city: string;
	timezone: string;
	language: string;
	deviceType: (typeof DEVICE_TYPES)[number];
	browser: string;
	os: string;
	screenResolution: string;
}

export interface AnalyticsSession {
	sessionId: string;
	anonymousId: string;
	sessionStartTime: number;
	user: AnalyticsUserProfile;
	eventsInSession: number;
	referrer: string;
}

export interface AnalyticsResources {
	paths: string[];
	referrers: string[];
}

export interface AnalyticsEventRecord {
	id: string;
	client_id: string;
	event_name: string;
	anonymous_id: string;
	time: number;
	session_id: string;
	event_type: string;
	event_id?: string;
	session_start_time: number;
	timestamp?: number;
	referrer?: string;
	url: string;
	path: string;
	title: string;
	ip: string;
	user_agent: string;
	browser_name?: string | null;
	browser_version?: string | null;
	os_name?: string | null;
	os_version?: string | null;
	device_type?: string | null;
	device_brand?: string | null;
	device_model?: string | null;
	country?: string | null;
	region?: string | null;
	city?: string | null;
	screen_resolution?: string | null;
	viewport_size?: string | null;
	language?: string | null;
	timezone?: string | null;
	connection_type?: string | null;
	rtt?: number | null;
	downlink?: number | null;
	time_on_page?: number;
	scroll_depth?: number;
	interaction_count?: number;
	page_count: number;
	utm_source?: string;
	utm_medium?: string;
	utm_campaign?: string;
	utm_term?: string;
	utm_content?: string;
	load_time?: number;
	dom_ready_time?: number;
	dom_interactive?: number;
	ttfb?: number;
	connection_time?: number;
	request_time?: number;
	render_time?: number;
	redirect_time?: number;
	domain_lookup_time?: number;
	properties: string;
	created_at: number;
}

export interface AnalyticsCustomEventRecord {
	id: string;
	client_id: string;
	event_name: string;
	anonymous_id: string;
	session_id: string;
	properties: string;
	timestamp: number;
}

export interface AnalyticsOutgoingLinkRecord {
	id: string;
	client_id: string;
	anonymous_id: string;
	session_id: string;
	href: string;
	text: string | null;
	properties: string;
	timestamp: number;
}

export interface AnalyticsErrorRecord {
	id: string;
	client_id: string;
	event_id: string;
	anonymous_id: string;
	session_id: string;
	timestamp: number;
	path: string;
	message: string;
	filename: string;
	lineno: number;
	colno: number;
	stack: string;
	error_type: string;
	ip: string;
	user_agent: string;
	browser_name?: string | null;
	browser_version?: string | null;
	os_name?: string | null;
	os_version?: string | null;
	device_type?: string | null;
	country?: string | null;
	region?: string | null;
	created_at: number;
}

export interface AnalyticsWebVitalsRecord {
	id: string;
	client_id: string;
	event_id: string;
	anonymous_id: string;
	session_id: string;
	timestamp: number;
	path: string;
	fcp: number;
	lcp: number;
	cls: number;
	fid: number;
	inp: number;
	ip: string;
	user_agent: string;
	browser_name?: string | null;
	browser_version?: string | null;
	os_name?: string | null;
	os_version?: string | null;
	device_type?: string | null;
	country?: string | null;
	region?: string | null;
	created_at: number;
}

export function createAnalyticsResources(
	ctx: Pick<SeedContext, 'faker'>
): AnalyticsResources {
	return {
		paths: generatePaths(ctx),
		referrers: generateReferrers(),
	};
}

export function buildUserPool(
	ctx: Pick<SeedContext, 'faker'>,
	count: number
): AnalyticsUserProfile[] {
	return Array.from({ length: count }, () => ({
		anonymousId: `anon_${createId(ctx.faker)}`,
		country: ctx.faker.location.countryCode(),
		region: ctx.faker.location.state(),
		city: ctx.faker.location.city(),
		timezone: ctx.faker.helpers.arrayElement([
			'America/New_York',
			'Europe/London',
			'Asia/Tokyo',
			'Australia/Sydney',
			'Pacific/Honolulu',
		]),
		language: ctx.faker.helpers.arrayElement([
			'en-US',
			'en-GB',
			'fr-FR',
			'de-DE',
			'es-ES',
			'pt-BR',
			'ja-JP',
		]),
		deviceType: ctx.faker.helpers.arrayElement(DEVICE_TYPES),
		browser: ctx.faker.helpers.arrayElement(BROWSERS),
		os: ctx.faker.helpers.arrayElement(OS_NAMES),
		screenResolution: `${ctx.faker.helpers.arrayElement([
			1920,
			1366,
			1440,
			1280,
			1024,
		])}x${ctx.faker.helpers.arrayElement([1080, 768, 900, 720, 640])}`,
	}));
}

export function buildSessionPool(
	ctx: Pick<SeedContext, 'faker' | 'now'>,
	userPool: AnalyticsUserProfile[],
	count: number,
	resources: AnalyticsResources
): AnalyticsSession[] {
	return Array.from({ length: count }, () => {
		const user = ctx.faker.helpers.arrayElement(userPool);
		const sessionStartTime = recentDateMs(ctx.faker, ctx.now, { days: 30 });

		return {
			sessionId: `sess_${createId(ctx.faker)}`,
			anonymousId: user.anonymousId,
			sessionStartTime,
			user,
			eventsInSession: ctx.faker.number.int({ min: 1, max: 15 }),
			referrer: ctx.faker.helpers.arrayElement(resources.referrers),
		};
	});
}

export interface MakeSessionEventsParams {
	clientId: string;
	domain: string;
	session: AnalyticsSession;
	resources: AnalyticsResources;
}

/**
 * Generate a realistic sequence of events for a single session.
 * Flow: screen_view → interactions on same path → page_exit → repeat for next page
 */
export function makeSessionEvents(
	ctx: Pick<SeedContext, 'faker' | 'now'>,
	params: MakeSessionEventsParams
): AnalyticsEventRecord[] {
	const { clientId, domain, session, resources } = params;
	const { faker } = ctx;
	const user = session.user;
	
	const events: AnalyticsEventRecord[] = [];
	const targetEventCount = session.eventsInSession;
	const maxSessionDuration = 2 * 60 * 60 * 1000; // 2 hours max
	
	// Determine how many pages to visit in this session (1-5)
	const pagesInSession = Math.min(
		faker.number.int({ min: 1, max: 5 }),
		targetEventCount
	);
	
	let currentTime = session.sessionStartTime;
	let pageCount = 0;
	
	for (let pageIndex = 0; pageIndex < pagesInSession; pageIndex++) {
		const path = faker.helpers.arrayElement(resources.paths);
		const isLastPage = pageIndex === pagesInSession - 1;
		
		// 1. screen_view (page load)
		const screenViewEvent = makeEventBase(ctx, {
			clientId,
			domain,
			session,
			path,
			eventName: 'screen_view',
			time: currentTime,
			pageCount: ++pageCount,
		});
		
		// Add load timing for screen_view
		screenViewEvent.load_time = faker.number.int({ min: 200, max: 5000 });
		screenViewEvent.dom_ready_time = faker.number.int({ min: 50, max: 2000 });
		screenViewEvent.dom_interactive = faker.number.int({ min: 50, max: 2000 });
		screenViewEvent.ttfb = faker.number.int({ min: 50, max: 1000 });
		screenViewEvent.connection_time = faker.number.int({ min: 10, max: 200 });
		screenViewEvent.request_time = faker.number.int({ min: 20, max: 500 });
		screenViewEvent.render_time = faker.number.int({ min: 50, max: 1000 });
		screenViewEvent.redirect_time = faker.number.int({ min: 0, max: 100 });
		screenViewEvent.domain_lookup_time = faker.number.int({ min: 5, max: 100 });
		screenViewEvent.time_on_page = faker.number.float({ min: 5, max: 600, fractionDigits: 1 });
		
		events.push(screenViewEvent);
		currentTime = addMs(currentTime, faker.number.int({ min: 1000, max: 5000 }));
		
		// 2. Interactions on this page (custom events, link_out)
		const remainingSlots = targetEventCount - events.length - (isLastPage ? 1 : 2); // reserve for exit
		const maxInteractions = Math.max(0, Math.min(3, remainingSlots));
		const interactionsOnPage = isLastPage
			? Math.max(0, remainingSlots)
			: (maxInteractions > 0 ? faker.number.int({ min: 0, max: maxInteractions }) : 0);
		
		for (let i = 0; i < interactionsOnPage; i++) {
			const interactionType = faker.helpers.weightedArrayElement([
				{ weight: 80, value: 'custom' },
				{ weight: 20, value: 'link_out' },
			]);
			
			const eventName = interactionType === 'link_out'
				? 'link_out'
				: faker.helpers.arrayElement(CUSTOM_EVENTS);
			
			const interactionEvent = makeEventBase(ctx, {
				clientId,
				domain,
				session,
				path,
				eventName,
				time: currentTime,
				pageCount,
			});
			
			events.push(interactionEvent);
			currentTime = addMs(currentTime, faker.number.int({ min: 500, max: 3000 }));
		}
		
		// 3. page_exit (always on last page, optional on others)
		const shouldExit = isLastPage || faker.datatype.boolean({ probability: 0.7 });
		if (shouldExit) {
			const exitEvent = makeEventBase(ctx, {
				clientId,
				domain,
				session,
				path,
				eventName: 'page_exit',
				time: currentTime,
				pageCount,
			});
			
			// Add exit metrics
			exitEvent.time_on_page = faker.number.float({ min: 5, max: 600, fractionDigits: 1 });
			exitEvent.scroll_depth = faker.number.float({ min: 10, max: 100, fractionDigits: 1 });
			exitEvent.interaction_count = faker.number.int({ min: 0, max: 50 });
			exitEvent.event_id = `exit_${session.sessionId}_${Buffer.from(path).toString('base64')}_${currentTime}`;
			
			events.push(exitEvent);
			currentTime = addMs(currentTime, faker.number.int({ min: 1000, max: 3000 }));
		}
		
		// Stop if we've hit target event count
		if (events.length >= targetEventCount) {
			break;
		}
	}
	
	return events;
}

/**
 * Create base event structure (shared fields)
 */
function makeEventBase(
	ctx: Pick<SeedContext, 'faker' | 'now'>,
	options: {
		clientId: string;
		domain: string;
		session: AnalyticsSession;
		path: string;
		eventName: string;
		time: number;
		pageCount: number;
	}
): AnalyticsEventRecord {
	const { faker } = ctx;
	const { clientId, domain, session, path, eventName, time, pageCount } = options;
	const user = session.user;
	
	const customProps = generateCustomProperties(ctx, eventName);
	
	return {
		id: createId(faker),
		client_id: clientId,
		event_name: eventName,
		anonymous_id: session.anonymousId,
		time,
		session_id: session.sessionId,
		event_type: 'track',
		event_id: undefined,
		session_start_time: session.sessionStartTime,
		referrer: session.referrer === 'direct' ? undefined : session.referrer,
		url: `https://${domain}${path}`,
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
		viewport_size: `${faker.number.int({ min: 800, max: 1920 })}x${faker.number.int({
			min: 600,
			max: 1080,
		})}`,
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
		time_on_page: undefined,
		scroll_depth: undefined,
		interaction_count: undefined,
		page_count: pageCount,
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
		utm_term: faker.helpers.maybe(() => faker.lorem.word(), {
			probability: 0.15,
		}),
		utm_content: faker.helpers.maybe(() => faker.lorem.word(), {
			probability: 0.1,
		}),
		load_time: undefined,
		dom_ready_time: undefined,
		dom_interactive: undefined,
		ttfb: undefined,
		connection_time: undefined,
		request_time: undefined,
		render_time: undefined,
		redirect_time: undefined,
		domain_lookup_time: undefined,
		properties: JSON.stringify(customProps),
		created_at: time,
	};
}

export const CUSTOM_EVENT_NAMES = new Set<string>(CUSTOM_EVENTS as unknown as string[]);

export function isCustomEvent(name: string): boolean {
	return CUSTOM_EVENT_NAMES.has(name);
}

export function toCustomEventRecord(
	event: AnalyticsEventRecord
): AnalyticsCustomEventRecord {
	return {
		id: event.id,
		client_id: event.client_id,
		event_name: event.event_name,
		anonymous_id: event.anonymous_id,
		session_id: event.session_id,
		properties: event.properties,
		timestamp: event.time,
	};
}

export function toOutgoingLinkRecord(
	event: AnalyticsEventRecord
): AnalyticsOutgoingLinkRecord {
	let href = '';
	let text: string | null = null;
	try {
		const props = JSON.parse(event.properties) as Record<string, unknown>;
		if (typeof props.href === 'string') {
			href = props.href;
		}
		if (typeof props.text === 'string') {
			text = props.text;
		}
	} catch {
		// ignore parse errors, fall back to defaults
	}

	return {
		id: event.id,
		client_id: event.client_id,
		anonymous_id: event.anonymous_id,
		session_id: event.session_id,
		href,
		text,
		properties: event.properties,
		timestamp: event.time,
	};
}

export interface MakeErrorEventParams {
	clientId: string;
	domain: string;
	sessions: AnalyticsSession[];
	resources: AnalyticsResources;
}

export function makeErrorEvent(
	ctx: Pick<SeedContext, 'faker' | 'now'>,
	params: MakeErrorEventParams
): AnalyticsErrorRecord {
	const { faker, now } = ctx;
	const session = pickSession(ctx, params.sessions, params.resources);
	const user = session.user;
	const baseTime = recentDateMs(faker, now, { days: 30 });
	const path = faker.helpers.arrayElement(params.resources.paths);

	const errorTypes = ['TypeError', 'ReferenceError', 'SyntaxError', 'NetworkError'];
	const messages = [
		'Cannot read property of undefined',
		'Failed to fetch',
		'Unexpected token',
		'Network request failed',
	];

	return {
		id: createId(faker),
		client_id: params.clientId,
		event_id: createId(faker),
		anonymous_id: session.anonymousId,
		session_id: session.sessionId,
		timestamp: baseTime,
		path,
		message: faker.helpers.arrayElement(messages),
		filename: faker.system.filePath(),
		lineno: faker.number.int({ min: 1, max: 100 }),
		colno: faker.number.int({ min: 1, max: 100 }),
		stack: faker.lorem.paragraph(),
		error_type: faker.helpers.arrayElement(errorTypes),
		ip: faker.internet.ip(),
		user_agent: faker.internet.userAgent(),
		browser_name: user.browser,
		browser_version: faker.system.semver(),
		os_name: user.os,
		os_version: faker.system.semver(),
		device_type: user.deviceType,
		country: user.country,
		region: user.region,
		created_at: baseTime,
	};
}

export interface MakeWebVitalsEventParams {
	clientId: string;
	domain: string;
	sessions: AnalyticsSession[];
	resources: AnalyticsResources;
}

export function makeWebVitalsEvent(
	ctx: Pick<SeedContext, 'faker' | 'now'>,
	params: MakeWebVitalsEventParams
): AnalyticsWebVitalsRecord {
	const { faker, now } = ctx;
	const session = pickSession(ctx, params.sessions, params.resources);
	const user = session.user;
	const baseTime = recentDateMs(faker, now, { days: 30 });
	const path = faker.helpers.arrayElement(params.resources.paths);

	return {
		id: createId(faker),
		client_id: params.clientId,
		event_id: createId(faker),
		anonymous_id: session.anonymousId,
		session_id: session.sessionId,
		timestamp: baseTime,
		path,
		fcp: faker.number.int({ min: 500, max: 4000 }),
		lcp: faker.number.int({ min: 1000, max: 6000 }),
		cls: faker.number.float({ min: 0, max: 0.5, fractionDigits: 3 }),
		fid: faker.number.int({ min: 10, max: 300 }),
		inp: faker.number.int({ min: 50, max: 500 }),
		ip: faker.internet.ip(),
		user_agent: faker.internet.userAgent(),
		browser_name: user.browser,
		browser_version: faker.system.semver(),
		os_name: user.os,
		os_version: faker.system.semver(),
		device_type: user.deviceType,
		country: user.country,
		region: user.region,
		created_at: baseTime,
	};
}



function pickSession(
	ctx: Pick<SeedContext, 'faker' | 'now'>,
	sessions: AnalyticsSession[],
	resources: AnalyticsResources
): AnalyticsSession {
	if (sessions.length === 0) {
		return createSyntheticSession(ctx, resources);
	}

	return ctx.faker.helpers.arrayElement(sessions);
}

function createSyntheticSession(
	ctx: Pick<SeedContext, 'faker' | 'now'>,
	resources: AnalyticsResources
): AnalyticsSession {
	const [user] = buildUserPool(ctx, 1);
	return {
		sessionId: `sess_${createId(ctx.faker)}`,
		anonymousId: user.anonymousId,
		sessionStartTime: recentDateMs(ctx.faker, ctx.now, { days: 30 }),
		user,
		eventsInSession: ctx.faker.number.int({ min: 1, max: 10 }),
		referrer: ctx.faker.helpers.arrayElement(resources.referrers),
	};
}

function generatePaths(ctx: Pick<SeedContext, 'faker'>): string[] {
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

	for (const section of COMPANY_SECTIONS) {
		paths.push(`/${section}`);
	}

	for (const category of BLOG_CATEGORIES) {
		paths.push(`/blog/${category}`);
		for (let index = 0; index < 5; index++) {
			const slug = ctx.faker.lorem.slug({ min: 2, max: 6 });
			paths.push(`/blog/${category}/${slug}`);
		}
	}

	for (const category of PRODUCT_CATEGORIES) {
		paths.push(`/products/${category}`);
		paths.push(`/services/${category}`);
		for (let index = 0; index < 3; index++) {
			const productName = ctx.faker.commerce
				.productName()
				.toLowerCase()
				.replace(/\s+/g, '-');
			paths.push(`/products/${category}/${productName}`);
			paths.push(`/services/${category}/${productName}`);
		}
	}

	return paths;
}

function generateReferrers(): string[] {
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

function generateCustomProperties(
	ctx: Pick<SeedContext, 'faker'>,
	eventName: string
): Record<string, unknown> {
	const { faker } = ctx;

	switch (eventName) {
		case 'page_exit':
			return {};
		case 'link_out':
			return {
				href: faker.internet.url(),
				text: faker.lorem.words({ min: 1, max: 4 }),
			};
		case 'screen_view':
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
				currency: faker.finance.currencyCode(),
				items: faker.number.int({ min: 1, max: 5 }),
				payment_method: faker.helpers.arrayElement([
					'card',
					'apple_pay',
					'google_pay',
					'paypal',
				]),
			};
		case 'signup':
		case 'login':
			return {
				method: faker.helpers.arrayElement(['password', 'oauth', 'magic_link']),
				success: faker.datatype.boolean({ probability: 0.9 }),
			};
		case 'logout':
			return {
				reason: faker.helpers.arrayElement(['manual', 'session_expired', 'timeout']),
			};
		case 'add_to_cart':
		case 'remove_from_cart':
			return {
				product_id: faker.string.alphanumeric(12),
				category: faker.helpers.arrayElement(PRODUCT_CATEGORIES),
				price: faker.number.float({
					min: 5,
					max: 200,
					fractionDigits: 2,
				}),
			};
		case 'feature_toggle':
			return {
				feature: faker.helpers.arrayElement([
					'dark_mode',
					'reports',
					'notifications',
					'experiments',
				]),
				enabled: faker.datatype.boolean(),
			};
		case 'api_call':
			return {
				endpoint: `/${faker.internet.httpMethod().toLowerCase()}/${faker.lorem.slug({
					min: 1,
					max: 3,
				})}`,
				status: faker.helpers.arrayElement([200, 201, 204, 400, 401, 403, 404, 500]),
				duration: faker.number.int({ min: 20, max: 2000 }),
			};
		default:
			return {
				value: faker.number.int({ min: 1, max: 100 }),
			};
	}
}

function generatePageTitle(path: string): string {
	const baseTitle = 'DataBuddy';
	if (path === '/' || path === '/home') {
		return `${baseTitle} - Home`;
	}

	const segments = path.split('/').filter(Boolean);
	return `${segments
		.map((segment) =>
			segment
				.replace(/-/g, ' ')
				.split(' ')
				.map((word) => word[0]?.toUpperCase() + word.slice(1))
				.join(' ')
		)
		.join(' / ')} - ${baseTitle}`;
}
