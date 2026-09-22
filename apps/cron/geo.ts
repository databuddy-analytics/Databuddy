/** biome-ignore-all lint/suspicious/noBitwiseOperators: We need it */

import { AddressNotFoundError, Reader } from "@maxmind/geoip2-node";

const CDN_URL = "https://cdn.databuddy.cc/mmdb/GeoLite2-City.mmdb";

const REGIONS: Record<string, string[]> = {
	NA: [
		"3.0.0.0/8",
		"8.0.0.0/8",
		"63.0.0.0/8",
		"64.0.0.0/8",
		"65.0.0.0/8",
		"66.0.0.0/8",
		"67.0.0.0/8",
		"68.0.0.0/8",
		"72.0.0.0/8",
		"73.0.0.0/8",
		"74.0.0.0/8",
		"75.0.0.0/8",
		"76.0.0.0/8",
		"98.0.0.0/8",
		"99.0.0.0/8",
		"104.0.0.0/8",
		"107.0.0.0/8",
		"108.0.0.0/8",
	],
	EU: [
		"2.0.0.0/8",
		"5.0.0.0/8",
		"31.0.0.0/8",
		"46.0.0.0/8",
		"51.0.0.0/8",
		"62.0.0.0/8",
		"77.0.0.0/8",
		"78.0.0.0/8",
		"79.0.0.0/8",
		"80.0.0.0/8",
		"81.0.0.0/8",
		"82.0.0.0/8",
		"83.0.0.0/8",
		"84.0.0.0/8",
		"85.0.0.0/8",
		"86.0.0.0/8",
		"87.0.0.0/8",
		"88.0.0.0/8",
		"89.0.0.0/8",
		"90.0.0.0/8",
		"91.0.0.0/8",
		"92.0.0.0/8",
		"93.0.0.0/8",
		"94.0.0.0/8",
		"95.0.0.0/8",
		"109.0.0.0/8",
		"176.0.0.0/8",
		"178.0.0.0/8",
		"188.0.0.0/8",
		"193.0.0.0/8",
		"194.0.0.0/8",
		"195.0.0.0/8",
		"212.0.0.0/8",
		"213.0.0.0/8",
		"217.0.0.0/8",
	],
	AS: [
		"1.0.0.0/8",
		"14.0.0.0/8",
		"27.0.0.0/8",
		"36.0.0.0/8",
		"39.0.0.0/8",
		"42.0.0.0/8",
		"49.0.0.0/8",
		"58.0.0.0/8",
		"59.0.0.0/8",
		"60.0.0.0/8",
		"61.0.0.0/8",
		"101.0.0.0/8",
		"103.0.0.0/8",
		"106.0.0.0/8",
		"110.0.0.0/8",
		"111.0.0.0/8",
		"112.0.0.0/8",
		"113.0.0.0/8",
		"114.0.0.0/8",
		"115.0.0.0/8",
		"116.0.0.0/8",
		"117.0.0.0/8",
		"118.0.0.0/8",
		"119.0.0.0/8",
		"120.0.0.0/8",
		"121.0.0.0/8",
		"122.0.0.0/8",
		"123.0.0.0/8",
		"124.0.0.0/8",
		"125.0.0.0/8",
		"126.0.0.0/8",
		"175.0.0.0/8",
		"180.0.0.0/8",
		"182.0.0.0/8",
		"183.0.0.0/8",
		"202.0.0.0/8",
		"203.0.0.0/8",
		"210.0.0.0/8",
		"211.0.0.0/8",
		"218.0.0.0/8",
		"219.0.0.0/8",
		"220.0.0.0/8",
		"221.0.0.0/8",
		"222.0.0.0/8",
		"223.0.0.0/8",
	],
	SA: [
		"177.0.0.0/8",
		"179.0.0.0/8",
		"181.0.0.0/8",
		"186.0.0.0/8",
		"187.0.0.0/8",
		"189.0.0.0/8",
		"190.0.0.0/8",
		"191.0.0.0/8",
		"200.0.0.0/8",
		"201.0.0.0/8",
	],
	AF: [
		"41.0.0.0/8",
		"102.0.0.0/8",
		"105.0.0.0/8",
		"154.0.0.0/8",
		"196.0.0.0/8",
		"197.0.0.0/8",
	],
	OC: [
		"1.120.0.0/13",
		"1.128.0.0/11",
		"49.176.0.0/12",
		"101.160.0.0/11",
		"110.140.0.0/14",
		"120.144.0.0/12",
		"121.44.0.0/14",
		"122.56.0.0/13",
		"203.0.0.0/10",
	],
};

function randomIP(cidr: string): string {
	const [base, mask] = cidr.split("/");
	const p = base.split(".").map(Number);
	let ip = (p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3];
	ip += Math.floor(Math.random() * 2 ** (32 - Number(mask)));
	return [
		(ip >>> 24) & 255,
		(ip >>> 16) & 255,
		(ip >>> 8) & 255,
		ip & 255,
	].join(".");
}

function pickRandom<T>(arr: T[]): T {
	return arr[Math.floor(Math.random() * arr.length)];
}

function fmt(n: number): string {
	if (n >= 1e6) {
		return `${(n / 1e6).toFixed(1)}M`;
	}
	if (n >= 1e3) {
		return `${(n / 1e3).toFixed(1)}K`;
	}
	return String(n);
}

async function main() {
	const count = Number(process.argv[2]) || 100_000;
	const regionKeys = Object.keys(REGIONS);

	console.log(`\n=== Geo Benchmark: ${fmt(count)} IPs ===\n`);

	// Load DB
	const dbStart = performance.now();
	const res = await fetch(CDN_URL);
	const reader = Reader.openBuffer(Buffer.from(await res.arrayBuffer()));
	console.log(
		`DB loaded: ${((performance.now() - dbStart) / 1000).toFixed(2)}s\n`
	);

	// Benchmark
	const stats: Record<
		string,
		{ total: number; match: number; notFound: number }
	> = {};
	for (const r of regionKeys) {
		stats[r] = { total: 0, match: 0, notFound: 0 };
	}

	const start = performance.now();
	for (let i = 0; i < count; i++) {
		const expected = pickRandom(regionKeys);
		const ip = randomIP(pickRandom(REGIONS[expected]));
		stats[expected].total++;

		try {
			const { continent } = (
				reader as { city(ip: string): { continent?: { code?: string } } }
			).city(ip);
			if (continent?.code === expected) {
				stats[expected].match++;
			} else if (!continent?.code) {
				stats[expected].notFound++;
			}
		} catch (e) {
			if (e instanceof AddressNotFoundError) {
				stats[expected].notFound++;
			}
		}
	}
	const duration = performance.now() - start;

	// Results
	let totalMatch = 0,
		totalNotFound = 0;
	console.log("Region     Accuracy    Matched     NotFound");
	console.log("------     --------    -------     --------");
	for (const [r, s] of Object.entries(stats)) {
		totalMatch += s.match;
		totalNotFound += s.notFound;
		const acc = s.total ? ((s.match / s.total) * 100).toFixed(1) : "0";
		console.log(
			`${r.padEnd(10)} ${`${acc}%`.padStart(7)}     ${fmt(s.match).padStart(7)}     ${fmt(s.notFound).padStart(7)}`
		);
	}

	console.log(
		`\nTotal: ${fmt(totalMatch)}/${fmt(count)} (${((totalMatch / count) * 100).toFixed(1)}%) accurate`
	);
	console.log(
		`Not found: ${fmt(totalNotFound)} (${((totalNotFound / count) * 100).toFixed(1)}%)`
	);
	console.log(
		`Time: ${(duration / 1000).toFixed(2)}s | Rate: ${fmt(Math.floor(count / (duration / 1000)))}/s`
	);
}

main();
