// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import DOMPurify from "dompurify";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePreferences } from "~/hooks/usePreferences";
import { splitQuotedText } from "~/lib/quote";

interface EmailIframeProps {
	body: string;
	/** When true, iframe auto-sizes to content height instead of filling parent */
	autoSize?: boolean;
	/** Hide quoted history behind a Gmail-style "•••" button (default true). */
	trimQuote?: boolean;
}

/**
 * Renders email HTML inside a sandboxed iframe.
 *
 * Security model:
 * - DOMPurify sanitises the HTML before injection.
 * - The iframe sandbox does NOT include `allow-same-origin`, so even if
 *   DOMPurify has a bypass the attacker's code runs in an opaque origin
 *   with no access to the parent page's cookies, DOM, or API.
 * - Because the iframe is cross-origin we cannot read `contentDocument`
 *   for auto-sizing. Instead, the injected HTML includes a tiny inline
 *   script that posts its body height to the parent via `postMessage`.
 *   The `allow-scripts` flag is required for this, but scripts inside
 *   the opaque-origin sandbox cannot access anything useful.
 * - A strict CSP meta tag blocks external resource loads inside the
 *   iframe as a defense-in-depth layer.
 */
export default function EmailIframe({ body: fullBody, autoSize, trimQuote = true }: EmailIframeProps) {
	const iframeRef = useRef<HTMLIFrameElement>(null);
	const [height, setHeight] = useState(autoSize ? 60 : 0);
	const [showQuote, setShowQuote] = useState(false);
	const split = useMemo(() => (trimQuote ? splitQuotedText(fullBody) : { body: fullBody, quote: "" }), [fullBody, trimQuote]);
	const body = showQuote || !split.quote ? fullBody : split.body;
	// Preferences → Remote images: Block stops tracking pixels until the reader asks.
	const blockPref = usePreferences((s) => s.remoteImages === "block");
	const [allowOnce, setAllowOnce] = useState(false);
	const blocked = blockPref && !allowOnce && hasRemoteImages(fullBody);

	// Listen for height reports from the sandboxed iframe
	const handleMessage = useCallback(
		(event: MessageEvent) => {
			if (!autoSize) return;
			// Only accept messages from our own iframe
			if (event.source !== iframeRef.current?.contentWindow) return;
			if (
				event.data &&
				typeof event.data === "object" &&
				event.data.__emailIframeHeight &&
				typeof event.data.height === "number" &&
				event.data.height > 0
			) {
				setHeight(event.data.height);
			}
		},
		[autoSize],
	);

	useEffect(() => {
		window.addEventListener("message", handleMessage);
		return () => window.removeEventListener("message", handleMessage);
	}, [handleMessage]);

	// Build the document up front and hand it to the iframe as `srcDoc`, keyed
	// by content, so each email gets a fresh frame that already has its content.
	// Assigning `srcdoc` after mount sometimes left the frame unpainted until
	// the next layout (blank email body).
	const srcDoc = useMemo(() => {
		if (!body || typeof window === "undefined") return "";

		const cleanBody = DOMPurify.sanitize(body, {
			USE_PROFILES: { html: true },
			FORBID_TAGS: ["style"],
			ADD_ATTR: ["target"],
			FORCE_BODY: true,
		});

		const padding = autoSize ? "0" : "24px";
		// Inline (cid:) images are served by this app, so they always load.
		const imgSrc = blocked ? `data: cid: ${window.location.origin}` : "data: cid: https: http:";

		// Fit + height script. Runs inside the opaque-origin sandbox so it has
		// zero access to the parent page — it can only postMessage.
		const frameScript = `<script>${buildFitScript(!!autoSize)}<\/script>`;

		// Use srcdoc so the iframe is truly sandboxed (no same-origin access).
		// We can't use doc.write() because that requires allow-same-origin.
		return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src ${imgSrc}; script-src 'unsafe-inline';">
<base target="_blank">
<style>
* { box-sizing: border-box; }
html {
	background: #ffffff;
	color-scheme: light;
}
body {
	font-family: Roboto, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
	font-size: 14px;
	line-height: 1.6;
	color: #1a1a1a;
	background: #ffffff;
	padding: ${padding};
	margin: 0;
	word-wrap: break-word;
	overflow-wrap: break-word;
	${autoSize ? "overflow-y: hidden; overflow-x: auto;" : ""}
}
[style*="position: fixed"], [style*="position:fixed"], [style*="position: absolute"], [style*="position:absolute"] {
	position: relative !important;
}
a { color: #0b57d0; }
@media (prefers-color-scheme: dark) { html, body { border-radius: 8px; } body { padding: 12px 16px !important; } }
img { max-width: 100%; height: auto; }
blockquote {
	border-left: 3px solid #d1d5db;
	padding-left: 1em;
	margin-left: 0;
	color: #6b7280;
}
pre {
	background: #f3f4f6;
	padding: 12px;
	border-radius: 6px;
	white-space: pre-wrap;
	font-size: 13px;
}
table { border-collapse: collapse; max-width: 100%; }
td, th { padding: 4px 8px; }
p { margin: 4px 0; }
h1, h2, h3 { margin: 8px 0 4px; }
ul, ol { padding-left: 20px; margin: 4px 0; }
</style>
</head>
<body><div id="${FIT_ID}">${cleanBody}</div>${frameScript}</body>
</html>`;
	}, [body, autoSize, blocked]);

	return (
		<>
			{blocked && (
				<div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-kumo-line bg-kumo-tint px-3 py-2 text-xs text-kumo-subtle">
					<span>Remote images are blocked. Senders can use them to see when you open a message.</span>
					<button type="button" className="btn btn-ghost !h-6 !px-2 !text-xs" onClick={() => setAllowOnce(true)}>
						Show images
					</button>
				</div>
			)}
			<iframe
				key={srcDoc}
				ref={iframeRef}
				srcDoc={srcDoc}
				className="block w-full border-0 rounded"
				style={autoSize ? { height: `${height}px` } : { height: "100%" }}
				sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
				title="Email content"
			/>
			{split.quote && (
				<button
					type="button"
					onClick={() => setShowQuote((v) => !v)}
					aria-label={showQuote ? "Hide trimmed content" : "Show trimmed content"}
					title={showQuote ? "Hide trimmed content" : "Show trimmed content"}
					className="mt-2 inline-flex items-center justify-center h-3.5 w-7 rounded-full bg-kumo-fill hover:bg-kumo-fill-hover border-0 cursor-pointer text-kumo-strong text-xs leading-none tracking-tighter"
				>
					•••
				</button>
			)}
		</>
	);
}

/** True when the HTML loads an image (or CSS background) from the network. */
export function hasRemoteImages(html: string): boolean {
	return /<img\b[^>]*\bsrc\s*=\s*["']?\s*(?:https?:)?\/\//i.test(html) ||
		/url\(\s*["']?\s*(?:https?:)?\/\//i.test(html) ||
		/\bbackground\s*=\s*["']?\s*(?:https?:)?\/\//i.test(html) ||
		/\bsrcset\s*=/i.test(html);
}

const FIT_ID = "__email_fit";

/**
 * Scale that makes content of `contentWidth` fit in `frameWidth`.
 * 1 when it already fits; otherwise the ratio, rounded down so that
 * rounding never brings the horizontal scroll bar back.
 */
export function fitScale(contentWidth: number, frameWidth: number): number {
	if (!(contentWidth > 0) || !(frameWidth > 0) || contentWidth <= frameWidth + 1) return 1;
	return Math.floor((frameWidth / contentWidth) * 1000) / 1000;
}

/**
 * Script injected into the email frame. It measures the natural width of the
 * email; if that is wider than the frame, it applies CSS `zoom` so the whole
 * message shows at the frame width. It runs again when images load and when
 * the frame width changes. With `reportHeight`, it also posts the (zoomed)
 * height to the parent so the frame can size itself.
 */
export function buildFitScript(reportHeight: boolean): string {
	return `(function () {
	var fitScale = ${fitScale.toString()};
	var lastW = -1, lastH = -1, busy = false;
	function el() { return document.getElementById(${JSON.stringify(FIT_ID)}); }
	function update() {
		var w = el();
		if (!w || busy) return;
		busy = true;
		var frameW = document.documentElement.clientWidth;
		w.style.zoom = "";
		var contentW = w.scrollWidth;
		var s = fitScale(contentW, frameW);
		if (s < 1) w.style.zoom = String(s);
		busy = false;
		${reportHeight ? `var h = Math.ceil(document.body.scrollHeight);
		if (h > 0 && (h !== lastH || frameW !== lastW)) {
			lastH = h; lastW = frameW;
			parent.postMessage({ __emailIframeHeight: true, height: h }, "*");
		}` : ""}
	}
	update();
	setTimeout(update, 50);
	setTimeout(update, 150);
	setTimeout(update, 400);
	window.addEventListener("load", update);
	window.addEventListener("resize", update);
	document.addEventListener("load", update, true);
	if (window.ResizeObserver) new ResizeObserver(update).observe(document.body);
})();`;
}
