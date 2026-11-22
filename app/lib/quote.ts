// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/**
 * Find the quoted history at the end of an HTML email ("On … wrote:" plus a
 * blockquote, Gmail/Apple/Outlook quote containers) so the reader can hide it
 * behind a "•••" toggle, like Gmail.
 *
 * Works on the raw HTML string with markers only (no DOM), so it runs the
 * same way in tests, on the server and in the browser. When it is not sure,
 * it returns no quote and the full body is shown.
 */
export interface SplitQuote {
	body: string;
	quote: string;
}

const CONTAINER_MARKERS = [
	/<div[^>]*class="[^"]*\bgmail_quote\b[^"]*"[^>]*>/i,
	/<blockquote[^>]*type="cite"[^>]*>/i,
	/<div[^>]*id="?appendonsend"?[^>]*>/i,
	/<div[^>]*id="?divRplyFwdMsg"?[^>]*>/i,
	/<div[^>]*class="[^"]*\byahoo_quoted\b[^"]*"[^>]*>/i,
];

// "On Tue, Apr 15, 2026, 3:42 PM, Jane <j@x.com> wrote:" (also the escaped &lt; form)
const ON_WROTE = /(?:<br\s*\/?>|<p[^>]*>|<div[^>]*>|^|\n)\s*On\s[^<]{6,200}?wrote:\s*(?:<br\s*\/?>|<\/p>|<\/div>|\s)*(?=<blockquote)/i;

export function splitQuotedText(html: string): SplitQuote {
	if (!html) return { body: html, quote: "" };

	let cut = -1;
	for (const re of CONTAINER_MARKERS) {
		const m = re.exec(html);
		if (m && (cut < 0 || m.index < cut)) cut = m.index;
	}

	const onWrote = ON_WROTE.exec(html);
	if (onWrote && (cut < 0 || onWrote.index < cut)) cut = onWrote.index;

	// Plain-text style quotes: a final block of lines that start with "&gt;".
	if (cut < 0) {
		const gt = /(?:^|<br\s*\/?>|\n)(?:\s*&gt;[^\n<]*(?:<br\s*\/?>|\n|$)){2,}\s*$/i.exec(html);
		if (gt) cut = gt.index;
	}

	if (cut <= 0) return { body: html, quote: "" };
	const body = html.slice(0, cut);
	// Do not hide everything: keep the quote visible when nothing precedes it.
	if (!body.replace(/<[^>]*>|&nbsp;|\s/g, "")) return { body: html, quote: "" };
	return { body, quote: html.slice(cut) };
}
