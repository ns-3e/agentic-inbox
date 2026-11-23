// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Dialog } from "@cloudflare/kumo";

const GROUPS: [string, [string, string][]][] = [
	["Jumping", [["g then i", "Go to Inbox"], ["g then s", "Go to Starred"], ["g then t", "Go to Sent"], ["g then d", "Go to Drafts"], ["g then a", "Go to All mailboxes"]]],
	["Navigation", [["j / k", "Older / newer conversation"], ["o or Enter", "Open conversation"], ["u or Esc", "Back to list"], ["/", "Search mail"], [",", "Open preferences"]]],
	["Actions", [["c", "New message"], ["r", "Reply"], ["a", "Reply all"], ["f", "Forward"], ["e", "Archive"], ["#", "Delete"], ["s", "Star / unstar"], ["x", "Select conversation"], ["Shift + i", "Mark as read"], ["Shift + u", "Mark as unread"]]],
	["Composer", [["⌘/Ctrl + Enter", "Send"], ["⌘/Ctrl + Shift + c", "Add Cc/Bcc"], ["Esc", "Close full screen"]]],
];

export default function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
	return (
		<Dialog.Root open={open} onOpenChange={onOpenChange}>
			<Dialog size="lg" className="p-6 max-h-[85vh] overflow-y-auto">
				<Dialog.Title className="text-base font-semibold mb-4">Keyboard shortcuts</Dialog.Title>
				<div className="grid md:grid-cols-2 gap-x-10 gap-y-6">
					{GROUPS.map(([title, rows]) => (
						<div key={title}>
							<h3 className="text-[0.6875rem] font-semibold uppercase tracking-[0.04em] text-kumo-subtle mb-2">{title}</h3>
							<table className="w-full text-[0.8125rem]">
								<tbody>
									{rows.map(([key, what]) => (
										<tr key={key}>
											<td className="py-1 pr-4 whitespace-nowrap">
												<kbd className="!h-5 !px-1.5 !text-kumo-default">{key}</kbd>
											</td>
											<td className="py-1 text-kumo-strong">{what}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					))}
				</div>
			</Dialog>
		</Dialog.Root>
	);
}
