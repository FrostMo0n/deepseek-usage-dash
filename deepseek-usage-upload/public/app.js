/* DeepSeek 余额看板 — phone PWA */
(() => {
	"use strict";

	const LS_KEY = "deepseek-usage.key";
	const LS_BACKEND = "deepseek-usage.backend";
	const BALANCE_URL = "https://api.deepseek.com/user/balance";
	const POLL_MS = 30000;

	const $ = (id) => document.getElementById(id);
	const statusEl = $("status");
	let timer = null;

	function setStatus(text, isError) {
		statusEl.textContent = text || "";
		statusEl.style.color = isError ? "#ff8a8a" : "";
	}

	function fmtMoney(n) {
		if (n == null || Number.isNaN(n)) return "–";
		const d = n >= 100 ? 0 : n >= 1 ? 2 : 4;
		return n.toLocaleString("zh-CN", { minimumFractionDigits: d, maximumFractionDigits: d });
	}
	function fmtTokens(n) {
		if (n == null || Number.isNaN(n)) return "–";
		if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
		if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
		if (n >= 1e3) return (n / 1e3).toFixed(1) + "k";
		return String(Math.round(n));
	}
	const sym = "¥";
	const nowLabel = () => new Date().toLocaleTimeString("zh-CN", { hour12: false });

	async function fetchBalance(key) {
		const res = await fetch(BALANCE_URL, {
			headers: { authorization: `Bearer ${key}`, accept: "application/json" },
			signal: AbortSignal.timeout(15000)
		});
		const body = await res.json().catch(() => ({}));
		if (!res.ok) {
			const msg = (body && body.error && body.error.message) || `HTTP ${res.status}`;
			const err = new Error(msg);
			err.status = res.status;
			throw err;
		}
		return body;
	}

	function renderBalance(body) {
		const infos = Array.isArray(body.balance_infos) ? body.balance_infos : [];
		const info = infos.find((e) => e && e.currency === "CNY") || infos[0];
		if (!info) throw new Error("响应中没有余额信息");
		const total = Number.parseFloat(info.total_balance || "0");
		const granted = Number.parseFloat(info.granted_balance || "0");
		const topped = Number.parseFloat(info.topped_up_balance || "0");
		$("balanceValue").textContent = `${sym}${fmtMoney(total)}`;
		$("balanceValue").classList.toggle("neg", total < 5);
		$("balanceSub").textContent = `充值 ${sym}${fmtMoney(topped)} · 赠送 ${sym}${fmtMoney(granted)} · ${info.currency || "CNY"}`;
		$("balanceMeta").textContent = `更新时间 ${nowLabel()}`;
	}

	function fmtSpend(payload) {
		if (!payload || payload.ok !== true) return null;
		const b = payload.balance;
		const s = payload.spend;
		const today = payload.today;
		const total = payload.total;
		return { b, s, today, total, p: payload.prices };
	}

	function renderStats(f) {
		const body = $("statsBody");
		body.innerHTML = "";
		if (!f) return;
		const box = (label, value, cls, full) => {
			const el = document.createElement("div");
			if (full) el.classList.add("full");
			el.innerHTML = `<span class="k">${label}</span><br><span class="v ${cls || ""}">${value}</span>`;
			body.appendChild(el);
		};
		const cur = sym;
		if (f.b && typeof f.b.total === "number") {
			$("statsSource").textContent = "后端实测";
			$("statsSource").classList.add("ok");
			box("余额", `${cur}${fmtMoney(f.b.total)}`, "hl");
		}
		if (f.s && f.s.mode !== "unavailable") {
			box("本次运行花费(对账)", `${cur}${fmtMoney(f.s.total)}`, "hl", true);
			const note = `后台已确认 ${cur}${fmtMoney(f.s.settled)}`;
			box("后台已确认", note, "dim", true);
			if (f.s.trailingEstimate > 0) box("尾窗估算(近N分)", `${cur}${fmtMoney(f.s.trailingEstimate)}`, "dim", true);
		} else if (f.today) {
			box("累计花费(估算)", `${cur}${fmtMoney(f.total ? f.total.cost : 0)}`, "hl", true);
		}
		for (const [name, scope] of [["今日", f.today], ["累计", f.total]]) {
			if (!scope) continue;
			box(name + " token", `${fmtTokens(scope.tokens)}`, "hl");
			let parts = [];
			if (scope.inputTokens) parts.push(`${fmtTokens(scope.inputTokens)} 输入`);
			if (scope.cacheReadTokens) parts.push(`${fmtTokens(scope.cacheReadTokens)} 缓存`);
			if (scope.outputTokens) parts.push(`${fmtTokens(scope.outputTokens)} 输出`);
			box(name + " 构成", parts.join(" · ") || "0", "dim");
			box(name + " 缓存命中", scope.cacheRate != null ? scope.cacheRate.toFixed(1) + "%" : "–", "dim");
			box(name + " 花费(估)", `${cur}${fmtMoney(scope.cost)}`, "dim");
		}
		if (f.s && f.s.mode === "pending") {
			box("注:运行未满 20 分钟,花费以估算为主", "将随后台自动校准", "dim", true);
		}
	}

	async function refresh() {
		const key = $("apiKey").value.trim() || localStorage.getItem(LS_KEY) || "";
		const backend = $("backend").value.trim() || localStorage.getItem(LS_BACKEND) || "";
		$("apiKey").value = key;
		$("backend").value = backend;
		let any = false;

		// 1) token/spend from optional backend (dsh gateway / sandbox)
		if (backend) {
			try {
				const res = await fetch(backend, { credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(12000) });
				const payload = await res.json();
				if (payload && payload.ok) {
					renderStats(fmtSpend(payload));
					any = true;
				} else {
					throw new Error((payload && payload.error) || "bad payload");
				}
			} catch (err) {
				$("statsBody").innerHTML = `<p class="dim">后端不可达:${err.message}</p>`;
			}
		}
		// 2) balance (direct to api.deepseek.com)
		if (key) {
			try {
				const body = await fetchBalance(key);
				renderBalance(body);
				any = true;
				setStatus(`已更新 ${nowLabel()}`);
			} catch (err) {
				setStatus("余额查询失败:" + err.message, true);
				$("balanceMeta").textContent = "查询失败:" + err.message;
			}
		} else if (!any) {
			$("balanceValue").textContent = "——";
			$("balanceSub").textContent = "请先填入 API Key";
			setStatus("未配置 API Key", true);
		}
	}

	function armTimer() {
		if (timer) clearInterval(timer);
		timer = setInterval(refresh, POLL_MS);
	}

	$("refreshBtn").addEventListener("click", () => refresh().then(armTimer));
	$("testKeyBtn").addEventListener("click", async () => {
		localStorage.setItem(LS_KEY, $("apiKey").value.trim());
		localStorage.setItem(LS_BACKEND, $("backend").value.trim());
		setStatus("测试中…");
		await refresh();
		armTimer();
	});
	$("clearBtn").addEventListener("click", () => {
		localStorage.removeItem(LS_KEY);
		localStorage.removeItem(LS_BACKEND);
		$("apiKey").value = "";
		$("backend").value = "";
		location.reload();
	});
	$("settingsToggle").addEventListener("click", () => $("settingsToggle").parentElement.classList.toggle("open"));

	refresh().then(armTimer).catch(() => {});
})();
