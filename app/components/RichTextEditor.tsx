// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import {
	ArrowClockwiseIcon,
	ArrowCounterClockwiseIcon,
	LinkSimpleIcon,
	ListBulletsIcon,
	ListNumbersIcon,
	QuotesIcon,
	TextBIcon,
	TextItalicIcon,
	TextStrikethroughIcon,
	TextUnderlineIcon,
	TextAlignLeftIcon,
	TextAlignCenterIcon,
	TextAlignRightIcon,
	TextTSlashIcon,
} from "@phosphor-icons/react";
import { Color } from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import TiptapImage from "@tiptap/extension-image";
import LinkExtension from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import Underline from "@tiptap/extension-underline";
import { type Editor, EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef, useState } from "react";

/**
 * TipTap editor for the composer. Returns the editor; render it with
 * <ComposeEditorContent> and add <FormattingToolbar> where it fits (Gmail
 * shows it above the Send bar when "Aa" is on).
 */
export function useComposeEditor({
	initialHtml,
	onChange,
	onPasteFiles,
	autofocus,
	placeholder,
}: {
	initialHtml: string;
	onChange: (html: string) => void;
	onPasteFiles?: (files: File[]) => void;
	autofocus?: boolean;
	placeholder?: string;
}) {
	const onChangeRef = useRef(onChange);
	onChangeRef.current = onChange;
	const onPasteRef = useRef(onPasteFiles);
	onPasteRef.current = onPasteFiles;

	return useEditor({
		immediatelyRender: false,
		extensions: [
			StarterKit,
			Underline,
			TextAlign.configure({ types: ["heading", "paragraph"] }),
			LinkExtension.configure({ openOnClick: false, autolink: true, HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" } }),
			TiptapImage,
			TextStyle,
			Color,
			Highlight.configure({ multicolor: true }),
		],
		content: initialHtml,
		autofocus: autofocus ? "start" : false,
		editorProps: {
			attributes: {
				class:
					"text-kumo-default [&_a]:text-kumo-link [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-kumo-line [&_blockquote]:pl-3 [&_blockquote]:text-kumo-subtle",
				"aria-label": placeholder ?? "Message body",
				role: "textbox",
				"aria-multiline": "true",
			},
			handlePaste: (_view, event) => {
				const files = [...(event.clipboardData?.files ?? [])];
				if (files.length && onPasteRef.current) {
					onPasteRef.current(files);
					return true;
				}
				return false;
			},
			handleDrop: (_view, event) => {
				const files = [...((event as DragEvent).dataTransfer?.files ?? [])];
				if (files.length && onPasteRef.current) {
					event.preventDefault();
					onPasteRef.current(files);
					return true;
				}
				return false;
			},
		},
		onUpdate: ({ editor }) => onChangeRef.current(editor.getHTML()),
	});
}

export function ComposeEditorContent({ editor, className = "" }: { editor: Editor | null; className?: string }) {
	return (
		<div className={`compose-editor ${className}`}>
			<EditorContent editor={editor} />
		</div>
	);
}

function ToolButton({ label, active, disabled, onClick, children }: { label: string; active?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
	return (
		<button
			type="button"
			title={label}
			aria-label={label}
			aria-pressed={active}
			disabled={disabled}
			onMouseDown={(e) => e.preventDefault()}
			onClick={onClick}
			className={`h-8 w-8 flex items-center justify-center rounded border-0 cursor-pointer text-kumo-strong disabled:opacity-40 ${
				active ? "bg-kumo-fill text-kumo-default" : "bg-transparent hover:bg-kumo-fill"
			}`}
		>
			{children}
		</button>
	);
}

/** Small popover to add or change a link (replaces window.prompt). */
export function LinkPopover({ editor, onClose }: { editor: Editor; onClose: () => void }) {
	const [url, setUrl] = useState<string>(editor.getAttributes("link").href ?? "");
	const inputRef = useRef<HTMLInputElement>(null);
	useEffect(() => inputRef.current?.focus(), []);
	const apply = () => {
		const href = url.trim();
		const chain = editor.chain().focus().extendMarkRange("link");
		if (!href) chain.unsetLink().run();
		else chain.setLink({ href: /^[a-z]+:/i.test(href) ? href : `https://${href}` }).run();
		onClose();
	};
	return (
		<div className="menu absolute bottom-full mb-2 left-0 p-2 flex items-center gap-2 w-[min(22rem,calc(100vw-2rem))]">
			<input
				ref={inputRef}
				type="url"
				value={url}
				onChange={(e) => setUrl(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter") {
						e.preventDefault();
						apply();
					}
					if (e.key === "Escape") {
						e.stopPropagation();
						onClose();
					}
				}}
				placeholder="Paste or type a link"
				className="flex-1 min-w-0 h-9 px-2 rounded border border-kumo-line bg-kumo-base text-sm text-kumo-default outline-none focus:border-kumo-brand"
			/>
			<button type="button" onClick={apply} className="h-9 px-3 rounded bg-kumo-brand text-kumo-inverse text-sm font-medium border-0 cursor-pointer">
				Apply
			</button>
		</div>
	);
}

/** Gmail's formatting options bar. */
export function FormattingToolbar({ editor }: { editor: Editor }) {
	const s = useEditorState({
		editor,
		selector: ({ editor: e }) => ({
			bold: e.isActive("bold"),
			italic: e.isActive("italic"),
			underline: e.isActive("underline"),
			strike: e.isActive("strike"),
			bullet: e.isActive("bulletList"),
			ordered: e.isActive("orderedList"),
			quote: e.isActive("blockquote"),
			left: e.isActive({ textAlign: "left" }),
			center: e.isActive({ textAlign: "center" }),
			right: e.isActive({ textAlign: "right" }),
			canUndo: e.can().undo(),
			canRedo: e.can().redo(),
		}),
	});
	const c = () => editor.chain().focus();
	return (
		<div className="flex flex-wrap items-center gap-0.5 rounded-lg shadow-[0_2px_8px_-2px_rgb(15_20_26/0.18)] border border-kumo-line bg-kumo-elevated px-1 py-0.5" role="toolbar" aria-label="Formatting options">
			<ToolButton label="Undo" disabled={!s.canUndo} onClick={() => c().undo().run()}>
				<ArrowCounterClockwiseIcon size={16} />
			</ToolButton>
			<ToolButton label="Redo" disabled={!s.canRedo} onClick={() => c().redo().run()}>
				<ArrowClockwiseIcon size={16} />
			</ToolButton>
			<div className="w-px h-5 bg-kumo-line mx-0.5" />
			<ToolButton label="Bold" active={s.bold} onClick={() => c().toggleBold().run()}>
				<TextBIcon size={16} weight="bold" />
			</ToolButton>
			<ToolButton label="Italic" active={s.italic} onClick={() => c().toggleItalic().run()}>
				<TextItalicIcon size={16} />
			</ToolButton>
			<ToolButton label="Underline" active={s.underline} onClick={() => c().toggleUnderline().run()}>
				<TextUnderlineIcon size={16} />
			</ToolButton>
			<ToolButton label="Strikethrough" active={s.strike} onClick={() => c().toggleStrike().run()}>
				<TextStrikethroughIcon size={16} />
			</ToolButton>
			<div className="w-px h-5 bg-kumo-line mx-0.5" />
			<ToolButton label="Align left" active={s.left} onClick={() => c().setTextAlign("left").run()}>
				<TextAlignLeftIcon size={16} />
			</ToolButton>
			<ToolButton label="Align center" active={s.center} onClick={() => c().setTextAlign("center").run()}>
				<TextAlignCenterIcon size={16} />
			</ToolButton>
			<ToolButton label="Align right" active={s.right} onClick={() => c().setTextAlign("right").run()}>
				<TextAlignRightIcon size={16} />
			</ToolButton>
			<ToolButton label="Numbered list" active={s.ordered} onClick={() => c().toggleOrderedList().run()}>
				<ListNumbersIcon size={16} />
			</ToolButton>
			<ToolButton label="Bulleted list" active={s.bullet} onClick={() => c().toggleBulletList().run()}>
				<ListBulletsIcon size={16} />
			</ToolButton>
			<ToolButton label="Quote" active={s.quote} onClick={() => c().toggleBlockquote().run()}>
				<QuotesIcon size={16} />
			</ToolButton>
			<ToolButton label="Remove formatting" onClick={() => c().unsetAllMarks().clearNodes().run()}>
				<TextTSlashIcon size={16} />
			</ToolButton>
		</div>
	);
}

export { LinkSimpleIcon };
