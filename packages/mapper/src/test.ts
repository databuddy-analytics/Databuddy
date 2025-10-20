#!/usr/bin/env bun

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AnalyticsEvent } from '@databuddy/db';
import { clickHouse, db, TABLE_NAMES, websites } from '@databuddy/db';
import { parse } from 'csv-parse/sync';
import { eq } from 'drizzle-orm';
import type { UmamiCsvRow } from './adapters/umami';
import { adapters, mapEvents } from './index';

const BATCH_SIZE = 1000;
const CSV_FILE_PATH = join(__dirname, 'adapters', 'data', 'mailbuddy.csv');

/**
 * Test script to validate the mapper functionality
 * Reads mailbuddy.csv, maps the data using umami adapter, and inserts into ClickHouse
 */
async function testMapper() {
	try {
		console.log('🚀 Starting mapper test...');

		// Get a website ID from the database
		console.log('🔍 Getting website ID from database...');
		// getby Id 9PBC8d50WKkbx1AdND3cEy
		const website = await db.query.websites.findFirst({
			where: eq(websites.id, '9PBC8d50WKkbx1AdND3cE'),
		});

		if (!website) {
			throw new Error(
				'No websites found in database. Please create a website first.'
			);
		}

		const clientId = website.id;
		console.log(`✅ Using website ID: ${clientId} (${website.domain})`);

		// Read CSV file
		console.log('📖 Reading CSV file...');
		const csvContent = readFileSync(CSV_FILE_PATH, 'utf-8');
		console.log(
			`📊 Read ${csvContent.length.toLocaleString()} characters from CSV`
		);

		// Parse CSV
		console.log('🔄 Parsing CSV data...');
		const rawRows = parse(csvContent, {
			columns: true,
			skip_empty_lines: true,
			skip_records_with_empty_values: true,
		}) as Record<string, string>[];

		console.log(
			`✅ Parsed ${rawRows.length.toLocaleString()} raw rows from CSV`
		);

		// Validate CSV structure
		if (rawRows.length > 0) {
			const firstRow = rawRows[0];
			const expectedFields = [
				'website_id',
				'session_id',
				'visit_id',
				'event_id',
				'hostname',
				'browser',
				'os',
				'device',
				'screen',
				'language',
				'country',
				'region',
				'city',
				'url_path',
				'url_query',
				'utm_source',
				'utm_medium',
				'utm_campaign',
				'utm_content',
				'utm_term',
				'referrer_path',
				'referrer_query',
				'referrer_domain',
				'page_title',
				'gclid',
				'fbclid',
				'msclkid',
				'ttclid',
				'li_fat_id',
				'twclid',
				'event_type',
				'event_name',
				'tag',
				'distinct_id',
				'created_at',
				'job_id',
			];

			const missingFields = expectedFields.filter(
				(field) => !(field in firstRow)
			);
			if (missingFields.length > 0) {
				console.warn(
					`⚠️  CSV missing expected fields: ${missingFields.join(', ')}`
				);
			}
		}

		// Convert to typed UmamiCsvRow
		console.log('🔧 Converting to typed rows...');
		const rows: UmamiCsvRow[] = rawRows.map(
			(row): UmamiCsvRow => ({
				website_id: row.website_id || '',
				session_id: row.session_id || '',
				visit_id: row.visit_id || '',
				event_id: row.event_id || '',
				hostname: row.hostname || '',
				browser: row.browser || '',
				os: row.os || '',
				device: row.device || '',
				screen: row.screen || '',
				language: row.language || '',
				country: row.country || '',
				region: row.region || '',
				city: row.city || '',
				url_path: row.url_path || '',
				url_query: row.url_query || '',
				utm_source: row.utm_source || '',
				utm_medium: row.utm_medium || '',
				utm_campaign: row.utm_campaign || '',
				utm_content: row.utm_content || '',
				utm_term: row.utm_term || '',
				referrer_path: row.referrer_path || '',
				referrer_query: row.referrer_query || '',
				referrer_domain: row.referrer_domain || '',
				page_title: row.page_title || '',
				gclid: row.gclid || '',
				fbclid: row.fbclid || '',
				msclkid: row.msclkid || '',
				ttclid: row.ttclid || '',
				li_fat_id: row.li_fat_id || '',
				twclid: row.twclid || '',
				event_type: row.event_type || '',
				event_name: row.event_name || '',
				tag: row.tag || '',
				distinct_id: row.distinct_id || '',
				created_at: row.created_at || '',
				job_id: row.job_id || '',
			})
		);

		console.log(
			`✅ Converted ${rows.length.toLocaleString()} rows to typed format`
		);

		console.log('🔄 Mapping events using enhanced umami adapter...');
		const events = mapEvents(adapters.umami(clientId, rows), rows);

		console.log(
			`✅ Mapped ${events.length.toLocaleString()} events for client: ${clientId}`
		);

		// Show sample of enhanced mapped events
		const sampleEvents = events.slice(0, 5);
		console.log('📋 Sample enhanced mapped events:');
		sampleEvents.forEach((event, i) => {
			const eventType =
				event.event_name === 'page_exit' ? '🚪 EXIT' : '👁️  VIEW';
			console.log(
				`  Event ${i + 1}: ${eventType} - ${event.browser_name} on ${event.os_name} - ${event.path}`
			);
		});

		// Show statistics of enhanced features
		const pageExits = events.filter((e) => e.event_name === 'page_exit').length;
		const pageViews = events.filter(
			(e) => e.event_name === 'screen_view'
		).length;
		const uniqueBrowsers = new Set(events.map((e) => e.browser_name)).size;
		const formattedBrowsers = events.filter(
			(e) => e.browser_name !== e.browser_name.toLowerCase()
		).length;

		console.log('📈 Enhanced mapping results:');
		console.log(
			`   • Event types: ${pageViews} page views, ${pageExits} page exits`
		);
		console.log(
			`   • Browser formatting: ${formattedBrowsers} events with capitalized browsers (${uniqueBrowsers} unique)`
		);

		// Insert into ClickHouse
		console.log('💾 Starting batch insertion into ClickHouse...');
		await insertEventsInBatches(events, BATCH_SIZE);

		console.log(
			`🎉 Successfully processed ${events.length.toLocaleString()} events for website: ${website.domain} (${clientId})`
		);
	} catch (error) {
		console.error('❌ Test failed:', error);
		process.exit(1);
	}
}

async function insertEventsInBatches(
	events: AnalyticsEvent[],
	batchSize: number
) {
	const totalBatches = Math.ceil(events.length / batchSize);
	let totalInserted = 0;

	console.log(
		`📦 Processing ${totalBatches} batches of up to ${batchSize} events each`
	);

	for (let i = 0; i < totalBatches; i++) {
		const start = i * batchSize;
		const end = Math.min(start + batchSize, events.length);
		const batch = events.slice(start, end);

		console.log(
			`🔄 Inserting batch ${i + 1}/${totalBatches} (${batch.length} events)...`
		);

		await clickHouse.insert({
			table: TABLE_NAMES.events,
			values: batch,
			format: 'JSONEachRow',
		});

		totalInserted += batch.length;
		console.log(
			`✅ Batch ${i + 1}/${totalBatches} completed (${totalInserted}/${events.length} total events)`
		);
	}

	console.log(`💾 All ${totalBatches} batches inserted successfully`);
}

if (import.meta.main) {
	await testMapper();
}
