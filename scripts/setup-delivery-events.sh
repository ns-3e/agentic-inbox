#!/usr/bin/env bash
# One-time setup for delivery tracking (bounce notices + delivery badges).
#
# Creates the queue that the Worker consumes (see "queues" in wrangler.jsonc)
# and subscribes each Email Sending domain to it.
#
# Usage: scripts/setup-delivery-events.sh domain=zone_id [domain=zone_id ...]
# Find a zone ID on the zone's Overview page in the Cloudflare dashboard.
# Run this BEFORE `npm run deploy`: the deploy fails if the queue does not exist.
set -euo pipefail

QUEUE="agentic-inbox-email-events"
EVENTS="message.delivered,message.deferred,message.bounced,message.failed,message.rejected,message.complained"
# Email Sending event sources need a recent Wrangler.
WRANGLER=(npx --yes wrangler@4.166.0)

if [ "$#" -eq 0 ]; then
	echo "Usage: $0 domain=zone_id [domain=zone_id ...]" >&2
	exit 1
fi

"${WRANGLER[@]}" queues create "$QUEUE" || echo "Queue $QUEUE may already exist; continuing."

for pair in "$@"; do
	domain="${pair%%=*}"
	zone="${pair##*=}"
	echo "Subscribing $domain to $QUEUE"
	"${WRANGLER[@]}" queues subscription create "$QUEUE" \
		--source email.sending --zone-id "$zone" --domain "$domain" \
		--events "$EVENTS" --name "agentic-inbox-$domain"
done
