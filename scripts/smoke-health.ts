const url = process.argv[2];
if (!url) {
	process.stderr.write("usage: smoke-health.ts <url>\n");
	process.exit(1);
}

const response = await fetch(url);
if (!(response.status === 200 || response.status === 503)) {
	process.stderr.write(`unexpected status ${response.status}\n`);
	process.exit(1);
}

const body = (await response.json()) as { status?: string };
if (!body.status) {
	process.stderr.write(`unexpected body ${JSON.stringify(body)}\n`);
	process.exit(1);
}

process.stdout.write(`smoke ok: ${body.status}\n`);
