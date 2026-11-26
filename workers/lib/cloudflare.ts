// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/**
 * Cloudflare API access for setting up a domain's Email Routing and Email
 * Sending from the app. Needs the CF_API_TOKEN secret, with these permissions:
 *
 *   Zone      Zone: Read, Zone Settings: Edit, Email Routing Rules: Edit
 *   Account   Email Sending: Edit, Queues: Edit (Queues only for delivery tracking)
 *
 * Without the token the app still works; setup is then done in the dashboard.
 */
import {
	type AddressRule,
	DEFAULT_WORKER_NAME,
	type DomainSetup,
	planSetup,
	type PlanOptions,
	type RouteAction,
	RULE_NAME_PREFIX,
	type StepResult,
} from "../../shared/provisioning";

export interface CloudflareEnv {
	CF_API_TOKEN?: string;
	/** The name of this Worker, if it is not "agentic-inbox". */
	WORKER_NAME?: string;
}

const API = "https://api.cloudflare.com/client/v4";
/** Must match "queues" in wrangler.jsonc and scripts/setup-delivery-events.sh. */
const EVENTS_QUEUE = "agentic-inbox-email-events";
const SENDING_EVENTS = [
	"message.delivered",
	"message.deferred",
	"message.bounced",
	"message.failed",
	"message.rejected",
	"message.complained",
];

export class CloudflareApiError extends Error {
	constructor(message: string, public status: number) {
		super(message);
		this.name = "CloudflareApiError";
	}
}

export const cloudflareEnabled = (env: CloudflareEnv) => !!env.CF_API_TOKEN;
export const workerName = (env: CloudflareEnv) => env.WORKER_NAME?.trim() || DEFAULT_WORKER_NAME;

interface Envelope<T> {
	success: boolean;
	errors?: { code: number; message: string }[];
	result: T;
	result_info?: { page: number; total_pages?: number; total_count?: number; per_page: number; count: number };
}

async function cf<T>(env: CloudflareEnv, method: string, path: string, body?: unknown): Promise<Envelope<T>> {
	if (!env.CF_API_TOKEN) throw new CloudflareApiError("CF_API_TOKEN is not set", 501);
	const res = await fetch(`${API}${path}`, {
		method,
		headers: { Authorization: `Bearer ${env.CF_API_TOKEN}`, "Content-Type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	const json = (await res.json().catch(() => null)) as Envelope<T> | null;
	if (!res.ok || !json?.success) {
		const msg = json?.errors?.map((e) => e.message).join("; ") || `HTTP ${res.status}`;
		const hint = res.status === 403 || res.status === 401 ? " (check the CF_API_TOKEN permissions)" : "";
		throw new CloudflareApiError(`${method} ${path.split("?")[0]}: ${msg}${hint}`, res.status);
	}
	return json;
}

/** Every page of a paged list endpoint. */
async function cfAll<T>(env: CloudflareEnv, path: string, perPage = 50): Promise<T[]> {
	const out: T[] = [];
	const sep = path.includes("?") ? "&" : "?";
	for (let page = 1; page <= 20; page++) {
		const res = await cf<T[]>(env, "GET", `${path}${sep}page=${page}&per_page=${perPage}`);
		out.push(...(res.result ?? []));
		const info = res.result_info;
		if (!info || (info.total_pages ? page >= info.total_pages : info.count < perPage)) break;
	}
	return out;
}

// ── Zones ──────────────────────────────────────────────────────────

export interface Zone {
	id: string;
	name: string;
	accountId: string;
}

/** Active zones the token can see, by name. */
export async function listZones(env: CloudflareEnv): Promise<Zone[]> {
	const zones = await cfAll<{ id: string; name: string; account: { id: string } }>(env, "/zones?status=active");
	return zones.map((z) => ({ id: z.id, name: z.name.toLowerCase(), accountId: z.account.id })).sort((a, b) => a.name.localeCompare(b.name));
}

async function getZone(env: CloudflareEnv, domain: string): Promise<Zone> {
	const res = await cf<{ id: string; name: string; account: { id: string } }[]>(env, "GET", `/zones?name=${encodeURIComponent(domain)}`);
	const z = res.result?.[0];
	if (!z) throw new CloudflareApiError(`${domain} is not a zone in this Cloudflare account`, 404);
	return { id: z.id, name: z.name.toLowerCase(), accountId: z.account.id };
}

// ── Reading the setup ──────────────────────────────────────────────

interface RawRule {
	id?: string;
	tag?: string;
	name?: string;
	enabled: boolean;
	matchers: { type: string; field?: string; value?: string }[];
	actions: { type: string; value?: string[] }[];
}

const actionOf = (r: RawRule): { action: RouteAction; target: string | null } => {
	const a = r.actions?.[0];
	const action = (a?.type === "worker" || a?.type === "forward" ? a.type : "drop") as RouteAction;
	return { action, target: a?.value?.[0] ?? null };
};

async function findQueueId(env: CloudflareEnv, accountId: string): Promise<string | null> {
	try {
		const queues = await cfAll<{ queue_id: string; queue_name: string }>(env, `/accounts/${accountId}/queues`, 100);
		return queues.find((q) => q.queue_name === EVENTS_QUEUE)?.queue_id ?? null;
	} catch {
		return null; // No Queues permission: delivery tracking is shown as not set up.
	}
}

interface Subscription {
	id: string;
	source?: { type?: string; zone_id?: string; domain?: string };
	destination?: { queue_id?: string };
}

async function readEvents(env: CloudflareEnv, zone: Zone, domain: string): Promise<{ queueId: string | null; subscribed: boolean }> {
	const queueId = await findQueueId(env, zone.accountId);
	if (!queueId) return { queueId: null, subscribed: false };
	const subs = await cfAll<Subscription>(env, `/accounts/${zone.accountId}/event_subscriptions/subscriptions`).catch(() => [] as Subscription[]);
	const subscribed = subs.some(
		(s) => s.source?.type === "email.sending" && s.source.zone_id === zone.id && s.source.domain?.toLowerCase() === domain && s.destination?.queue_id === queueId,
	);
	return { queueId, subscribed };
}

interface ReadResult {
	setup: DomainSetup;
	zone: Zone;
	queueId: string | null;
	catchAllRule: RawRule | null;
}

async function read(env: CloudflareEnv, domain: string): Promise<ReadResult> {
	const d = domain.toLowerCase();
	const zone = await getZone(env, d);
	const [routing, rules, sending, events] = await Promise.all([
		cf<{ enabled: boolean; status: string }>(env, "GET", `/zones/${zone.id}/email/routing`).then((r) => r.result),
		cfAll<RawRule>(env, `/zones/${zone.id}/email/routing/rules`),
		cf<{ id: string; name: string; enabled: boolean }[]>(env, "GET", `/zones/${zone.id}/email/sending/subdomains`).then((r) => r.result ?? []),
		readEvents(env, zone, d),
	]);
	const catchAllRule = rules.find((r) => r.matchers?.some((m) => m.type === "all")) ?? null;
	const addressRules: AddressRule[] = rules
		.filter((r) => r.matchers?.length === 1 && r.matchers[0].type === "literal" && r.matchers[0].value)
		.map((r) => ({ id: (r.id || r.tag)!, address: r.matchers[0].value!.toLowerCase(), enabled: r.enabled, ...actionOf(r) }));
	const sendingRow = sending.find((s) => s.name.toLowerCase() === d) ?? null;
	const setup: DomainSetup = {
		domain: d,
		zoneId: zone.id,
		routing: { enabled: !!routing?.enabled, status: routing?.status ?? "unknown" },
		catchAll: catchAllRule ? { enabled: catchAllRule.enabled, ...actionOf(catchAllRule) } : { enabled: false, action: "drop", target: null },
		rules: addressRules,
		sending: { enabled: !!sendingRow?.enabled, id: sendingRow?.id ?? null },
		events: events.queueId ? { subscribed: events.subscribed } : null,
	};
	return { setup, zone, queueId: events.queueId, catchAllRule };
}

export async function getDomainSetup(env: CloudflareEnv, domain: string): Promise<DomainSetup> {
	return (await read(env, domain)).setup;
}

// ── Applying the setup ─────────────────────────────────────────────

const toWorker = (worker: string) => [{ type: "worker", value: [worker] }];

/**
 * Make the "todo" steps of planSetup true, in order. Each step runs even if
 * an earlier one failed, so one problem (for example a DNS conflict for
 * sending) does not block receiving. Returns one result per changed step and
 * the setup as read afterwards.
 */
export async function applySetup(
	env: CloudflareEnv,
	domain: string,
	opts: Omit<PlanOptions, "worker"> = {},
): Promise<{ results: StepResult[]; setup: DomainSetup }> {
	const worker = workerName(env);
	const { setup, zone, queueId, catchAllRule } = await read(env, domain);
	const steps = planSetup(setup, { ...opts, worker }).filter((s) => s.state === "todo");
	const results: StepResult[] = [];
	const run = async (id: StepResult["id"], label: string, fn: () => Promise<string | void>) => {
		try {
			const detail = await fn();
			results.push({ id, ok: true, label, detail: detail || undefined });
		} catch (e) {
			results.push({ id, ok: false, label, detail: (e as Error).message });
		}
	};

	for (const step of steps) {
		switch (step.id) {
			case "routing":
				await run("routing", "Turned on Email Routing", async () => {
					// No body: a "name" here means a subdomain, and the apex is rejected (code 2007).
					await cf(env, "POST", `/zones/${zone.id}/email/routing/dns`);
				});
				break;
			case "catchAll":
				await run("catchAll", `Unknown addresses on @${zone.name} now go to this app`, async () => {
					await cf(env, "PUT", `/zones/${zone.id}/email/routing/rules/catch_all`, {
						name: catchAllRule?.name || `${RULE_NAME_PREFIX}: catch-all`,
						enabled: true,
						matchers: [{ type: "all" }],
						actions: toWorker(worker),
					});
				});
				break;
			case "route": {
				const address = opts.address!.toLowerCase();
				await run("route", `${address} now goes to this app`, async () => {
					await putAddressRule(env, zone.id, address, worker, setup.rules.find((r) => r.address === address) ?? null);
				});
				break;
			}
			case "sending":
				await run("sending", "Turned on Email Sending", async () => {
					const created = await cf<{ id?: string; tag?: string }>(env, "POST", `/zones/${zone.id}/email/sending/subdomains`, { name: zone.name });
					const id = created.result?.id || created.result?.tag;
					if (!id) return;
					// Idempotent: adds any sending DNS record that is missing.
					try {
						await cf(env, "POST", `/zones/${zone.id}/email/sending/subdomains/${id}/dns`);
					} catch (e) {
						return `DNS records need attention: ${(e as Error).message}`;
					}
				});
				break;
			case "events":
				if (!queueId) break;
				await run("events", "Turned on delivery tracking", async () => {
					await cf(env, "POST", `/accounts/${zone.accountId}/event_subscriptions/subscriptions`, {
						name: `agentic-inbox-${zone.name}`,
						enabled: true,
						source: { type: "email.sending", zone_id: zone.id, domain: zone.name },
						destination: { type: "queues.queue", queue_id: queueId },
						events: SENDING_EVENTS,
					});
				});
				break;
		}
	}

	return { results, setup: results.length ? await getDomainSetup(env, domain) : setup };
}

async function putAddressRule(env: CloudflareEnv, zoneId: string, address: string, worker: string, existing: AddressRule | null) {
	const body = {
		name: `${RULE_NAME_PREFIX}: ${address}`,
		enabled: true,
		matchers: [{ type: "literal", field: "to", value: address }],
		actions: toWorker(worker),
	};
	if (existing) await cf(env, "PUT", `/zones/${zoneId}/email/routing/rules/${existing.id}`, body);
	else await cf(env, "POST", `/zones/${zoneId}/email/routing/rules`, body);
}

/**
 * Make sure mail to a burner address reaches the Worker. A catch-all rule to
 * this Worker already does that; otherwise an address rule is added. A rule
 * the owner made for the same address is not changed: the result says so.
 */
export async function ensureBurnerRoute(env: CloudflareEnv, address: string): Promise<{ ok: boolean; detail: string }> {
	const worker = workerName(env);
	const domain = address.split("@")[1]?.toLowerCase();
	if (!domain) return { ok: false, detail: "Address has no domain" };
	const { setup, zone } = await read(env, domain);
	if (!setup.routing.enabled) return { ok: false, detail: `Email Routing is off for ${domain}` };
	const rule = setup.rules.find((r) => r.address === address.toLowerCase());
	if (rule?.enabled && rule.action === "worker" && rule.target === worker) return { ok: true, detail: "Address rule exists" };
	if (rule?.enabled) return { ok: false, detail: `An existing rule for ${address} sends it elsewhere` };
	if (setup.catchAll.enabled && setup.catchAll.action === "worker" && setup.catchAll.target === worker) {
		return { ok: true, detail: "Delivered by the catch-all rule" };
	}
	await putAddressRule(env, zone.id, address.toLowerCase(), worker, rule ?? null);
	return { ok: true, detail: "Address rule added" };
}

/**
 * ensureBurnerRoute for a new burner, never throwing. Returns a warning to
 * show when the burner may not receive mail, or null when it is fine (or
 * when Cloudflare setup is not configured).
 */
export async function routeBurner(env: CloudflareEnv, address: string): Promise<string | null> {
	if (!cloudflareEnabled(env)) return null;
	try {
		const r = await ensureBurnerRoute(env, address);
		return r.ok ? null : `${address} may not receive mail: ${r.detail}.`;
	} catch (e) {
		console.error("Burner route setup failed:", (e as Error).message);
		return `${address} may not receive mail: ${(e as Error).message}`;
	}
}
