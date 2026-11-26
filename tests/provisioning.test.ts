import { afterEach, describe, expect, it, vi } from "vitest";
import { addressHealth, addressRoute, defaultCatchAllChoice, type DomainSetup, planSetup } from "../shared/provisioning";
import { applySetup, ensureBurnerRoute } from "../workers/lib/cloudflare";

const base = (over: Partial<DomainSetup> = {}): DomainSetup => ({
	domain: "example.com",
	zoneId: "z1",
	routing: { enabled: true, status: "ready" },
	catchAll: { enabled: true, action: "worker", target: "agentic-inbox" },
	rules: [],
	sending: { enabled: true, id: "s1" },
	events: { subscribed: true },
	...over,
});

const todo = (d: DomainSetup, opts: Parameters<typeof planSetup>[1]) =>
	planSetup(d, opts).filter((s) => s.state === "todo").map((s) => s.id);

describe("planSetup", () => {
	it("has nothing to do when the domain is fully set up", () => {
		expect(todo(base(), { address: "me@example.com" })).toEqual([]);
		expect(addressHealth(base(), "me@example.com")).toBe("ready");
	});

	it("only turns on sending and tracking when the catch-all already reaches the app", () => {
		const d = base({ sending: { enabled: false, id: null }, events: { subscribed: false } });
		expect(todo(d, { address: "me@example.com" })).toEqual(["sending", "events"]);
		expect(addressHealth(d, "me@example.com")).toBe("no-send");
	});

	it("sets up a domain with no Email Routing from scratch", () => {
		const d = base({
			routing: { enabled: false, status: "unconfigured" },
			catchAll: { enabled: false, action: "drop", target: null },
			sending: { enabled: false, id: null },
			events: { subscribed: false },
		});
		expect(defaultCatchAllChoice(d)).toBe(true);
		// The new catch-all delivers the address, so no address rule is needed.
		expect(todo(d, { address: "me@example.com", catchAll: true })).toEqual(["routing", "catchAll", "sending", "events"]);
		expect(todo(d, { address: "me@example.com", catchAll: false })).toEqual(["routing", "route", "sending", "events"]);
	});

	it("keeps a forwarding catch-all by default and adds an address rule", () => {
		const d = base({ catchAll: { enabled: true, action: "forward", target: "owner@mail.test" } });
		expect(defaultCatchAllChoice(d)).toBe(false);
		const steps = planSetup(d, { address: "new@example.com", catchAll: false });
		expect(steps.find((s) => s.id === "catchAll")?.state).toBe("info");
		const route = steps.find((s) => s.id === "route");
		expect(route?.state).toBe("todo");
		expect(route?.replaces).toBeUndefined();
		expect(addressHealth(d, "new@example.com")).toBe("no-receive");
	});

	it("warns before it replaces a forwarding catch-all or address rule", () => {
		const d = base({
			catchAll: { enabled: true, action: "forward", target: "owner@mail.test" },
			rules: [{ id: "r1", address: "support@example.com", action: "forward", target: "owner@mail.test", enabled: true }],
		});
		const withCatchAll = planSetup(d, { address: "support@example.com", catchAll: true });
		expect(withCatchAll.find((s) => s.id === "catchAll")?.replaces).toContain("forwards to owner@mail.test");
		// The address rule wins over the catch-all, so it must change too.
		expect(withCatchAll.find((s) => s.id === "route")?.replaces).toContain("forwards to owner@mail.test");
	});

	it("treats an address rule to the app as delivered, even with a forwarding catch-all", () => {
		const d = base({
			catchAll: { enabled: true, action: "forward", target: "owner@mail.test" },
			rules: [{ id: "r1", address: "me@example.com", action: "worker", target: "agentic-inbox", enabled: true }],
		});
		expect(addressRoute(d, "ME@example.com")).toMatchObject({ reaches: true, via: "rule" });
	});

	it("does not count a rule to another Worker", () => {
		const d = base({ catchAll: { enabled: true, action: "worker", target: "other-worker" } });
		expect(addressRoute(d, "me@example.com").reaches).toBe(false);
		expect(addressRoute(d, "me@example.com", "other-worker").reaches).toBe(true);
	});

	it("leaves out the tracking step when there is no events queue", () => {
		const steps = planSetup(base({ events: null }));
		expect(steps.find((s) => s.id === "events")?.state).toBe("info");
	});
});

// ── applySetup against a fake Cloudflare API ───────────────────────

type Call = { method: string; path: string; body?: unknown };

function fakeApi(state: {
	routing: boolean;
	rules: unknown[];
	sending: unknown[];
	queue?: boolean;
	subs?: unknown[];
	failSending?: boolean;
}) {
	const calls: Call[] = [];
	const ok = (result: unknown, extra: object = {}) =>
		new Response(JSON.stringify({ success: true, errors: [], result, ...extra }), { status: 200 });
	const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
		const u = new URL(url);
		const path = u.pathname.replace("/client/v4", "");
		const method = init.method ?? "GET";
		calls.push({ method, path, body: init.body ? JSON.parse(init.body as string) : undefined });
		const list = (items: unknown[]) => ok(items, { result_info: { page: 1, per_page: 50, count: items.length, total_pages: 1 } });
		if (method === "GET" && path === "/zones") return list([{ id: "z1", name: "example.com", account: { id: "a1" } }]);
		if (method === "GET" && path === "/zones/z1/email/routing") return ok({ enabled: state.routing, status: state.routing ? "ready" : "unconfigured" });
		if (method === "GET" && path === "/zones/z1/email/routing/rules") return list(state.rules);
		if (method === "GET" && path === "/zones/z1/email/sending/subdomains") return ok(state.sending);
		if (method === "GET" && path === "/accounts/a1/queues") return list(state.queue === false ? [] : [{ queue_id: "q1", queue_name: "agentic-inbox-email-events" }]);
		if (method === "GET" && path === "/accounts/a1/event_subscriptions/subscriptions") return list(state.subs ?? []);
		if (method === "POST" && path === "/zones/z1/email/sending/subdomains" && state.failSending) {
			return new Response(JSON.stringify({ success: false, errors: [{ code: 1, message: "not entitled" }] }), { status: 400 });
		}
		if (method === "POST" && path === "/zones/z1/email/sending/subdomains") return ok({ id: "s1" });
		return ok({});
	});
	vi.stubGlobal("fetch", fetchMock);
	return calls;
}

const env = { CF_API_TOKEN: "t" };
const catchAllForward = { id: "c1", name: "", enabled: true, matchers: [{ type: "all" }], actions: [{ type: "forward", value: ["owner@mail.test"] }] };
const writes = (calls: Call[]) => calls.filter((c) => c.method !== "GET").map((c) => `${c.method} ${c.path}`);

describe("applySetup", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("adds only an address rule, sending and tracking on a forwarding domain", async () => {
		const calls = fakeApi({ routing: true, rules: [catchAllForward], sending: [] });
		const { results } = await applySetup(env, "example.com", { address: "new@example.com", catchAll: false });
		expect(results.every((r) => r.ok)).toBe(true);
		expect(writes(calls)).toEqual([
			"POST /zones/z1/email/routing/rules",
			"POST /zones/z1/email/sending/subdomains",
			"POST /zones/z1/email/sending/subdomains/s1/dns",
			"POST /accounts/a1/event_subscriptions/subscriptions",
		]);
		const rule = calls.find((c) => c.path === "/zones/z1/email/routing/rules" && c.method === "POST")!.body as Record<string, unknown>;
		expect(rule).toMatchObject({
			matchers: [{ type: "literal", field: "to", value: "new@example.com" }],
			actions: [{ type: "worker", value: ["agentic-inbox"] }],
		});
	});

	it("updates the owner's forwarding rule instead of adding a second one", async () => {
		const forward = { id: "r9", name: "support", enabled: true, matchers: [{ type: "literal", field: "to", value: "support@example.com" }], actions: [{ type: "forward", value: ["owner@mail.test"] }] };
		const calls = fakeApi({ routing: true, rules: [catchAllForward, forward], sending: [{ id: "s1", name: "example.com", enabled: true }], subs: [], queue: false });
		await applySetup(env, "example.com", { address: "support@example.com" });
		expect(writes(calls)).toEqual(["PUT /zones/z1/email/routing/rules/r9"]);
	});

	it("keeps going after a failed step and reports it", async () => {
		const calls = fakeApi({ routing: false, rules: [], sending: [], failSending: true });
		const { results } = await applySetup(env, "example.com", { address: "me@example.com", catchAll: true });
		expect(results.map((r) => [r.id, r.ok])).toEqual([
			["routing", true],
			["catchAll", true],
			["sending", false],
			["events", true],
		]);
		expect(results.find((r) => r.id === "sending")?.detail).toContain("not entitled");
		expect(writes(calls)).toContain("PUT /zones/z1/email/routing/rules/catch_all");
		// Cloudflare rejects the apex as "name" (it must be a subdomain): send no body.
		expect(calls.find((c) => c.method === "POST" && c.path === "/zones/z1/email/routing/dns")?.body).toBeUndefined();
	});
});

describe("ensureBurnerRoute", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("adds no rule when the catch-all reaches the app", async () => {
		const calls = fakeApi({ routing: true, rules: [{ ...catchAllForward, actions: [{ type: "worker", value: ["agentic-inbox"] }] }], sending: [] });
		expect((await ensureBurnerRoute(env, "x@example.com")).ok).toBe(true);
		expect(writes(calls)).toEqual([]);
	});

	it("adds a rule when the catch-all forwards elsewhere, and never takes over the owner's rule", async () => {
		const owned = { id: "r1", enabled: true, matchers: [{ type: "literal", field: "to", value: "taken@example.com" }], actions: [{ type: "forward", value: ["owner@mail.test"] }] };
		const calls = fakeApi({ routing: true, rules: [catchAllForward, owned], sending: [] });
		expect((await ensureBurnerRoute(env, "x@example.com")).ok).toBe(true);
		expect(writes(calls)).toEqual(["POST /zones/z1/email/routing/rules"]);
		expect((await ensureBurnerRoute(env, "taken@example.com")).ok).toBe(false);
		expect(writes(calls)).toHaveLength(1);
	});
});
