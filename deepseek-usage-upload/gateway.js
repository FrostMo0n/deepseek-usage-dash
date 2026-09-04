// phone-gateway: serves the PWA (./public) and proxies the dsh usage-stats
// route so the phone can reach your PC's dsh instance over LAN/internet.
//   argv/env: PORT (default 8090), TARGET (default sandbox :3081), ACCESS_TOKEN (optional)
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = Number(process.env.PORT || process.argv[2] || 8090);
const TARGET = process.env.TARGET || process.argv[3] || "http://127.0.0.1:3081/api/dsh/usage-stats";
const ACCESS_TOKEN = (process.env.ACCESS_TOKEN || process.argv[4] || "").trim();
const ROOT = path.join(__dirname, "public");

const MIME = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".svg": "image/svg+xml",
	".png": "image/png",
	".ico": "image/x-icon"
};

function send(res, status, body, type) {
	res.writeHead(status, { "content-type": type || "text/plain; charset=utf-8", "cache-control": "no-store" });
	res.end(body);
}

async function proxyUsage(res) {
	try {
		const upstream = await fetch(TARGET, { signal: AbortSignal.timeout(15000) });
		const text = await upstream.text();
		res.writeHead(upstream.status, {
			"content-type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
			"cache-control": "no-store"
		});
		res.end(text);
	} catch (err) {
		send(res, 502, JSON.stringify({ ok: false, error: `gateway upstream unreachable: ${err.message}` }), "application/json");
	}
}

const server = http.createServer((req, res) => {
	const url = (req.url || "/").split("?")[0];
	if (url === "/api/dsh/usage-stats") {
		if (ACCESS_TOKEN && (req.headers["x-access-token"] || "") !== ACCESS_TOKEN) {
			return void send(res, 401, JSON.stringify({ ok: false, error: "unauthorized" }), "application/json");
		}
		return void proxyUsage(res);
	}
	if (url === "/api/health") {
		return void send(res, 200, JSON.stringify({ ok: true, auth: ACCESS_TOKEN ? "on" : "off" }), "application/json");
	}
	let file = path.normalize(path.join(ROOT, url === "/" ? "index.html" : url));
	if (!file.startsWith(ROOT)) return void send(res, 403, "forbidden");
	if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return void send(res, 404, "not found");
	const ext = path.extname(file).toLowerCase();
	send(res, 200, fs.readFileSync(file), MIME[ext] || "application/octet-stream");
});

server.listen(PORT, "0.0.0.0", () => {
	console.log(`phone gateway: http://0.0.0.0:${PORT}  (target: ${TARGET})`);
});
