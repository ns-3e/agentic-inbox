// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { ArrowLeftIcon, StackIcon, TrayArrowDownIcon } from "@phosphor-icons/react";
import { Link, useLocation } from "react-router";

export function meta() {
	return [{ title: "Page not found · Agentic Inbox" }];
}

/**
 * Unknown URL. Same top bar as the mailbox directory (hairlines, no floating
 * card). It names the path so the operator can see what was wrong, and links
 * to the two real start points.
 */
export default function NotFoundRoute() {
	const { pathname } = useLocation();

	return (
		<div className="page-scroll bg-kumo-base pt-[env(safe-area-inset-top)]">
			<div className="flex items-center h-12 px-4 border-b border-kumo-line bg-kumo-base">
				<Link to="/" className="flex items-center gap-2.5 no-underline">
					<span className="h-6 w-6 rounded-[5px] bg-kumo-brand text-kumo-inverse flex items-center justify-center shrink-0">
						<TrayArrowDownIcon size={15} weight="bold" />
					</span>
					<span className="text-[0.8125rem] font-semibold text-kumo-default">Agentic Inbox</span>
				</Link>
			</div>
			<main className="px-5 py-10 md:px-10 max-w-xl">
				<p className="ops-mono tabular text-xs text-kumo-subtle">404</p>
				<h1 className="mt-1 text-lg font-semibold text-kumo-default">Page not found</h1>
				<p className="mt-2 text-sm text-kumo-strong">
					Nothing lives at <span className="ops-mono break-all text-kumo-default">{pathname}</span>. The link may be old, or the mailbox may have been removed.
				</p>
				<div className="mt-6 flex flex-wrap gap-2">
					<Link to="/" className="btn btn-primary no-underline">
						<ArrowLeftIcon size={14} />
						Mailbox directory
					</Link>
					<Link to="/all/inbox" className="btn no-underline">
						<StackIcon size={14} />
						All mailboxes
					</Link>
				</div>
			</main>
		</div>
	);
}
