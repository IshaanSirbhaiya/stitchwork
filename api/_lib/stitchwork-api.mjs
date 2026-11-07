// src/engine/mask.ts
var CARD_CANDIDATE = /\b\d(?:[ -]?\d){12,18}\b/g;
var NRIC = /\b[STFGM]\d{7}[A-Z]\b/gi;
function luhnValid(digits) {
	if (!/^\d{13,19}$/.test(digits)) return false;
	let sum = 0;
	let double = false;
	for (let i = digits.length - 1; i >= 0; i--) {
		let d = digits.charCodeAt(i) - 48;
		if (double) {
			d *= 2;
			if (d > 9) d -= 9;
		}
		sum += d;
		double = !double;
	}
	return sum % 10 === 0;
}
function maskSensitive(text) {
	return text.replace(CARD_CANDIDATE, (match) => {
		const digits = match.replace(/[ -]/g, "");
		return luhnValid(digits) ? `[card ending ${digits.slice(-4)}]` : match;
	}).replace(NRIC, "[ID masked]");
}
// src/engine/adapters/chat.ts
/** One document per message, so each message carries its own timestamp as its version date. */
function parseChat(data, sourceName = "Hollowmere Chat") {
	const warnings = [];
	const documents = [];
	const acl = data.private ? {
		groups: [],
		users: data.members ?? []
	} : {
		groups: data.groups?.length ? data.groups : ["everyone"],
		users: []
	};
	if (data.private && !(data.members ?? []).length) warnings.push(`#${data.channel}: private channel with no members; nobody can read it`);
	data.messages.forEach((m, i) => {
		if (!m.text?.trim()) {
			warnings.push(`#${data.channel}: message ${i} is empty and was skipped`);
			return;
		}
		const ts = m.ts ?? `message-${i}`;
		const id = `chat:${data.channel}:${ts}`;
		documents.push({
			id,
			kind: "chat",
			title: `#${data.channel}, ${m.user ?? "unknown"}`,
			sourceName,
			docKey: id,
			version: 1,
			updatedAt: m.ts ?? "1970-01-01",
			status: "active",
			acl: {
				groups: [...acl.groups],
				users: [...acl.users]
			},
			passages: [{
				location: `#${data.channel} @ ${ts}`,
				text: maskSensitive(`${m.user ?? "unknown"}: ${m.text.trim()}`)
			}]
		});
	});
	return {
		documents,
		warnings
	};
}
// src/engine/adapters/sheet.ts
var MAX_SHEET_ROWS = 2e3;
/** RFC 4180 style CSV parser: quoted fields, doubled quotes, CRLF or LF. */
function parseCsv(text) {
	const rows = [];
	let row = [];
	let field = "";
	let inQuotes = false;
	const src = text.replace(/^﻿/, "");
	for (let i = 0; i < src.length; i++) {
		const c = src[i];
		if (inQuotes) {
			if (c === "\"") {
				if (src[i + 1] === "\"") {
					field += "\"";
					i++;
				} else inQuotes = false;
			} else field += c;
			continue;
		}
		if (c === "\"") inQuotes = true;
		else if (c === ",") {
			row.push(field);
			field = "";
		} else if (c === "\n" || c === "\r") {
			if (c === "\r" && src[i + 1] === "\n") i++;
			row.push(field);
			rows.push(row);
			row = [];
			field = "";
		} else field += c;
	}
	if (field.length || row.length) {
		row.push(field);
		rows.push(row);
	}
	return rows.filter((r) => r.some((f) => f.trim() !== ""));
}
function parseSheet(csv, meta, sourceName = "Hollowmere Sheets") {
	const warnings = [];
	const [header, ...data] = parseCsv(csv);
	if (!header) return {
		documents: [],
		warnings: [`${meta.title}: empty sheet`]
	};
	if (data.length > 2e3) warnings.push(`${meta.title}: ${data.length} rows found, only the first ${MAX_SHEET_ROWS} were read`);
	const passages = data.slice(0, MAX_SHEET_ROWS).map((r, i) => ({
		location: `row ${i + 2}`,
		text: maskSensitive(header.map((h, j) => `${h.trim()}: ${(r[j] ?? "").trim()}`).join("; ") + ".")
	}));
	return {
		documents: [{
			id: meta.id,
			kind: "sheet",
			title: meta.title,
			sourceName,
			docKey: meta.docKey ?? meta.id,
			version: meta.version ?? 1,
			updatedAt: meta.updatedAt ?? "1970-01-01",
			status: meta.status ?? "active",
			acl: {
				groups: meta.groups?.length || meta.users?.length ? meta.groups ?? [] : ["everyone"],
				users: meta.users ?? []
			},
			passages
		}],
		warnings
	};
}
// src/engine/adapters/tickets.ts
function parseTickets(data, sourceName = "Hollowmere Tracker") {
	const warnings = [];
	const documents = [];
	const projectGroups = data.groups?.length ? data.groups : ["everyone"];
	data.issues.forEach((issue, i) => {
		if (!issue.key) {
			warnings.push(`${data.project}: issue at index ${i} has no key and was skipped`);
			return;
		}
		const text = maskSensitive([
			`${issue.key}: ${issue.summary ?? "(no summary)"}.`,
			`Status: ${issue.status ?? "unknown"}.`,
			issue.description ?? ""
		].join(" ").trim());
		const securityGroups = issue.security?.length ? issue.security : void 0;
		documents.push({
			id: issue.key,
			kind: "ticket",
			title: `${issue.key} ${issue.summary ?? ""}`.trim(),
			sourceName,
			docKey: issue.docKey ?? issue.key,
			version: issue.version ?? 1,
			updatedAt: issue.updated ?? "1970-01-01",
			status: "active",
			acl: {
				groups: securityGroups ?? projectGroups,
				users: issue.users ?? []
			},
			passages: [{
				location: `${data.project} / ${issue.key}`,
				text
			}]
		});
	});
	return {
		documents,
		warnings
	};
}
// src/engine/adapters/wiki.ts
var MAX_PASSAGE_CHARS = 1200;
function parseFrontMatter(raw) {
	const text = raw.replace(/^﻿/, "");
	const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
	if (!m) return {
		meta: {},
		body: text
	};
	const meta = {};
	const unquote = (s) => s.trim().replace(/^["']|["']$/g, "");
	let openList = null;
	for (const line of m[1].split(/\r?\n/)) {
		const item = /^\s*-\s+(.*)$/.exec(line);
		if (item && openList) {
			openList.push(unquote(item[1]));
			continue;
		}
		openList = null;
		const kv = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/.exec(line.trim());
		if (!kv) continue;
		const [, key, value] = kv;
		const list = /^\[(.*)\]$/.exec(value);
		if (value === "") meta[key] = openList = [];
		else meta[key] = list ? list[1].split(",").map(unquote).filter(Boolean) : unquote(value);
	}
	return {
		meta,
		body: text.slice(m[0].length)
	};
}
function asString(v, fallback) {
	if (v === void 0) return fallback;
	return Array.isArray(v) ? v.join(", ") : v || fallback;
}
function asList(v) {
	if (v === void 0) return [];
	return Array.isArray(v) ? v : v.split(",").map((s) => s.trim()).filter(Boolean);
}
function chunk(text) {
	const clean = text.trim();
	if (clean.length <= 1200) return clean ? [clean] : [];
	const out = [];
	let current = "";
	for (const para of clean.split(/\n\s*\n/)) {
		const p = para.trim();
		if (!p) continue;
		if (p.length > 1200) {
			if (current) out.push(current);
			current = "";
			for (let i = 0; i < p.length; i += MAX_PASSAGE_CHARS) out.push(p.slice(i, i + MAX_PASSAGE_CHARS));
			continue;
		}
		if (current && current.length + 2 + p.length > 1200) {
			out.push(current);
			current = p;
		} else current = current ? `${current}\n\n${p}` : p;
	}
	if (current) out.push(current);
	return out;
}
var STATUSES = [
	"active",
	"superseded",
	"archived"
];
function parseWiki(raw, fileName, sourceName = "Hollowmere Wiki") {
	const warnings = [];
	const { meta, body } = parseFrontMatter(raw);
	const baseName = fileName.replace(/\.(md|markdown|txt)$/i, "");
	const id = asString(meta.id, baseName);
	const groups = asList(meta.groups);
	const users = asList(meta.users);
	const versionNum = Number.parseInt(asString(meta.version, "1"), 10);
	const statusRaw = asString(meta.status, "active");
	if (meta.status !== void 0 && !STATUSES.includes(statusRaw)) warnings.push(`${fileName}: unknown status "${statusRaw}", using active`);
	const lines = body.replace(/\r\n/g, "\n").split("\n");
	const sections = [{
		heading: "Overview",
		text: []
	}];
	for (const line of lines) {
		const h = /^##\s+(.+?)\s*#*\s*$/.exec(line);
		if (h) sections.push({
			heading: h[1],
			text: []
		});
		else if (!/^#\s+/.test(line)) sections[sections.length - 1].text.push(line);
	}
	const passages = [];
	for (const s of sections) {
		const parts = chunk(maskSensitive(s.text.join("\n")));
		parts.forEach((text, i) => passages.push({
			location: parts.length > 1 ? `${s.heading} (part ${i + 1})` : s.heading,
			text
		}));
	}
	return {
		documents: [{
			id,
			kind: "wiki",
			title: asString(meta.title, baseName),
			sourceName,
			docKey: asString(meta.docKey, id),
			version: Number.isFinite(versionNum) && versionNum > 0 ? versionNum : 1,
			updatedAt: asString(meta.updated, "1970-01-01"),
			status: STATUSES.includes(statusRaw) ? statusRaw : "active",
			acl: {
				groups: meta.groups === void 0 && meta.users === void 0 ? ["everyone"] : groups,
				users
			},
			passages
		}],
		warnings
	};
}
// src/data/chat.ts
var CHAT_EXPORTS = [
	{
		channel: "claims-floor",
		groups: ["staff"],
		messages: [
			{
				ts: "2026-10-02T09:14:00Z",
				user: "devon",
				text: "Reminder for the phones today: the refund window is 30 days, customers love it."
			},
			{
				ts: "2026-10-09T11:02:00Z",
				user: "mara",
				text: "Storm surge claims over SGD 20,000 come to me. Please photograph the water line first."
			},
			{
				ts: "2026-10-21T15:40:00Z",
				user: "devon",
				text: "A caller read out their card 4111 1111 1111 1111 to pay the excess, I logged it on the claim."
			}
		]
	},
	{
		channel: "sales-deals",
		groups: ["sales"],
		messages: [{
			ts: "2026-10-18T10:05:00Z",
			user: "theo",
			text: "Gravewell Logistics renewal is on track. They are asking for a 12 percent discount on the fleet policy."
		}, {
			ts: "2026-10-19T08:30:00Z",
			user: "rhea",
			text: "12 percent is above account manager authority, so it goes to the Head of Sales."
		}]
	},
	{
		channel: "fincrime-room",
		private: true,
		members: ["iris"],
		messages: [{
			ts: "2026-10-30T17:20:00Z",
			user: "iris",
			text: "FIN-13: holding all Gravewell Logistics refunds. Director ID S1234567D matches a prior case. Do not inform the account team."
		}]
	}
];
// src/data/sheets.ts
var SHEETS = [
	[{
		id: "premium-rates-2025",
		title: "Premium Rates 2025",
		docKey: "premium-rates",
		version: 1,
		updatedAt: "2025-01-05",
		groups: ["sales", "compliance"]
	}, `product,annual rate,minimum premium
Home Basic,1.8%,"SGD 240"
Fleet Cover,3.1%,"SGD 1,900"
`],
	[{
		id: "premium-rates-2026",
		title: "Premium Rates 2026",
		docKey: "premium-rates",
		version: 2,
		updatedAt: "2026-07-01",
		groups: ["sales", "compliance"]
	}, `product,annual rate,minimum premium
Home Basic,2.0%,"SGD 260"
Fleet Cover,3.4%,"SGD 2,050"
`],
	[{
		id: "claims-kpis",
		title: "Claims KPIs Q3 2026",
		updatedAt: "2026-10-05",
		groups: ["staff"]
	}, `month,claims logged,median days to acknowledge
July,312,1.6
August,298,1.4
September,355,1.9
`],
	[{
		id: "headcount",
		title: "Headcount by Team",
		updatedAt: "2026-09-30",
		groups: ["hr"]
	}, `team,headcount,open roles
Claims,14,2
Sales,9,1
Compliance,4,0
`]
];
// src/data/tickets.ts
var TICKET_EXPORTS = [
	{
		project: "CLM",
		groups: ["staff"],
		issues: [
			{
				key: "CLM-101",
				summary: "Storm surge claims backlog",
				status: "In Progress",
				updated: "2026-10-28",
				description: "Forty one storm surge claims from the October high tide are waiting for assessment. Two extra assessors start Monday."
			},
			{
				key: "CLM-114",
				summary: "Website still shows the old refund window",
				status: "To Do",
				updated: "2026-10-15",
				description: "The public FAQ page still says refunds are possible within 30 days. The handbook changed this to 14 days in September."
			},
			{
				summary: "Draft without a key (malformed export row)",
				status: "To Do"
			}
		]
	},
	{
		project: "OPS",
		groups: ["staff"],
		issues: [{
			key: "OPS-7",
			summary: "Claims portal outage on 12 October",
			status: "Done",
			updated: "2026-10-14",
			description: "The claims portal was down for 47 minutes because an expired TLS certificate broke the upload service. The certificate is now renewed automatically."
		}]
	},
	{
		project: "FIN",
		groups: ["fincrime"],
		issues: [{
			key: "FIN-13",
			summary: "Suspicious premium refunds: Gravewell Logistics",
			status: "Investigating",
			updated: "2026-10-30",
			security: ["fincrime"],
			description: "Gravewell Logistics requested nine cancellations and refunds in six weeks to different bank accounts. Investigation open; refunds held. Case lead: Iris Vane."
		}]
	},
	{
		project: "HR",
		groups: ["hr"],
		issues: [{
			key: "HR-4",
			summary: "Annual salary review cycle",
			status: "In Progress",
			updated: "2026-10-01",
			description: "Salary review letters go out on 1 December. Managers submit recommendations by 15 November."
		}]
	},
	{
		project: "FAC",
		groups: ["everyone"],
		issues: [{
			key: "FAC-3",
			summary: "Lantern room heating broken",
			status: "Assigned",
			updated: "2026-11-02",
			description: "Sam Pike from facilities fixes the lantern room heating on Thursday. Until then the heater trips the breaker."
		}]
	}
];
// src/data/wiki.ts
var WIKI_PAGES = [
	["claims-handbook-v1.md", `---
id: claims-handbook-v1
title: Claims Handbook
docKey: claims-handbook
version: 1
updated: 2025-03-10
groups: [staff]
---
# Claims Handbook

## Refund window
Customers who cancel a policy get a full premium refund within 30 days of purchase. After 30 days the refund is pro rata.

## Acknowledging claims
Acknowledge every new claim within 5 working days. Use the standard acknowledgement letter.
`],
	["claims-handbook-v2.md", `---
id: claims-handbook-v2
title: Claims Handbook
docKey: claims-handbook
version: 2
updated: 2026-09-01
groups: [staff]
---
# Claims Handbook

## Refund window
Customers who cancel a policy get a full premium refund within 14 days of purchase. From day 15 the refund is pro rata, minus a SGD 25 admin fee. This replaces the 30 day window from version 1.

## Acknowledging claims
Acknowledge every new claim within 2 working days. The claims portal sends the acknowledgement automatically once the claim is logged.

## Storm surge claims
Escalate any storm surge claim above SGD 20,000 to the senior claims analyst on duty. Photograph the water line before any clean up.
`],
	["remote-work-2024.md", `---
id: remote-work-2024
title: Remote Work Policy (2024)
version: 1
updated: 2024-02-01
status: superseded
groups: [staff]
---
# Remote Work Policy (2024)

## Who can work remotely
Staff may work remotely two days per week with their manager's approval. This policy was withdrawn pending a new version.
`],
	["travel-expenses.md", `---
id: travel-expenses
title: Travel and Expenses
version: 3
updated: 2026-04-18
groups: [staff]
---
# Travel and Expenses

## Daily allowance
The daily meal allowance on business travel is SGD 80. Keep receipts for anything above SGD 20.

## Late taxis
Taxis home after 10pm are claimable when you worked late on site.
`],
	["onboarding.md", `---
id: onboarding
title: Welcome to Hollowmere
version: 5
updated: 2026-08-12
groups: [everyone]
---
# Welcome to Hollowmere

## Building access
Badges open the main door from 7am to 9pm. Contractors collect a day badge from reception.

## Lantern room
The lantern room on level 3 is the quiet room. Facilities requests for it go through the FAC ticket queue.
`],
	["incident-runbook.md", `---
id: incident-runbook
title: Incident Response Runbook
version: 4
updated: 2026-06-30
groups: [staff]
---
# Incident Response Runbook

## Severity levels
Severity 1 means customers cannot file claims. Page the on-call engineer and open an OPS ticket within 15 minutes.

## After the incident
Write a short investigation note within 3 working days covering cause, impact and the fix.
`],
	["pricing-guidelines.md", `---
id: pricing-guidelines
title: Pricing Guidelines
version: 2
updated: 2026-07-20
groups: [sales, compliance]
---
# Pricing Guidelines

## Discount authority
An account manager may approve a discount of up to 10 percent on a renewal. Anything above 10 percent needs the Head of Sales.

## Multi policy bundles
Bundles of home and contents cover get a fixed 5 percent bundle discount on top.
`],
	["fincrime-case-handling.md", `---
id: fincrime-case-handling
title: Financial Crime Case Handling
version: 1
updated: 2026-05-02
groups: [fincrime]
---
# Financial Crime Case Handling

## Tipping off
Never tell a customer, or colleagues outside the financial crime team, that an investigation exists. Account teams are not informed while a case is open.

## Holding refunds
Refunds to a customer under investigation are held until the case lead releases them.
`],
	["salary-bands.md", `---
id: salary-bands
title: Salary Bands 2026
version: 1
updated: 2026-03-01
groups: [hr]
---
# Salary Bands 2026

## Claims
Claims analysts sit in band C, from SGD 4,800 to SGD 6,400 a month.
`],
	["lantern-night.md", `---
id: lantern-night
title: Lantern Night 2026
version: 1
updated: 2026-10-20
groups: [everyone]
---
# Lantern Night 2026

## The evening
Lantern Night is on Friday 30 October in the atrium. Costumes are welcome; the best costume wins a day of leave.
`]
];
// src/data/index.ts
/** Parse the bundled synthetic dataset through the same adapters an upload uses. */
function loadDataset() {
	const results = [
		...WIKI_PAGES.map(([name, md]) => parseWiki(md, name)),
		...TICKET_EXPORTS.map((t) => parseTickets(t)),
		...CHAT_EXPORTS.map((c) => parseChat(c)),
		...SHEETS.map(([meta, csv]) => parseSheet(csv, meta))
	];
	return {
		documents: results.flatMap((r) => r.documents),
		warnings: results.flatMap((r) => r.warnings)
	};
}
// src/data/personas.ts
var PERSONAS = [
	{
		userId: "mara",
		name: "Mara Quill",
		role: "Claims Analyst",
		groups: [
			"everyone",
			"staff",
			"claims"
		]
	},
	{
		userId: "theo",
		name: "Theo Marsh",
		role: "Account Manager",
		groups: [
			"everyone",
			"staff",
			"sales"
		]
	},
	{
		userId: "iris",
		name: "Iris Vane",
		role: "Compliance Officer and Data Steward",
		groups: [
			"everyone",
			"staff",
			"compliance",
			"fincrime",
			"steward"
		]
	},
	{
		userId: "nova",
		name: "Nova Reyes",
		role: "People Partner",
		groups: [
			"everyone",
			"staff",
			"hr"
		]
	},
	{
		userId: "sam",
		name: "Sam Pike",
		role: "Facilities Contractor",
		groups: ["everyone", "contractors"]
	}
];
function personaById(id) {
	return PERSONAS.find((p) => p.userId === id);
}
function heads(passages) {
	const seen = /* @__PURE__ */ new Map();
	for (const p of passages) if (!seen.has(p.docId)) seen.set(p.docId, {
		docId: p.docId,
		title: p.title,
		docKey: p.docKey,
		version: p.version,
		updatedAt: p.updatedAt,
		status: p.status
	});
	return [...seen.values()];
}
/** Living wins on: higher version, then later updatedAt, then lexically smaller id. */
function livingFirst(a, b) {
	if (a.version !== b.version) return b.version - a.version;
	if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? 1 : -1;
	return a.docId < b.docId ? -1 : 1;
}
/**
* Find ghosts among `visible` passages only (passages that passed both gates for this asker).
* Never looks outside that set, so a newer version the asker cannot open is never revealed.
*/
function findGhosts(visible) {
	const ghosts = /* @__PURE__ */ new Map();
	const byKey = /* @__PURE__ */ new Map();
	for (const h of heads(visible)) {
		const list = byKey.get(h.docKey) ?? [];
		list.push(h);
		byKey.set(h.docKey, list);
	}
	for (const list of byKey.values()) {
		const sorted = [...list].sort(livingFirst);
		const living = sorted.find((h) => h.status !== "superseded");
		for (const h of sorted) {
			if (living && h.docId === living.docId) continue;
			const note = {
				docId: h.docId,
				title: h.title,
				version: h.version,
				reason: h.status === "superseded" ? "marked-superseded" : "newer-version"
			};
			if (living) {
				note.livingDocId = living.docId;
				note.livingTitle = living.title;
				note.livingVersion = living.version;
			}
			ghosts.set(h.docId, note);
		}
	}
	return ghosts;
}
function isDusty(updatedAt, now) {
	const t = Date.parse(updatedAt);
	if (Number.isNaN(t)) return false;
	return now.getTime() - t > 46656e6;
}
// src/engine/tokenize.ts
var STOP = new Set("a an and are as at be been but by can could did do does for from had has have how i if in into is it its me my of on or our should so that the their them then there these they this to was we were what when where which who whom why will with would you your about any all also am under over yet not no just than too very tell show please much many does did know must need needs fast quickly soon long get got go".split(" "));
/** Light suffix stemming, applied identically to queries and passages. */
function stem(word) {
	let w = word;
	if (w.length > 5 && w.endsWith("ing")) w = w.slice(0, -3);
	else if (w.length > 4 && w.endsWith("ies")) w = w.slice(0, -3) + "y";
	else if (w.length > 4 && w.endsWith("ed")) w = w.slice(0, -2);
	else if (w.length > 4 && /(ss|x|ch|sh)es$/.test(w)) w = w.slice(0, -2);
	else if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) w = w.slice(0, -1);
	if (w.length >= 6 && /([bdglmnprst])\1$/.test(w)) w = w.slice(0, -1);
	return w;
}
function tokenize(text) {
	const out = [];
	for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
		if (!raw || STOP.has(raw)) continue;
		out.push(stem(raw));
	}
	return out;
}
function splitSentences(text) {
	return text.replace(/\s+/g, " ").split(/(?<=[.!?])\s+(?=[A-Z0-9"'(\[])/).map((s) => s.trim()).filter((s) => s.length > 0);
}
// src/engine/retrieve.ts
var BM25_K1 = 1.2;
var BM25_B = .75;
function buildStats(docs) {
	const df = /* @__PURE__ */ new Map();
	let total = 0;
	for (const toks of docs) {
		total += toks.length;
		for (const t of new Set(toks)) df.set(t, (df.get(t) ?? 0) + 1);
	}
	return {
		df,
		avgLen: docs.length ? total / docs.length : 0,
		n: docs.length
	};
}
function idf(term, stats) {
	const df = stats.df.get(term) ?? 0;
	return Math.log(1 + (stats.n - df + .5) / (df + .5));
}
function relevant(m) {
	return m.score > 0 && m.termShare >= .5 && m.coverage >= .4;
}
/**
* BM25 score plus IDF-weighted coverage: the share of the query's total IDF that the passage
* contains. A passage that only matches common words ("work") cannot pass the coverage rule
* when the rare word ("remotely") is missing.
*/
function bm25(queryTerms, toks, stats) {
	if (!queryTerms.length || !toks.length) return {
		score: 0,
		coverage: 0,
		termShare: 0
	};
	const tf = /* @__PURE__ */ new Map();
	for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
	let score = 0;
	let matched = 0;
	let matchedIdf = 0;
	let totalIdf = 0;
	for (const q of queryTerms) {
		const w = idf(q, stats);
		totalIdf += w;
		const f = tf.get(q) ?? 0;
		if (!f) continue;
		matched++;
		matchedIdf += w;
		score += w * (f * 2.2) / (f + BM25_K1 * (.25 + BM25_B * toks.length / (stats.avgLen || 1)));
	}
	return {
		score,
		coverage: totalIdf > 0 ? matchedIdf / totalIdf : 0,
		termShare: matched / queryTerms.length
	};
}
/** Distinct query terms in first-seen order. */
function queryTerms(question) {
	return [...new Set(tokenize(question))];
}
function passageTokens(p) {
	return tokenize(`${p.title} ${p.location} ${p.text}`);
}
/**
* Rank `living` passages. Statistics come only from `living` (which the caller has already
* passed through both gates and the ghost check). Returns relevant passages only, sorted by
* score descending then passage id ascending, so ordering is deterministic.
*/
function rank(question, living) {
	const terms = queryTerms(question);
	const toks = living.map(passageTokens);
	const stats = buildStats(toks);
	const scored = [];
	living.forEach((p, i) => {
		const m = bm25(terms, toks[i], stats);
		if (relevant(m)) scored.push({
			passage: p,
			...m
		});
	});
	scored.sort((a, b) => b.score - a.score || (a.passage.id < b.passage.id ? -1 : 1));
	return scored;
}
/** Score extra passages (ghosts) against the statistics of `living` plus each extra passage alone. */
function relevantExtras(question, living, extras) {
	const terms = queryTerms(question);
	const livingToks = living.map(passageTokens);
	return extras.filter((p) => {
		const toks = passageTokens(p);
		const stats = buildStats([...livingToks, toks]);
		return relevant(bm25(terms, toks, stats));
	});
}
var RELATIVE_FLOOR = .35;
function clip(s) {
	return s.length > 400 ? `${s.slice(0, 397)}...` : s;
}
/**
* The sentence with the most query terms. If that sentence is only a headline (every word is in
* the passage title, as with a ticket summary), the best non-headline sentence with at least one
* query term is appended, so the answer says something the title does not.
*/
function bestSentence(text, terms, title) {
	const sentences = splitSentences(text);
	const titleToks = new Set(tokenize(title));
	const scoredSentences = sentences.map((s, i) => {
		const toks = tokenize(s);
		const set = new Set(toks);
		return {
			s,
			i,
			hits: terms.filter((t) => set.has(t)).length,
			headline: toks.length > 0 && toks.every((t) => titleToks.has(t))
		};
	});
	if (!scoredSentences.length) return clip(text);
	const best = [...scoredSentences].sort((a, b) => b.hits - a.hits || a.i - b.i)[0];
	if (!best.headline) return clip(best.s);
	const follow = scoredSentences.filter((x) => !x.headline && x.hits > 0).sort((a, b) => b.hits - a.hits || a.i - b.i)[0];
	return clip(follow ? `${best.s} ${follow.s}` : best.s);
}
/** Pick up to 3 passages from distinct documents, each at least 35 percent of the top score. */
function compose(question, ranked, checkedAt) {
	if (!ranked.length) return {
		sentences: [],
		citations: []
	};
	const terms = queryTerms(question);
	const floor = ranked[0].score * RELATIVE_FLOOR;
	const chosen = [];
	const docs = /* @__PURE__ */ new Set();
	for (const s of ranked) {
		if (chosen.length >= 3 || s.score < floor) break;
		if (docs.has(s.passage.docId)) continue;
		docs.add(s.passage.docId);
		chosen.push(s);
	}
	const citations = chosen.map((s, i) => ({
		n: i + 1,
		passageId: s.passage.id,
		docId: s.passage.docId,
		kind: s.passage.kind,
		title: s.passage.title,
		sourceName: s.passage.sourceName,
		location: s.passage.location,
		version: s.passage.version,
		updatedAt: s.passage.updatedAt,
		checkedAt: checkedAt.toISOString(),
		dusty: isDusty(s.passage.updatedAt, checkedAt),
		text: s.passage.text
	}));
	const sentences = [];
	chosen.forEach((s, i) => {
		const text = bestSentence(s.passage.text, terms, `${s.passage.docId} ${s.passage.title}`);
		const same = sentences.find((x) => x.text === text);
		if (same) same.citations.push(i + 1);
		else sentences.push({
			text,
			citations: [i + 1]
		});
	});
	return {
		sentences,
		citations
	};
}
// src/engine/corpus.ts
function aclAllows(acl, who) {
	return acl.users.includes(who.userId) || acl.groups.some((g) => who.groups.includes(g));
}
function toPassages(doc) {
	return doc.passages.map((p, i) => ({
		id: `${doc.id}#${i}`,
		docId: doc.id,
		kind: doc.kind,
		title: doc.title,
		sourceName: doc.sourceName,
		location: p.location,
		text: p.text,
		docKey: doc.docKey,
		version: doc.version,
		updatedAt: doc.updatedAt,
		status: doc.status,
		acl: {
			groups: [...doc.acl.groups],
			users: [...doc.acl.users]
		}
	}));
}
/**
* In-memory stand-in for each source system's live permission API. Changes here are NOT
* re-indexed, which is exactly what Gate 2 exists to catch.
*/
var LiveAclRegistry = class {
	entries = /* @__PURE__ */ new Map();
	constructor(docs = []) {
		docs.forEach((d) => this.register(d));
	}
	register(doc) {
		this.entries.set(doc.id, {
			acl: {
				groups: [...doc.acl.groups],
				users: [...doc.acl.users]
			},
			status: doc.status
		});
	}
	check(docId, who) {
		const e = this.entries.get(docId);
		if (!e || e.status === "archived") return false;
		return aclAllows(e.acl, who);
	}
	get(docId) {
		const e = this.entries.get(docId);
		return e ? {
			acl: {
				groups: [...e.acl.groups],
				users: [...e.acl.users]
			},
			status: e.status
		} : void 0;
	}
	revokeGroup(docId, group) {
		const e = this.entries.get(docId);
		if (!e || !e.acl.groups.includes(group)) return false;
		e.acl.groups = e.acl.groups.filter((g) => g !== group);
		return true;
	}
	restoreGroup(docId, group) {
		const e = this.entries.get(docId);
		if (!e || e.acl.groups.includes(group)) return false;
		e.acl.groups = [...e.acl.groups, group];
		return true;
	}
	setStatus(docId, status) {
		const e = this.entries.get(docId);
		if (e) e.status = status;
	}
};
// src/engine/gates.ts
/** Gate 1: index-time ACL. Archived documents never pass. */
function gate1(passages, who) {
	const allowed = passages.filter((p) => p.status !== "archived" && aclAllows(p.acl, who));
	return {
		allowed,
		denied: passages.length - allowed.length
	};
}
/**
* Gate 2: ask the live registry again for each surviving document. A throw, a missing entry or a
* "no" all mean deny (fail closed). One check per document, applied to all of its passages.
*/
function gate2(passages, who, live) {
	const verdicts = /* @__PURE__ */ new Map();
	for (const p of passages) {
		if (verdicts.has(p.docId)) continue;
		let ok = false;
		try {
			ok = live.check(p.docId, who) === true;
		} catch {
			ok = false;
		}
		verdicts.set(p.docId, ok);
	}
	const deniedDocIds = [...verdicts.entries()].filter(([, ok]) => !ok).map(([id]) => id).sort();
	return {
		allowed: passages.filter((p) => verdicts.get(p.docId)),
		deniedDocIds
	};
}
// src/engine/hash.ts
var enc$1 = new TextEncoder();
function toHex(buf) {
	return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function sha256Hex(text) {
	return toHex(await crypto.subtle.digest("SHA-256", enc$1.encode(text)));
}
async function importHmacKey(key) {
	const raw = typeof key === "string" ? enc$1.encode(key) : key;
	return crypto.subtle.importKey("raw", raw, {
		name: "HMAC",
		hash: "SHA-256"
	}, false, ["sign"]);
}
async function hmacHex(key, text) {
	return toHex(await crypto.subtle.sign("HMAC", key, enc$1.encode(text)));
}
async function hmacBytes(key, text) {
	return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc$1.encode(text)));
}
/** JSON with object keys sorted at every depth. Arrays keep their order. */
function canonical(value) {
	if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
	if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
	const obj = value;
	return `{${Object.keys(obj).filter((k) => obj[k] !== void 0).sort().map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(",")}}`;
}
/** Constant-time comparison for equal-length strings. */
function safeEqual(a, b) {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}
// src/engine/types.ts
var NO_ANSWER_MESSAGE = "No source you can open answers this yet.";
var INVALID_QUERY_MESSAGE = "Ask a question between 1 and 300 characters.";
var LEDGER_UNAVAILABLE_MESSAGE = "The Crypt could not be written, so no answer was released.";
var STITCHES_UNAVAILABLE_MESSAGE = "The Walnut stitches could not check or seal this answer, so nothing was released.";
// src/walnut/stitches.ts
var WalnutUnavailableError = class extends Error {
	constructor(detail) {
		super(`walnut stitches unavailable: ${detail}`);
	}
};
/** HTTP client for `python -m stitch_walnut`. `base` is "" in the browser (same-origin proxy). */
var HttpWalnut = class {
	base;
	fetchImpl;
	timeoutMs;
	callerKey;
	constructor(base, opts = {}) {
		this.base = base;
		this.fetchImpl = opts.fetch ?? ((i, init) => fetch(i, init));
		this.timeoutMs = opts.timeoutMs ?? 5e3;
		this.callerKey = opts.callerKey;
	}
	async call(path, body) {
		const ctrl = new AbortController();
		const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
		let res;
		try {
			res = await this.fetchImpl(`${this.base}/walnut/${path}`, {
				method: body === void 0 ? "GET" : "POST",
				headers: {
					"content-type": "application/json",
					...this.callerKey ? { "x-stitch-caller-key": this.callerKey } : {}
				},
				body: body === void 0 ? void 0 : JSON.stringify(body),
				signal: ctrl.signal
			});
		} catch (e) {
			throw new WalnutUnavailableError(e instanceof Error ? e.message : "network error");
		} finally {
			clearTimeout(timer);
		}
		if (res.status !== 200) throw new WalnutUnavailableError(`HTTP ${res.status}`);
		try {
			return await res.json();
		} catch {
			throw new WalnutUnavailableError("not JSON");
		}
	}
	ground(sentences, citations) {
		return this.call("ground", {
			sentences: sentences.map((s) => ({
				text: s.text,
				citations: s.citations
			})),
			citations: citations.map((c) => ({
				n: c.n,
				passageId: c.passageId,
				docId: c.docId,
				kind: c.kind,
				sourceName: c.sourceName,
				text: c.text
			}))
		});
	}
	seal(type, data) {
		return this.call("seal", {
			type,
			data
		});
	}
	verify() {
		return this.call("verify");
	}
	tamperDemo() {
		return this.call("tamper-demo", {});
	}
	health() {
		return this.call("health");
	}
};
/** A deliberately forged sentence, for the "forge a stitch" demo control. It cites passage 1 but
*  states a value and a name that no source holds, so the Walnut grounding wall must drop it. */
var FORGED_SENTENCE = "Forged stitch: the limit was raised to 99 days, approved by Ozymandias Crane.";
// src/engine/engine.ts
/**
* Apply the Walnut grounding wall's verdicts: keep only the sentences it kept, keep only the
* citations a kept sentence still uses, renumber them 1..n in their original order, and attach
* Walnut's pointers under the new numbers.
*/
function applyWall(sentences, citations, verdicts) {
	const byIndex = new Map(verdicts.map((v) => [v.index, v]));
	const keptIdx = sentences.map((_, i) => i).filter((i) => byIndex.get(i)?.kept === true);
	const dropped = sentences.map((s, i) => ({
		s,
		v: byIndex.get(i)
	})).filter(({ v }) => v?.kept !== true).map(({ s, v }) => ({
		text: s.text,
		reasons: v?.reasons.length ? v.reasons : ["no verdict from the wall"]
	}));
	const used = [...new Set(keptIdx.flatMap((i) => sentences[i].citations))].sort((a, b) => a - b);
	const renumber = new Map(used.map((old, i) => [old, i + 1]));
	const outCitations = citations.filter((c) => renumber.has(c.n)).map((c) => ({
		...c,
		n: renumber.get(c.n)
	}));
	return {
		sentences: keptIdx.map((i) => ({
			text: sentences[i].text,
			citations: sentences[i].citations.filter((n) => renumber.has(n)).map((n) => renumber.get(n))
		})),
		citations: outCitations,
		dropped,
		pointers: keptIdx.flatMap((i, k) => (byIndex.get(i)?.pointers ?? []).filter((p) => renumber.has(p.n)).map((p) => ({
			sentence: k,
			n: renumber.get(p.n),
			pointer: p.pointer
		})))
	};
}
var FULL_TRAIL = [
	{
		step: "identity",
		ok: true
	},
	{
		step: "crypt-accept",
		ok: true
	},
	{
		step: "gate-1",
		ok: true
	},
	{
		step: "gate-2",
		ok: true
	},
	{
		step: "ghost-check",
		ok: true
	},
	{
		step: "stitch",
		ok: true
	},
	{
		step: "crypt-seal",
		ok: true
	}
];
var WALNUT_TRAIL = [
	...FULL_TRAIL.slice(0, 6),
	{
		step: "walnut-wall",
		ok: true
	},
	FULL_TRAIL[6]
];
var counter = 0;
function defaultId() {
	counter += 1;
	return `req-${Date.now().toString(36)}-${counter.toString(36)}`;
}
/**
* The answer layer. The pipeline order in `ask` is the single source of truth
* (see .kiro/specs/permission-gates/design.md).
*/
var Engine = class {
	ledger;
	registry;
	/** Demo fault injection: the next answer gets a forged sentence, which the Walnut wall must drop. */
	forgeNext = false;
	walnut;
	live;
	docs = /* @__PURE__ */ new Map();
	passages = [];
	clock;
	newId;
	constructor(opts) {
		this.ledger = opts.ledger;
		this.clock = opts.clock ?? (() => /* @__PURE__ */ new Date());
		this.newId = opts.newId ?? defaultId;
		this.registry = new LiveAclRegistry();
		this.live = opts.live ?? this.registry;
		this.walnut = opts.walnut;
		this.addDocuments(opts.documents);
	}
	/** Attach (or detach) the Walnut stitches, for example once the browser finds the service. */
	attachWalnut(walnut) {
		this.walnut = walnut;
	}
	get walnutAttached() {
		return this.walnut !== void 0;
	}
	/**
	* Write one Crypt event. With Walnut attached it is sealed into Walnut's durable ledger first,
	* then appended to the in-memory Crypt. Either failing throws, so nothing after it runs.
	*/
	async record(type, data, seals) {
		if (this.walnut) {
			let sealed;
			try {
				sealed = await this.walnut.seal(type, data);
			} catch (e) {
				throw e instanceof WalnutUnavailableError ? e : new WalnutUnavailableError("seal failed");
			}
			seals?.push({
				type,
				seq: sealed.seq
			});
		}
		await this.ledger.append(type, data);
	}
	/** Index documents: snapshot their ACL into passages (Gate 1) and register them live (Gate 2). */
	addDocuments(documents) {
		for (const d of documents) {
			if (this.docs.has(d.id)) this.passages = this.passages.filter((p) => p.docId !== d.id);
			this.docs.set(d.id, structuredClone(d));
			this.registry.register(d);
			this.passages.push(...toPassages(d));
		}
	}
	/** Passages that pass both gates for this person. */
	visiblePassages(who) {
		return gate2(gate1(this.passages, who).allowed, who, this.live).allowed;
	}
	/** Documents this person can open (both gates), for the Body Parts view. */
	visibleDocuments(who) {
		const ids = new Set(this.visiblePassages(who).map((p) => p.docId));
		return [...this.docs.values()].filter((d) => ids.has(d.id)).map((d) => structuredClone(d));
	}
	/** Every ghost this person can see, for the Ghosts view. */
	ghostsFor(who) {
		return [...findGhosts(this.visiblePassages(who)).values()].sort((a, b) => a.docId < b.docId ? -1 : 1);
	}
	/** Operator view only (demo controls). Not filtered by identity. */
	allDocuments() {
		return [...this.docs.values()].map((d) => structuredClone(d));
	}
	async ask(who, question) {
		const q = question.trim();
		if (!q || q.length > 300) return {
			status: "invalid_query",
			message: INVALID_QUERY_MESSAGE
		};
		const requestId = this.newId();
		const seals = [];
		try {
			await this.record("request.accepted", {
				requestId,
				userId: who.userId,
				question: maskSensitive(q)
			}, seals);
			const g1 = gate1(this.passages, who);
			const g2 = gate2(g1.allowed, who, this.live);
			const ghostMap = findGhosts(g2.allowed);
			const living = g2.allowed.filter((p) => !ghostMap.has(p.docId));
			const ghostPassages = g2.allowed.filter((p) => ghostMap.has(p.docId));
			let { sentences, citations } = compose(q, rank(q, living), this.clock());
			const ghostIds = [...new Set(relevantExtras(q, living, ghostPassages).map((p) => p.docId))].sort();
			const ghosts = ghostIds.map((id) => ghostMap.get(id));
			let walnut;
			if (this.walnut) {
				if (this.forgeNext && sentences.length) sentences = [...sentences, {
					text: FORGED_SENTENCE,
					citations: [1]
				}];
				this.forgeNext = false;
				let wall;
				try {
					wall = sentences.length ? await this.walnut.ground(sentences, citations) : { sentences: [] };
				} catch (e) {
					throw e instanceof WalnutUnavailableError ? e : new WalnutUnavailableError("grounding failed");
				}
				const applied = applyWall(sentences, citations, wall.sentences);
				sentences = applied.sentences;
				citations = applied.citations;
				walnut = {
					kept: applied.sentences.length,
					dropped: applied.dropped,
					pointers: applied.pointers,
					seals
				};
			}
			await this.record("retrieval.decided", {
				requestId,
				gate1Allowed: g1.allowed.length,
				gate1Denied: g1.denied,
				gate2DeniedDocIds: g2.deniedDocIds,
				ghostDocIds: ghostIds,
				citedPassageIds: citations.map((c) => c.passageId),
				...walnut ? { walnutDropped: walnut.dropped.length } : {}
			}, seals);
			const trail = walnut ? WALNUT_TRAIL : FULL_TRAIL;
			const extra = walnut ? { walnut } : {};
			const response = sentences.length ? {
				status: "answered",
				requestId,
				sentences,
				citations,
				ghosts,
				trail: trail.map((s) => ({ ...s })),
				...extra
			} : {
				status: "no_answer",
				requestId,
				message: NO_ANSWER_MESSAGE,
				sentences: [],
				citations: [],
				ghosts,
				trail: trail.map((s) => ({ ...s })),
				...extra
			};
			await this.record("answer.released", {
				requestId,
				status: response.status,
				answerHash: await sha256Hex(canonical({
					sentences: response.sentences,
					citations: response.citations.map((c) => c.passageId)
				}))
			}, seals);
			return response;
		} catch (e) {
			this.forgeNext = false;
			return {
				status: "ledger_unavailable",
				message: e instanceof WalnutUnavailableError ? STITCHES_UNAVAILABLE_MESSAGE : LEDGER_UNAVAILABLE_MESSAGE
			};
		}
	}
	async exorcise(who, docId) {
		if (!who.groups.includes("steward")) return {
			ok: false,
			message: "Only a data steward can exorcise a ghost."
		};
		const ghost = findGhosts(this.visiblePassages(who)).get(docId);
		if (!ghost) return {
			ok: false,
			message: "That document is not a ghost you can see."
		};
		try {
			await this.record("ghost.exorcised", {
				docId,
				title: ghost.title,
				version: ghost.version,
				by: who.userId
			});
		} catch (e) {
			return {
				ok: false,
				message: e instanceof WalnutUnavailableError ? STITCHES_UNAVAILABLE_MESSAGE : LEDGER_UNAVAILABLE_MESSAGE
			};
		}
		this.registry.setStatus(docId, "archived");
		const doc = this.docs.get(docId);
		if (doc) doc.status = "archived";
		this.passages = this.passages.map((p) => p.docId === docId ? {
			...p,
			status: "archived"
		} : p);
		return {
			ok: true,
			message: `Exorcised ${ghost.title} (v${ghost.version}). It will not haunt answers again.`
		};
	}
	/** Demo operator: change a permission at the source without re-indexing. Gate 2 must catch it. */
	async changeAtSource(docId, group, action, by) {
		const changed = action === "revoke" ? this.registry.revokeGroup(docId, group) : this.registry.restoreGroup(docId, group);
		if (changed) await this.record("acl.changed", {
			docId,
			group,
			action,
			by,
			reindexed: false
		});
		return changed;
	}
	liveAcl(docId) {
		return this.registry.get(docId);
	}
	async recordStitch(fileName, kind, passageCount, by) {
		await this.record("source.stitched", {
			fileName,
			kind,
			passageCount,
			by
		});
	}
};
// src/engine/ledger.ts
var GENESIS = "0".repeat(64);
var LedgerUnavailableError = class extends Error {
	constructor() {
		super("ledger unavailable");
	}
};
function entryHashInput(prevHash, e) {
	return prevHash + canonical({
		seq: e.seq,
		at: e.at,
		type: e.type,
		data: e.data
	});
}
var Ledger = class {
	clock;
	/** When true, the next append throws. Used by the "seal the Crypt shut" demo control and tests. */
	failNext = false;
	log = [];
	tail = Promise.resolve();
	keyPromise;
	constructor(key, clock = () => /* @__PURE__ */ new Date()) {
		this.clock = clock;
		this.keyPromise = importHmacKey(key);
	}
	append(type, data) {
		const run = async () => {
			if (this.failNext) {
				this.failNext = false;
				throw new LedgerUnavailableError();
			}
			const key = await this.keyPromise;
			const prevHash = this.log.length ? this.log[this.log.length - 1].hash : GENESIS;
			const base = {
				seq: this.log.length,
				at: this.clock().toISOString(),
				type,
				data: JSON.parse(JSON.stringify(data))
			};
			const hash = await sha256Hex(entryHashInput(prevHash, base));
			const entry = {
				...base,
				prevHash,
				hash,
				seal: await hmacHex(key, hash)
			};
			this.log.push(entry);
			return structuredClone(entry);
		};
		const p = this.tail.then(run, run);
		this.tail = p.catch(() => void 0);
		return p;
	}
	entries() {
		return structuredClone(this.log);
	}
	get size() {
		return this.log.length;
	}
	async verify() {
		return verifyChain(this.log, await this.keyPromise);
	}
	async tamperDemo(index) {
		return tamperDemo(this.log, await this.keyPromise, index);
	}
};
async function verifyChain(entries, key) {
	let prev = GENESIS;
	for (let i = 0; i < entries.length; i++) {
		const e = entries[i];
		if (e.seq !== i || e.prevHash !== prev) return {
			ok: false,
			count: entries.length,
			brokenAt: i,
			reason: "chain-break"
		};
		if (await sha256Hex(entryHashInput(prev, e)) !== e.hash) return {
			ok: false,
			count: entries.length,
			brokenAt: i,
			reason: "hash-mismatch"
		};
		if (await hmacHex(key, e.hash) !== e.seal) return {
			ok: false,
			count: entries.length,
			brokenAt: i,
			reason: "seal-mismatch"
		};
		prev = e.hash;
	}
	return {
		ok: true,
		count: entries.length
	};
}
/** Copies the log, edits one entry's data in the copy, and verifies the copy. The real log is untouched. */
async function tamperDemo(entries, key, index) {
	if (!entries.length) return null;
	const copy = structuredClone(entries);
	const i = index ?? Math.floor(copy.length / 2);
	copy[i].data = {
		...copy[i].data,
		tampered: "a quiet edit by someone who should not have"
	};
	return {
		index: i,
		result: await verifyChain(copy, key)
	};
}
function b64url(bytes) {
	let bin = "";
	bytes.forEach((b) => bin += String.fromCharCode(b));
	return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(s) {
	try {
		const pad = s.length % 4 ? "=".repeat(4 - s.length % 4) : "";
		return atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
	} catch {
		return null;
	}
}
var enc = new TextEncoder();
async function signToken(secret, sub, nowSeconds) {
	const payload = b64url(enc.encode(JSON.stringify({
		sub,
		iat: nowSeconds
	})));
	return `${payload}.${b64url(await hmacBytes(await importHmacKey(secret), payload))}`;
}
/** Returns the subject, or null for anything malformed, forged or older than the TTL. */
async function verifyToken(secret, token, nowSeconds) {
	const parts = token.split(".");
	if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
	const [payload, sig] = parts;
	if (!safeEqual(b64url(await hmacBytes(await importHmacKey(secret), payload)), sig)) return null;
	const json = fromB64url(payload);
	if (json === null) return null;
	let claims;
	try {
		claims = JSON.parse(json);
	} catch {
		return null;
	}
	if (typeof claims !== "object" || claims === null) return null;
	const { sub, iat } = claims;
	if (typeof sub !== "string" || typeof iat !== "number") return null;
	if (iat > nowSeconds + 30 || nowSeconds - iat > 900) return null;
	return sub;
}
// server/handler.ts
var MAX_BODY_BYTES = 4096;
var MIN_SECRET_CHARS = 32;
function walnutFor(env) {
	if (env.walnut) return env.walnut;
	return env.walnutUrl ? new HttpWalnut(env.walnutUrl.replace(/\/+$/, ""), { callerKey: env.walnutCallerKey }) : void 0;
}
function json(status, body) {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			"content-type": "application/json; charset=utf-8",
			"cache-control": "no-store"
		}
	});
}
function configured(env) {
	return typeof env.secret === "string" && env.secret.length >= 32;
}
async function readBody(req) {
	const text = await req.text();
	if (new TextEncoder().encode(text).length > 4096) return null;
	try {
		const v = JSON.parse(text);
		return typeof v === "object" && v !== null && !Array.isArray(v) ? v : null;
	} catch {
		return null;
	}
}
async function handleHealth(env) {
	return json(200, {
		ok: true,
		configured: configured(env),
		walnut: walnutFor(env) !== void 0,
		openSessions: !env.sessionKey,
		personas: PERSONAS.map((p) => p.userId)
	});
}
async function handleSession(req, env) {
	if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
	if (!configured(env)) return json(503, { error: "not_configured" });
	if (env.sessionKey && !safeEqual(req.headers.get("x-stitch-session-key") ?? "", env.sessionKey)) return json(401, { error: "unauthenticated" });
	const body = await readBody(req);
	if (!body) return json(400, { error: "bad_request" });
	const persona = typeof body.persona === "string" ? personaById(body.persona) : void 0;
	if (!persona) return json(400, {
		error: "unknown_persona",
		personas: PERSONAS.map((p) => p.userId)
	});
	const now = Math.floor((env.now?.() ?? /* @__PURE__ */ new Date()).getTime() / 1e3);
	return json(200, {
		token: await signToken(env.secret, persona.userId, now),
		expiresIn: 900,
		persona: persona.userId,
		demoIdentity: !env.sessionKey
	});
}
async function handleAsk(req, env) {
	if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
	if (!configured(env)) return json(503, { error: "not_configured" });
	const auth = req.headers.get("authorization") ?? "";
	const m = /^Bearer\s+(\S+)$/i.exec(auth);
	const nowDate = env.now?.() ?? /* @__PURE__ */ new Date();
	const sub = m ? await verifyToken(env.secret, m[1], Math.floor(nowDate.getTime() / 1e3)) : null;
	const who = sub ? personaById(sub) : void 0;
	if (!who) return json(401, { error: "unauthenticated" });
	const body = await readBody(req);
	if (!body) return json(400, { error: "bad_request" });
	const question = typeof body.question === "string" ? body.question : "";
	const ledger = new Ledger(await hmacBytes(await importHmacKey(env.secret), "crypt-key"), () => env.now?.() ?? /* @__PURE__ */ new Date());
	const result = await new Engine({
		documents: env.documents ?? loadDataset().documents,
		ledger,
		clock: () => env.now?.() ?? /* @__PURE__ */ new Date(),
		walnut: walnutFor(env)
	}).ask(who, question);
	if (result.status === "invalid_query") return json(400, {
		error: "invalid_query",
		message: result.message
	});
	if (result.status === "ledger_unavailable") return json(503, {
		error: "ledger_unavailable",
		message: result.message
	});
	const entries = ledger.entries();
	const receipt = who.groups.includes("steward") ? { crypt: entries } : {};
	return json(200, {
		...result,
		asker: who.userId,
		cryptSealed: entries.length,
		...receipt
	});
}
/** Route by path, for local testing and for hosts that use a single function. */
async function route(req, env) {
	const path = new URL(req.url).pathname.replace(/\/+$/, "");
	if (path.endsWith("/api/health")) return handleHealth(env);
	if (path.endsWith("/api/session")) return handleSession(req, env);
	if (path.endsWith("/api/ask")) return handleAsk(req, env);
	return json(404, { error: "not_found" });
}
export { MAX_BODY_BYTES, MIN_SECRET_CHARS, handleAsk, handleHealth, handleSession, route };
