// Download cloudflared-windows-amd64.exe with mirror fallbacks + progress.
const fs = require("node:fs");
const out = process.argv[2];
const paths = [
	"https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe",
	"https://ghproxy.net/https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe",
	"https://gh-proxy.com/https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
];

async function grab(url) {
	console.log("trying", url);
	const res = await fetch(url, { signal: AbortSignal.timeout(570000) });
	if (!res.ok) throw new Error("HTTP " + res.status);
	const total = Number(res.headers.get("content-length")) || 0;
	const file = fs.createWriteStream(out);
	let got = 0;
	for await (const chunk of res.body) {
		file.write(chunk);
		got += chunk.length;
		if (total && got % (10 * 1024 * 1024) < 65536) console.log(`... ${(got / 1048576).toFixed(0)}/${(total / 1048576).toFixed(0)} MB`);
	}
	await new Promise((r, j) => file.end((e) => (e ? j(e) : r())));
	console.log("saved", out, got, "bytes");
	return true;
}

(async () => {
	for (const url of paths) {
		try {
			if (await grab(url)) process.exit(0);
		} catch (e) {
			console.error("failed:", e.message);
			fs.rmSync(out, { force: true });
		}
	}
	process.exit(2);
})();
