/**
 * Email Sending lifecycle events, delivered by a Cloudflare Queues event
 * subscription. See:
 * https://developers.cloudflare.com/email-service/reference/event-subscriptions/
 */

export type DeliveryStatus = "sent" | "delivered" | "deferred" | "bounced" | "failed" | "rejected" | "complained";

export interface EmailSendingEvent {
	type: string; // e.g. "cf.email.sending.message.bounced"
	source?: { type?: string; zoneId?: string; domain?: string };
	payload: {
		eventId?: string;
		messageId?: string;
		sender?: string;
		recipient?: string;
		subject?: string;
		terminal?: boolean;
		delivery?: {
			status?: string;
			provider?: string;
			smtpStatusCode?: string;
			smtpEnhancedStatusCode?: string;
			smtpResponse?: string;
		};
		bounce?: { type?: string; classification?: string; reason?: string };
	};
	metadata?: { eventTimestamp?: string };
}

/** Event types that mean the message did not reach the recipient. */
export const FAILURE_STATUSES: ReadonlySet<DeliveryStatus> = new Set(["bounced", "failed", "rejected"]);

/** Later statuses must not be overwritten by earlier, out-of-order ones. */
const STATUS_RANK: Record<DeliveryStatus, number> = {
	sent: 0,
	deferred: 1,
	delivered: 2,
	bounced: 2,
	failed: 2,
	rejected: 2,
	complained: 3,
};

export function statusFromEventType(type: string): DeliveryStatus | null {
	const m = type.match(/^cf\.email\.sending\.message\.(\w+)$/);
	if (!m) return null;
	const s = m[1] as DeliveryStatus;
	return s in STATUS_RANK ? s : null;
}

export function shouldReplaceStatus(current: string | null, next: DeliveryStatus): boolean {
	if (!current || !(current in STATUS_RANK)) return true;
	return STATUS_RANK[next] >= STATUS_RANK[current as DeliveryStatus];
}
