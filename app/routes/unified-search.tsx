// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useEffect, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router";
import ConversationList from "~/components/ConversationList";
import { SearchEmpty } from "~/components/EmptyStates";
import MailboxSplitView from "~/components/MailboxSplitView";
import { useUIStore } from "~/hooks/useUIStore";
import { STARRED_QUERY } from "~/routes/search-results";

export function meta() {
	return [{ title: "Search all mailboxes · Agentic Inbox" }];
}

export default function UnifiedSearchRoute() {
	const [searchParams] = useSearchParams();
	const navigate = useNavigate();
	const query = searchParams.get("q") || "";
	const selectedEmailId = useUIStore((s) => s.selectedEmailId);
	const closePanel = useUIStore((s) => s.closePanel);
	const starred = query.trim() === STARRED_QUERY;

	const prev = useRef<string | undefined>(undefined);
	useEffect(() => {
		if (prev.current !== undefined && prev.current !== query) closePanel();
		prev.current = query;
	}, [query, closePanel]);

	const source = useMemo(() => ({ kind: "search" as const, query }), [query]);

	return (
		<MailboxSplitView selectedEmailId={selectedEmailId}>
			<ConversationList
				source={source}
				title={starred ? "Starred" : "Search results"}
				unified
				highlightQuery={starred ? undefined : query}
				onBack={starred ? undefined : () => navigate("/all/inbox")}
				empty={<SearchEmpty query={query} starred={starred} />}
			/>
		</MailboxSplitView>
	);
}
