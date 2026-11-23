# Design

Operations console for addresses and message flows. Reference class: enterprise data and operations platforms (Databricks, Snowflake, Palantir, Informatica). Every area is shaped by its job. Tokens and component classes live in `app/index.css`.

## Principles

- Panes meet at 1px hairlines. No floating cards, no pills, no rounded page containers.
- One accent (routing teal) for selection, primary actions, and unread. One machine color (violet) only for the agent and its actions. Semantic colors only for state.
- Addresses, IDs, counts, and timestamps are data: set them in the system mono with tabular figures (`.ops-mono`, `.tabular`). Prose and labels use the system sans.
- Density for the desk (32–36px rows, 13px text), parity for the phone (44px targets, 15px titles, same gestures).
- Light and dark follow the OS through `light-dark()` tokens over Kumo.

## Color tokens

| Role | Token | Light | Dark |
|---|---|---|---|
| Canvas (rail, chrome) | `--color-kumo-recessed` | #f3f4f6 | #0e1115 |
| Surface | `--color-kumo-base` | #ffffff | #15191e |
| Header bands (toolbars, table heads) | `--ops-header` | #f8f9fa | #12161b |
| Hairline | `--color-kumo-line` | #e1e4e8 | #262c33 |
| Control border | `--ops-line-strong` | #cdd2d9 | #343b44 |
| Text / strong / subtle | `--text-color-kumo-*` | #14181d / #363d47 / #5a6370 | #e4e7ec / #c2c8d1 / #8f98a5 |
| Accent (routing teal) | `--color-kumo-brand` | #0b6e78 | #36aab4 |
| Accent tint / text (selection) | `--ops-accent-tint` / `--ops-accent-text` | #e2f1f2 / #075158 | #10313a / #8fdde3 |
| Agent (machine actor) | `--ops-agent` / `--ops-agent-tint` | #6b46d6 / #f0ebfd | #ad97ff / #251d40 |
| OK / Warn / Bad | `--ops-ok` / `--ops-warn` / `--ops-bad` (+ `-tint`) | #17794a / #94560a / #b8321f | #55c48b / #e6a74a / #f2836f |
| Star | `--ops-star` | #b7791f | #e9b44c |

Accent and agent colors are user preferences. Only `--accent-l` / `--accent-d` and `--agent-l` / `--agent-d` are set (inline on `<html>`); tint, text, hover and focus-ring tokens are `color-mix()`ed from them, so never hard-code an accent value. Custom accents are derived in OKLCH so white text on the light shade stays ≥ 4.5:1. Density sets `--row-h`, `--row2-py`, `--nav-h`, `--table-row-h` through `data-density`; text size sets `--ui-scale` (root font size), so use rem, not px, for type.

Per-mailbox identity: a hue dot from `mailboxHue()` (golden-angle spread over the sorted mailbox list), the same in the rail, scope switcher, list, reader, and directory.

## Type

System sans stack at 14px base; scale 11 / 12 / 13 / 15 / 16 / 18 / 20. Weights 400, 600, 650. Section labels in rails and table heads: 10.5–11px, 600, uppercase, 0.03–0.04em tracking. Mono stack `--ops-mono` (SF Mono, JetBrains Mono, Menlo).

## Components (classes in `app/index.css`)

- `.nav-pill`, `.nav-section`, `.nav-count`: rail entries, 32px, 6px radius; active = accent tint + accent text + 600; count = mono badge (filled accent when active).
- `.btn`, `.btn-primary`, `.btn-ghost`, `.btn-danger`: 32px, 6px radius, 13px/600.
- `.icon-btn`: 32px square, 6px radius (44px on phones); `aria-pressed="true"` shows the accent tint.
- `.field`, `.field-label`, `.field-hint`: 32px controls, 3px accent focus ring.
- `.chip` (+ `-ok`, `-warn`, `-bad`, `-agent`, `-accent`): 20px, 4px radius, 11px/600 status labels.
- `.ops-table`: sticky uppercase head on `--ops-header`, 40px rows, `.num` right-aligned mono.
- `.page-head`, `.page-title`, `.page-meta`: title, scope and actions above a work area.
- `.stat-strip`, `.stat`: key–value strip with mono values; never a hero metric.
- `.config-section`, `.config-title`, `.config-desc`: two-column configuration rows (description left, controls right), single column on phones.
- `kbd`: inline shortcut hints.
- `.menu`, `.menu-item`: 8px radius popover, 32px items, soft offset shadow.

## Surfaces

- **Shell** (`MailShell`, `Header`): 48px top bar = rail toggle + product, scope switcher (mono address or "All mailboxes") › section breadcrumb, command search with `/` hint and filters, Agent toggle (violet when on), view options. Left rail 232px (56px collapsed) with sections Queues, Labels / Mailboxes, Identity, Automation, Workspace. Agent dock 400px on the right at ≥1024px.
- **Triage queue** (`ConversationList`, `EmailListRow`): toolbar band, column head (From/Recipients, Mailbox, Subject, Received/Sent), 36px grid rows, unread dot column, `Awaiting reply` warn chip from `needs_reply`, focus ring for j/k.
- **Reader** (`EmailPanel`, `ThreadMessage`): toolbar band, 18px/600 subject with folder chip, mailbox dot and message count; delivery state as semantic chips.
- **Agent console** (`AgentPanel`): header with Ready/Running state, scope and model; transcript of operator prompts, inbound-mail triggers, and expandable run-log steps (tool, args, input/output JSON); draft hand-off bar; prompt box with Run/Stop.
- **MCP endpoint** (`MCPPanel`): URL, Cloudflare Access service-token note, client snippets (Claude Code, JSON), tool catalog with Read / Draft / Modify / Send / Delete access chips and a warning for send and delete tools.
- **Burner registry** (`routes/burners.tsx`): stat strip, inline create bar with `@domain` suffix, filter + status segmented control, table with switch, status chip, counts, dates; stacked list on phones.
- **Routing & settings** (`routes/settings.tsx`): config sections for sender identity (with recipient preview), catch-all routing (route diagram + select), agent instructions (prompt with char count); sticky save bar with dirty state.
- **Preferences** (`routes/preferences.tsx`, at `/all/preferences` and `/mailbox/:id/preferences`, shortcut `,`): browser-local settings that apply at once: theme, accent and agent color, text size, density, motion, list, reading, sending, keyboard; export / import. Model and color math in `app/lib/preferences.ts`, store in `app/hooks/usePreferences.ts`.
- **Mailbox directory** (`routes/home.tsx`): stat strip, mailbox table (unread per queue, burners active/total, catch-all route), domain routing table.

## Motion

120–180ms, `cubic-bezier(0.16, 1, 0.3, 1)`. Motion only for state: row hover, run-step arrival, sheet and snackbar entry. Disabled under `prefers-reduced-motion`.
