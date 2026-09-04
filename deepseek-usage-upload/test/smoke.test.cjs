// Smoke test: serves the gateway against a fake upstream and checks the page,
// the proxied usage API and the health endpoint. No dsh instance required.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { spawn } = require("node:child_process");
const path = require("node:path");

const GATEWAY = path.join(__dirname, "..", "gateway.js");

function listen(server) {
	return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
}

async function waitFor(url, attempts = 40) {
	for (let i = 0; i < attempts; i++) {
		try {
			const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
			if (res.status < 500) return res;
		} catch {
			/* retry */
		}
		await new Promise((r) => setTimeout(r, 300));
	}
	throw new Error("gateway did not come up: " + url);
}

test("gateway serves the PWA and proxies usage data", async () => {
	// fake upstream (stands in for the dsh usage-stats route)
	const upstream = http.createServer((req, res) => {
		res.writeHead(200, { "content-type": "application/json" });
		res.end(JSON.stringify({ ok: true, balance: { total: 12.34, currency: "CNY" }, total: { tokens: 999, cost: 0.5 }, today: { tokens: 5, cost: 0.01 } }));
	});
	const upstreamPort = await listen(upstream);

	const port = 18000 + Math.floor(Math.random() * 2000);
	const gw = spawn(process.execPath, [GATEWAY, String(port), `http://127.0.0.1:${upstreamPort}/api/dsh/usage-stats`], {
		stdio: "ignore"
	});
	try {
		const base = `http://127.0.0.1:${port}`;
		await waitFor(base + "/api/health");
		const page = await (await fetch(base + "/", { signal: AbortSignal.timeout(3000) })).text();
		assert.ok(page.includes("DeepSeek 看板"), "index served");
		const apiRes = await fetch(base + "/api/dsh/usage-stats", { signal: AbortSignal.timeout(3000) });
		assert.equal(apiRes.status, 200);
		const data = await apiRes.json();
		assert.equal(data.ok, true);
		assert.equal(data.balance.total, 12.34);
		assert.equal(data.total.tokens, 999);
		const health = await (await fetch(base + "/api/health", { signal: AbortSignal.timeout(3000) })).json();
		assert.equal(health.ok, true);
	} finally {
		gw.kill();
		upstream.close();
	}
});
