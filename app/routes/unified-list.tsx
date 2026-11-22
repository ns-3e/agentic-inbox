// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useEffect, useMemo, useRef } from "react";
import { Navigate, useParams } from "react-router";
import { Folders, getFolderDisplayName } from "shared/folders";
import ConversationList from "~/components/ConversationList";
import { FolderEmpty } from "~/components/EmptyStates";
import MailboxSplitView from "~/components/MailboxSplitView";
import { useUIStore } from "~/hooks/useUIStore";

const KNOWN_FOLDERS = new Set<string>([Folders.INBOX, Folders.OTHER, Folders.SENT, Folders.DRAFT, Folders.ARCHIVE, Folders.TRASH]);

export default function UnifiedListRoute() {
	const { folder: folderParam } = useParams<{ folder: string }>();
	const folder = folderParam || Folders.INBOX;
	const selectedEmailId = useUIStore((s) => s.selectedEmailId);
	const closePanel = useUIStore((s) => s.closePanel);

	const prev = useRef<string | undefined>(undefined);
	useEffect(() => {
		if (prev.current !== undefined && prev.current !== folder) closePanel();
		prev.current = folder;
	}, [folder, closePanel]);

	const source = useMemo(() => ({ kind: "folder" as const, folder }), [folder]);

	if (!KNOWN_FOLDERS.has(folder)) return <Navigate to="/all/inbox" replace />;
	const title = folder === Folders.INBOX ? "All inboxes" : `All ${getFolderDisplayName(folder).toLowerCase()}`;

	return (
		<MailboxSplitView selectedEmailId={selectedEmailId}>
			<ConversationList source={source} title={title} folder={folder} unified empty={<FolderEmpty folder={folder} unified />} />
		</MailboxSplitView>
	);
}
