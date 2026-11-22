// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useEffect, useMemo, useRef } from "react";
import { useParams } from "react-router";
import { Folders, getFolderDisplayName } from "shared/folders";
import ConversationList from "~/components/ConversationList";
import { FolderEmpty } from "~/components/EmptyStates";
import MailboxSplitView from "~/components/MailboxSplitView";
import { useUIStore } from "~/hooks/useUIStore";
import { useFolders } from "~/queries/folders";

export default function EmailListRoute() {
	const { mailboxId, folder = Folders.INBOX } = useParams<{ mailboxId: string; folder: string }>();
	const selectedEmailId = useUIStore((s) => s.selectedEmailId);
	const closePanel = useUIStore((s) => s.closePanel);
	const { data: folders = [] } = useFolders(mailboxId);

	const folderName = useMemo(
		() => folders.find((f) => f.id === folder)?.name ?? getFolderDisplayName(folder),
		[folders, folder],
	);

	// Changing folder closes the open conversation (not on first load: a link may open one).
	const prev = useRef<string | undefined>(undefined);
	useEffect(() => {
		const key = `${mailboxId}/${folder}`;
		if (prev.current !== undefined && prev.current !== key) closePanel();
		prev.current = key;
	}, [mailboxId, folder, closePanel]);

	const source = useMemo(() => ({ kind: "folder" as const, mailboxId, folder }), [mailboxId, folder]);

	return (
		<MailboxSplitView selectedEmailId={selectedEmailId}>
			<ConversationList
				source={source}
				title={folderName}
				folder={folder}
				selfAddress={mailboxId}
				empty={<FolderEmpty folder={folder} />}
			/>
		</MailboxSplitView>
	);
}
