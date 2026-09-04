// Generate installable PNG icons (192 & 512) for the PWA without dependencies.
// Simple whale glyph on dark background drawn as pixels, PNG via zlib.
const zlib = require("node:zlib");
const fs = require("node:fs");
const path = require("node:path");

function crc32(buf) {
	let table = crc32.table;
	if (!table) {
		table = crc32.table = new Int32Array(256);
		for (let n = 0; n < 256; n++) {
			let c = n;
			for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
			table[n] = c;
		}
	}
	let crc = -1;
	for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
	return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
	const len = Buffer.alloc(4);
	len.writeUInt32BE(data.length);
	const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(body));
	return Buffer.concat([len, body, crc]);
}

function encodePng(size, draw) {
	const raw = Buffer.alloc(size * (size * 4 + 1));
	for (let y = 0; y < size; y++) {
		raw[y * (size * 4 + 1)] = 0;
		for (let x = 0; x < size; x++) {
			const [r, g, b, a] = draw(x, y, size);
			const o = y * (size * 4 + 1) + 1 + x * 4;
			raw[o] = r;
			raw[o + 1] = g;
			raw[o + 2] = b;
			raw[o + 3] = a;
		}
	}
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(size, 0);
	ihdr.writeUInt32BE(size, 4);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 6; // RGBA
	const idat = zlib.deflateSync(raw, { level: 9 });
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk("IHDR", ihdr),
		chunk("IDAT", idat),
		chunk("IEND", Buffer.alloc(0))
	]);
}

function drawWhale(x, y, s) {
	const cx = s / 2;
	const cy = s * 0.5;
	const r = s * 0.36;
	const dx = x - cx;
	const dy = y - cy;
	// dark background
	if (dx * dx + dy * dy > r * r) return [15, 17, 23, 255];
	// whale body gradient-ish: deep blue circle with lighter top? keep flat navy
	const body = [77, 124, 254, 255];
	const eyeR = s * 0.045;
	const eyeOff = s * 0.11;
	for (const ex of [-eyeOff, eyeOff]) {
		const edx = x - (cx + ex);
		const edy = y - (cy + s * 0.06);
		if (edx * edx + edy * edy <= eyeR * eyeR) return [15, 17, 23, 255];
	}
	// smile: lower arc
	const smX = x - cx;
	const smY = y - (cy + s * 0.16);
	if (smY > 0 && Math.abs(smY - s * 0.06) < s * 0.02 && Math.abs(smX) < s * 0.14 && smY * smY + smX * smX < (s * 0.16) * (s * 0.16)) return [15, 17, 23, 255];
	return body;
}

const dir = path.join(__dirname, "public");
for (const size of [192, 512]) {
	const buf = encodePng(size, drawWhale);
	const out = path.join(dir, `icon-${size}.png`);
	fs.writeFileSync(out, buf);
	console.log("wrote", out, buf.length, "bytes");
}
