// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/**
 * Cloudflare setup of a domain for this app, shared by the Worker (which
 * reads and changes it through the Cloudflare API) and the app (which shows
 * the plan before anything changes).
 *
 * A mailbox address works when:
 * - Email Routing is on for the zone,
 * - an address rule, or else the catch-all rule, sends the address to this Worker,
 * - Email Sending is on for the domain (to send from it),
 * - the domain's sending events go to the delivery-events queue (delivery badges, bounce notices).
 */

export type RouteAction = "worker" | "forward" | "drop";

/** One Email Routing rule for a single address ("literal" matcher). */
export interface AddressRule {
	id: string;
	address: string;
	action: RouteAction;
	/** Worker name or forward destination; null for drop. */
	target: string | null;
	enabled: boolean;
}

export interface DomainSetup {
	domain: string;
	zoneId: string;
	routing: { enabled: boolean; status: string };
	catchAll: { enabled: boolean; action: RouteAction; target: string | null };
	rules: AddressRule[];
	sending: { enabled: boolean; id: string | null };
	/** null when there is no delivery-events queue to subscribe to. */
	events: { subscribed: boolean } | null;
}

export type StepId = "routing" | "catchAll" | "route" | "sending" | "events";
export type StepState = "done" | "todo" | "info";

export interface SetupStep {
	id: StepId;
	state: StepState;
	/** What is true now ("done") or what the app will change ("todo"). */
	label: string;
	detail?: string;
	/** A "todo" that replaces a route the owner set up themselves. */
	replaces?: string;
}

export interface StepResult {
	id: StepId;
	ok: boolean;
	label: string;
	detail?: string;
}

/** The Worker name Email Routing rules point at. */
export const DEFAULT_WORKER_NAME = "agentic-inbox";

/** Prefix of the names of rules this app creates. */
export const RULE_NAME_PREFIX = "Agentic Inbox";

const describe = (action: RouteAction, target: string | null, worker: string) =>
	action === "worker"
		? target === worker ? "this app" : `the Worker ${target}`
		: action === "forward" ? `forwards to ${target}` : "drops the mail";

const reachesApp = (action: RouteAction, target: string | null, worker: string) =>
	action === "worker" && target === worker;

export interface AddressRoute {
	/** True when mail to the address reaches this Worker now. */
	reaches: boolean;
	via: "rule" | "catch-all" | "none";
	/** The rule for this address, if there is one. */
	rule: AddressRule | null;
	/** Plain-language description of where the mail goes now. */
	summary: string;
}

/** Where mail to `address` goes now. */
export function addressRoute(d: DomainSetup, address: string, worker = DEFAULT_WORKER_NAME): AddressRoute {
	const addr = address.toLowerCase();
	const rule = d.rules.find((r) => r.address === addr) ?? null;
	if (!d.routing.enabled) return { reaches: false, via: "none", rule, summary: "Email Routing is off for this domain" };
	if (rule?.enabled) {
		return { reaches: reachesApp(rule.action, rule.target, worker), via: "rule", rule, summary: `Address rule: ${describe(rule.action, rule.target, worker)}` };
	}
	if (d.catchAll.enabled) {
		return {
			reaches: reachesApp(d.catchAll.action, d.catchAll.target, worker),
			via: "catch-all",
			rule,
			summary: `Catch-all: ${describe(d.catchAll.action, d.catchAll.target, worker)}`,
		};
	}
	return { reaches: false, via: "none", rule, summary: "No rule matches; the mail is rejected" };
}

export function catchAllReachesApp(d: DomainSetup, worker = DEFAULT_WORKER_NAME): boolean {
	return d.routing.enabled && d.catchAll.enabled && reachesApp(d.catchAll.action, d.catchAll.target, worker);
}

/**
 * The default for the "send unknown addresses to the app" option: on when
 * nothing would be lost (the catch-all is off or drops mail), off when the
 * owner forwards unknown addresses somewhere else.
 */
export function defaultCatchAllChoice(d: DomainSetup | null, worker = DEFAULT_WORKER_NAME): boolean {
	if (!d) return false;
	if (catchAllReachesApp(d, worker)) return true;
	return !d.routing.enabled || !d.catchAll.enabled || d.catchAll.action === "drop";
}

export interface PlanOptions {
	/** The mailbox address to deliver to this app, if any. */
	address?: string;
	/** Also send unknown addresses on the domain to this app. */
	catchAll?: boolean;
	worker?: string;
}

/**
 * Every setup step for the domain, in the order they are applied. Steps
 * already in place are "done"; steps the app will change are "todo".
 */
export function planSetup(d: DomainSetup, opts: PlanOptions = {}): SetupStep[] {
	const worker = opts.worker ?? DEFAULT_WORKER_NAME;
	const steps: SetupStep[] = [];
	const domain = d.domain;

	steps.push(
		d.routing.enabled
			? { id: "routing", state: "done", label: "Email Routing is on" }
			: { id: "routing", state: "todo", label: "Turn on Email Routing", detail: `Adds MX and SPF records to ${domain}.` },
	);

	const catchAllHere = catchAllReachesApp(d, worker);
	const catchAllNow = d.catchAll.enabled ? describe(d.catchAll.action, d.catchAll.target, worker) : "off";
	if (catchAllHere) {
		steps.push({ id: "catchAll", state: "done", label: `Unknown addresses on @${domain} go to this app` });
	} else if (opts.catchAll) {
		const forwarding = d.catchAll.enabled && d.catchAll.action !== "drop";
		steps.push({
			id: "catchAll",
			state: "todo",
			label: `Send unknown addresses on @${domain} to this app`,
			detail: "Burner addresses and the Other addresses folder need this.",
			replaces: forwarding ? `The catch-all ${catchAllNow} now.` : undefined,
		});
	} else {
		steps.push({
			id: "catchAll",
			state: "info",
			label: `Unknown addresses on @${domain}: ${catchAllNow === "off" ? "rejected" : catchAllNow}`,
			detail: "Burners on this domain get their own address rule.",
		});
	}

	if (opts.address) {
		const addr = opts.address.toLowerCase();
		const route = addressRoute(d, addr, worker);
		const coveredByNewCatchAll = opts.catchAll && !route.rule?.enabled;
		if (route.reaches) {
			steps.push({ id: "route", state: "done", label: `${addr} is delivered to this app`, detail: route.via === "catch-all" ? "By the catch-all rule." : "By an address rule." });
		} else if (coveredByNewCatchAll) {
			steps.push({ id: "route", state: "done", label: `${addr} will be delivered by the catch-all rule` });
		} else if (route.rule) {
			steps.push({
				id: "route",
				state: "todo",
				label: `Change the rule for ${addr} to deliver to this app`,
				replaces: route.rule.enabled ? `It ${describe(route.rule.action, route.rule.target, worker)} now.` : "The rule is off now.",
			});
		} else {
			steps.push({ id: "route", state: "todo", label: `Add a rule that delivers ${addr} to this app` });
		}
	}

	steps.push(
		d.sending.enabled
			? { id: "sending", state: "done", label: "Email Sending is on" }
			: { id: "sending", state: "todo", label: "Turn on Email Sending", detail: `Adds DKIM, SPF and return-path records under cf-bounce.${domain}.` },
	);

	if (d.events === null) {
		steps.push({ id: "events", state: "info", label: "Delivery tracking is not set up", detail: "The delivery-events queue does not exist. See README, Delivery tracking." });
	} else {
		steps.push(
			d.events.subscribed
				? { id: "events", state: "done", label: "Delivery tracking is on" }
				: { id: "events", state: "todo", label: "Turn on delivery tracking", detail: "Sends delivery and bounce events for this domain to the app." },
		);
	}
	return steps;
}

export type Health = "ready" | "no-send" | "no-receive" | "off";

/** One word for a mailbox address: can it receive, can it send. */
export function addressHealth(d: DomainSetup, address: string, worker = DEFAULT_WORKER_NAME): Health {
	const receives = addressRoute(d, address, worker).reaches;
	if (receives && d.sending.enabled) return "ready";
	if (receives) return "no-send";
	return d.sending.enabled ? "no-receive" : "off";
}

export const HEALTH_LABEL: Record<Health, string> = {
	ready: "Ready",
	"no-send": "Cannot send",
	"no-receive": "Not receiving",
	off: "Not set up",
};
