# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One owner-operator who runs several identities at once: domains, mailboxes, burner addresses, and a catch-all per domain. They triage mail across all of them, delegate reading and drafting to an AI agent, and connect outside AI clients over MCP. They use a desktop browser for long triage sessions and an installed phone PWA on the go. One seat, behind Cloudflare Access.

## Product Purpose

Agentic Inbox is a self-hosted mail system on Cloudflare Workers. It receives mail through Email Routing, stores each mailbox in its own Durable Object (SQLite) with attachments in R2, sends through the Email Service binding, and runs an AI agent (Agents SDK, Workers AI) per mailbox plus one agent across all mailboxes. Success: the operator controls every address and every message flow from one place, with the agent doing the reading and drafting.

## Positioning

Not a consumer mail client. It is an operations console for addresses and message flows: every mailbox, burner, and catch-all route is a governed asset; mail is a queue to clear; the agent is an operator whose actions are visible as a run log; MCP exposes the same tools to outside clients.

## Operating Context

- Triage: keyboard-first (g-then-i/t/d/a/s, j/k, o, x, e, #, s, I/U, c, /, ?), bulk actions, paged lists on desktop; swipe, long-press, pull-to-refresh, infinite scroll on phones.
- Views: one mailbox (`/mailbox/:id/...`) or all mailboxes (`/all/...`), folders Inbox, Other addresses (catch-all mail), Starred, Sent, Drafts, Archive, Trash, plus custom labels.
- Identities: burner addresses per mailbox (on/off, received and blocked counts); catch-all per domain routes unknown-address mail to one mailbox's Other addresses folder, or rejects it.
- Delivery tracking for sent mail: sent, delivered, deferred, bounced, failed, rejected, complained.
- Agent: side panel chat with tool calls; drafts only, a human confirms every send. MCP server at `/mcp`.

## Capabilities and Constraints

- Keep all keyboard shortcuts as they are.
- Keep the route and folder URL structure as it is.
- Keep the agent draft-only safety model: the agent never sends without explicit human confirmation.
- Full mobile parity: phones keep the same gestures and capabilities.
- Light and dark follow the OS (`light-dark()` tokens over `@cloudflare/kumo`).
- Stack: React Router v7, Tailwind v4, Kumo components, Phosphor icons, TanStack Query, Zustand.

## Brand Commitments

Product name "Agentic Inbox". Visual reference set by the owner: enterprise data and operations platforms (Databricks, Snowflake, Palantir, Informatica): tools whose interfaces are tailored to the specific job of each area.

## Evidence on Hand

No customers, metrics, or testimonials. Local dev has seeded mailboxes alice/bob/carol/me@example.com.

## Product Principles

1. Addresses are assets: show every address, route, and its state explicitly.
2. Every area is shaped by its job: triage is a queue, burners are a registry, routing is configuration, the agent is a run log.
3. Machine actions are visible and attributable; humans confirm sends.
4. Density for the desk, parity for the phone.
5. Keyboard first, never keyboard only.
