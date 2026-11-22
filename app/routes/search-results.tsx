// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useEffect, useMemo, useRef } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import ConversationList from "~/components/ConversationList";
import { SearchEmpty } from "~/components/EmptyStates";
import MailboxSplitView from "~/components/MailboxSplitView";
import { useUIStore } from "~/hooks/useUIStore";

export const STARRED_QUERY = "is:starred";

export default function SearchResultsRoute() {
	const { mailboxId } = useParams<{ mailboxId: string }>();
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

	const source = useMemo(() => ({ kind: "search" as const, mailboxId, query }), [mailboxId, query]);

	return (
		<MailboxSplitView selectedEmailId={selectedEmailId}>
			<ConversationList
				source={source}
				title={starred ? "Starred" : "Search results"}
				highlightQuery={starred ? undefined : query}
				selfAddress={mailboxId}
				onBack={starred ? undefined : () => navigate(`/mailbox/${mailboxId}/emails/inbox`)}
				empty={<SearchEmpty query={query} starred={starred} />}
			/>
		</MailboxSplitView>
	);
}
