// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { DownloadSimpleIcon, FileIcon, FilePdfIcon, FileZipIcon, ImageIcon } from "@phosphor-icons/react";
import { downloadFile, formatBytes, getAttachmentUrl, getNonInlineAttachments } from "~/lib/utils";
import type { Attachment } from "~/types";

interface EmailAttachmentListProps {
	mailboxId?: string;
	emailId: string;
	attachments?: Attachment[];
	onPreviewImage?: (url: string, filename: string) => void;
	className?: string;
	showHeading?: boolean;
}

function fileIcon(mime: string, size = 28) {
	if (mime.startsWith("image/")) return <ImageIcon size={size} className="text-[#d93025]" />;
	if (mime === "application/pdf") return <FilePdfIcon size={size} className="text-[#d93025]" />;
	if (/zip|compressed|tar|gzip/.test(mime)) return <FileZipIcon size={size} className="text-kumo-strong" />;
	return <FileIcon size={size} className="text-[#1a73e8]" />;
}

/** Gmail-style attachment cards: thumbnail (images) or file icon, name and size. */
export default function EmailAttachmentList({
	mailboxId,
	emailId,
	attachments,
	onPreviewImage,
	className,
	showHeading = true,
}: EmailAttachmentListProps) {
	if (!mailboxId) return null;
	const files = getNonInlineAttachments(attachments);
	if (files.length === 0) return null;

	return (
		<div className={className}>
			{showHeading && (
				<div className="text-sm font-medium text-kumo-default mb-3 pt-3 border-t border-kumo-line">
					{files.length === 1 ? "One attachment" : `${files.length} attachments`}
				</div>
			)}
			<div className="flex flex-wrap gap-3">
				{files.map((a) => {
					const url = getAttachmentUrl(mailboxId, emailId, a.id);
					const isImage = a.mimetype?.startsWith("image/");
					const open = () => (isImage && onPreviewImage ? onPreviewImage(url, a.filename) : window.open(url, "_blank", "noopener"));
					return (
						<div
							key={a.id}
							className="group relative w-[calc(50%-0.375rem)] sm:w-44 rounded-lg border border-kumo-line overflow-hidden bg-kumo-base hover:shadow-md transition-shadow"
						>
							<button type="button" onClick={open} className="block w-full p-0 border-0 bg-transparent cursor-pointer text-left" title={a.filename}>
								<div className="h-24 flex items-center justify-center bg-kumo-tint overflow-hidden">
									{isImage ? (
										<img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
									) : (
										fileIcon(a.mimetype || "", 36)
									)}
								</div>
								<div className="flex items-center gap-2 px-2.5 py-2">
									<span className="shrink-0">{fileIcon(a.mimetype || "", 16)}</span>
									<div className="min-w-0">
										<div className="truncate text-xs font-medium text-kumo-default">{a.filename}</div>
										<div className="text-[11px] text-kumo-subtle">{formatBytes(a.size)}</div>
									</div>
								</div>
							</button>
							<button
								type="button"
								aria-label={`Download ${a.filename}`}
								title="Download"
								onClick={() => downloadFile(url, a.filename)}
								className="absolute top-1.5 right-1.5 h-8 w-8 rounded-full flex items-center justify-center border-0 cursor-pointer bg-black/55 text-white md:opacity-0 md:group-hover:opacity-100 transition-opacity"
							>
								<DownloadSimpleIcon size={16} />
							</button>
						</div>
					);
				})}
			</div>
		</div>
	);
}
