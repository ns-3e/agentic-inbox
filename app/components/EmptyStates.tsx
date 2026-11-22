// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { ArchiveIcon, EnvelopeSimpleIcon, FileIcon, MagnifyingGlassIcon, PaperPlaneTiltIcon, StarIcon, TrashIcon, TrayIcon } from "@phosphor-icons/react";
import { Folders } from "shared/folders";

const FOLDER_EMPTY: Record<string, { icon: React.ReactNode; title: string; description: string }> = {
	[Folders.INBOX]: {
		icon: <TrayIcon size={56} weight="thin" />,
		title: "Your inbox is empty",
		description: "New mail shows up here.",
	},
	[Folders.SENT]: {
		icon: <PaperPlaneTiltIcon size={56} weight="thin" />,
		title: "No sent messages",
		description: "Mail you send shows up here.",
	},
	[Folders.DRAFT]: {
		icon: <FileIcon size={56} weight="thin" />,
		title: "You don't have any saved drafts",
		description: "Saving a draft allows you to keep a message you aren't ready to send yet.",
	},
	[Folders.ARCHIVE]: {
		icon: <ArchiveIcon size={56} weight="thin" />,
		title: "No archived conversations",
		description: "Archive keeps mail out of your inbox without deleting it.",
	},
	[Folders.TRASH]: {
		icon: <TrashIcon size={56} weight="thin" />,
		title: "No conversations in Trash",
		description: "Deleted messages stay here until you delete them forever.",
	},
};

function Empty({ icon, title, description }: { icon: React.ReactNode; title: string; description?: string }) {
	return (
		<div className="flex flex-col items-center justify-center py-20 px-6 text-center">
			<div className="mb-4 text-kumo-subtle">{icon}</div>
			<h3 className="text-base font-medium text-kumo-default mb-1">{title}</h3>
			{description && <p className="text-sm text-kumo-subtle max-w-xs">{description}</p>}
		</div>
	);
}

export function FolderEmpty({ folder, unified }: { folder?: string; unified?: boolean }) {
	const c = (folder && FOLDER_EMPTY[folder]) || {
		icon: <EnvelopeSimpleIcon size={56} weight="thin" />,
		title: "No conversations",
		description: "This folder is empty.",
	};
	return <Empty {...c} description={unified ? `${c.description} (all mailboxes)` : c.description} />;
}

export function SearchEmpty({ query, starred }: { query: string; starred?: boolean }) {
	if (starred)
		return (
			<Empty
				icon={<StarIcon size={56} weight="thin" />}
				title="No starred messages"
				description="Stars let you give messages a special status to make them easier to find."
			/>
		);
	return (
		<Empty
			icon={<MagnifyingGlassIcon size={56} weight="thin" />}
			title={query ? "No messages matched your search" : "Search your mail"}
			description={
				query
					? "Try different words, or use operators like from:, to:, subject:, is:unread, has:attachment, before:, after:."
					: "Search by sender, subject or words in the message."
			}
		/>
	);
}
