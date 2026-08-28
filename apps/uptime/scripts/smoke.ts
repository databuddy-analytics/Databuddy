const res = await fetch("http://127.0.0.1:4100/health/status");
if (!(res.status === 200 || res.status === 503)) {
	console.error(`unexpected status ${res.status}`);
	process.exit(1);
}
const body = (await res.json()) as { services?: unknown; status?: string };
if (!(body.services && body.status)) {
	console.error(`unexpected body ${JSON.stringify(body)}`);
	process.exit(1);
}
console.log(`smoke ok: ${body.status}`);
