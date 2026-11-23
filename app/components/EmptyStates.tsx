// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { ArchiveIcon, EnvelopeSimpleIcon, FileIcon, FunnelSimpleIcon, MagnifyingGlassIcon, PaperPlaneTiltIcon, StarIcon, TrashIcon, TrayIcon } from "@phosphor-icons/react";
import { Folders } from "shared/folders";

const FOLDER_EMPTY: Record<string, { icon: React.ReactNode; title: string; description: string }> = {
	[Folders.INBOX]: {
		icon: <TrayIcon size={28} />,
		title: "Inbox is clear",
		description: "Mail to this mailbox and its burner addresses lands here. Catch-all mail goes to Other addresses.",
	},
	[Folders.OTHER]: {
		icon: <FunnelSimpleIcon size={28} />,
		title: "No catch-all mail",
		description: "Mail sent to an unknown address on your domain collects here, never in the Inbox. Set the route in Routing & settings.",
	},
	[Folders.SENT]: {
		icon: <PaperPlaneTiltIcon size={28} />,
		title: "No sent messages",
		description: "Sent mail shows here with its delivery status: delivered, deferred or bounced.",
	},
	[Folders.DRAFT]: {
		icon: <FileIcon size={28} />,
		title: "No drafts",
		description: "Drafts you save, and replies the agent drafts for your review, wait here until you send them.",
	},
	[Folders.ARCHIVE]: {
		icon: <ArchiveIcon size={28} />,
		title: "No archived conversations",
		description: "Archive keeps mail out of your inbox without deleting it.",
	},
	[Folders.TRASH]: {
		icon: <TrashIcon size={28} />,
		title: "No conversations in Trash",
		description: "Deleted messages stay here until you delete them forever.",
	},
};

function Empty({ icon, title, description }: { icon: React.ReactNode; title: string; description?: string }) {
	return (
		<div className="flex flex-col items-center justify-center py-20 px-6 text-center">
			<div className="mb-3 h-11 w-11 rounded-lg border border-kumo-line bg-kumo-tint flex items-center justify-center text-kumo-subtle">{icon}</div>
			<h3 className="text-sm font-semibold text-kumo-default mb-1">{title}</h3>
			{description && <p className="text-[13px] leading-relaxed text-kumo-subtle max-w-sm">{description}</p>}
			<p className="hidden md:block mt-4 text-xs text-kumo-subtle">
				Press <kbd>c</kbd> to write a message, <kbd>/</kbd> to search, <kbd>?</kbd> for shortcuts.
			</p>
		</div>
	);
}

export function FolderEmpty({ folder, unified }: { folder?: string; unified?: boolean }) {
	const c = (folder && FOLDER_EMPTY[folder]) || {
		icon: <EnvelopeSimpleIcon size={28} />,
		title: "No conversations",
		description: "This folder is empty.",
	};
	return <Empty {...c} description={unified ? `${c.description} (all mailboxes)` : c.description} />;
}

export function SearchEmpty({ query, starred }: { query: string; starred?: boolean }) {
	if (starred)
		return (
			<Empty
				icon={<StarIcon size={28} />}
				title="No starred messages"
				description="Stars let you give messages a special status to make them easier to find."
			/>
		);
	return (
		<Empty
			icon={<MagnifyingGlassIcon size={28} />}
			title={query ? "No messages matched your search" : "Search your mail"}
			description={
				query
					? "Try different words, or use operators like from:, to:, subject:, is:unread, has:attachment, before:, after:."
					: "Search by sender, subject or words in the message."
			}
		/>
	);
}
