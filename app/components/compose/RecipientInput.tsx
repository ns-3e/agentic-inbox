// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { XIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { suggestEmailFix } from "shared/email-typos";
import Avatar from "~/components/Avatar";
import { displayName, isValidEmail, parseAddress, splitAddresses } from "~/lib/address";
import api from "~/services/api";

function useDebounced<T>(value: T, ms: number) {
	const [v, setV] = useState(value);
	useEffect(() => {
		const t = setTimeout(() => setV(value), ms);
		return () => clearTimeout(t);
	}, [value, ms]);
	return v;
}

/**
 * Gmail recipient field: addresses become chips (Enter, comma, Tab, space
 * after an address, or leaving the field), Backspace removes the last chip,
 * pasted lists are split, and past correspondents are suggested.
 * Invalid addresses and likely typos (gmial.com) show in red.
 */
export default function RecipientInput({
	label,
	values,
	onChange,
	pending,
	onPendingChange,
	mailboxId,
	autoFocus,
	trailing,
	compact,
}: {
	label: string;
	values: string[];
	onChange: (values: string[]) => void;
	/** Text typed but not yet turned into a chip (sent with the message too). */
	pending: string;
	onPendingChange: (text: string) => void;
	/** Mailbox to search contacts in; undefined searches all mailboxes. */
	mailboxId?: string;
	autoFocus?: boolean;
	/** Right side of the row, e.g. the "Cc Bcc" links. */
	trailing?: React.ReactNode;
	compact?: boolean;
}) {
	const inputRef = useRef<HTMLInputElement>(null);
	const [focused, setFocused] = useState(false);
	const [active, setActive] = useState(0);
	const listId = useId();
	const q = useDebounced(pending.trim(), 120);

	const { data: contacts = [] } = useQuery({
		queryKey: ["contacts", mailboxId ?? "_all", q],
		queryFn: ({ signal }) => api.getContacts(mailboxId, q, { signal }),
		enabled: focused && q.length >= 1,
		staleTime: 60_000,
	});
	const chosen = new Set(values.map((v) => parseAddress(v).address.toLowerCase()));
	const suggestions = contacts.filter((c) => !chosen.has(c.address)).slice(0, 6);
	const showSuggestions = focused && q.length >= 1 && suggestions.length > 0;

	useEffect(() => setActive(0), [q]);

	const commit = (text = pending) => {
		const parts = splitAddresses(text);
		if (!parts.length) {
			if (text !== pending) return;
			onPendingChange("");
			return;
		}
		const next = [...values];
		for (const p of parts) if (!next.some((v) => v.toLowerCase() === p.toLowerCase())) next.push(p);
		onChange(next);
		onPendingChange("");
	};

	const pick = (address: string, name: string) => {
		const value = name ? `${name} <${address}>` : address;
		if (!values.includes(value)) onChange([...values, value]);
		onPendingChange("");
		inputRef.current?.focus();
	};

	const remove = (i: number) => onChange(values.filter((_, j) => j !== i));

	return (
		<div className="relative">
			<div
				className={`flex items-start gap-2 border-b border-kumo-line ${compact ? "min-h-9 py-1" : "min-h-12 md:min-h-10 py-1.5 md:py-1"}`}
				onClick={() => inputRef.current?.focus()}
			>
				<span className={`shrink-0 text-sm text-kumo-subtle ${compact ? "leading-7" : "leading-8"}`}>{label}</span>
				<div className="flex-1 min-w-0 flex flex-wrap items-center gap-1">
					{values.map((v, i) => {
						const { address } = parseAddress(v);
						const valid = isValidEmail(v);
						const fix = valid ? suggestEmailFix(address) : null;
						const bad = !valid || !!fix;
						return (
							<span
								key={`${v}-${i}`}
								title={!valid ? `"${v}" is not a valid email address` : fix ? `Did you mean ${fix}?` : address}
								className={`inline-flex items-center gap-1 max-w-full h-6 pl-0.5 pr-1 rounded text-[13px] border ${
									bad ? "border-[var(--ops-bad)] text-[var(--ops-bad)] bg-[var(--ops-bad-tint)]" : "border-[var(--chip-border)] bg-[var(--chip-bg)] text-kumo-default"
								}`}
							>
								<Avatar sender={v} size={22} />
								<button
									type="button"
									className="truncate bg-transparent border-0 p-0 text-inherit cursor-text text-sm"
									onClick={(e) => {
										// Click a chip to edit it.
										e.stopPropagation();
										remove(i);
										onPendingChange(fix ? fix : v);
										inputRef.current?.focus();
									}}
								>
									{displayName(v) !== address.split("@")[0] ? displayName(v) : address}
								</button>
								<button
									type="button"
									aria-label={`Remove ${address}`}
									onClick={(e) => {
										e.stopPropagation();
										remove(i);
									}}
									className="shrink-0 h-5 w-5 flex items-center justify-center rounded-full border-0 bg-transparent cursor-pointer text-inherit hover:bg-black/10"
								>
									<XIcon size={12} />
								</button>
							</span>
						);
					})}
					<input
						ref={inputRef}
						type="text"
						inputMode="email"
						autoCapitalize="off"
						autoCorrect="off"
						autoComplete="off"
						spellCheck={false}
						autoFocus={autoFocus}
						aria-label={label === "To" ? "To recipients" : `${label} recipients`}
						role="combobox"
						aria-expanded={showSuggestions}
						aria-controls={listId}
						aria-autocomplete="list"
						value={pending}
						onFocus={() => setFocused(true)}
						onBlur={() => {
							setFocused(false);
							commit();
						}}
						onChange={(e) => {
							const v = e.target.value;
							// Typing a separator right after an address makes a chip.
							if (/[,;]\s*$/.test(v) || (/\s$/.test(v) && isValidEmail(v.trim()))) commit(v);
							else onPendingChange(v);
						}}
						onPaste={(e) => {
							const text = e.clipboardData.getData("text");
							if (splitAddresses(text).length > 1) {
								e.preventDefault();
								commit(`${pending}${text}`);
							}
						}}
						onKeyDown={(e) => {
							if (showSuggestions && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
								e.preventDefault();
								setActive((a) => (a + (e.key === "ArrowDown" ? 1 : -1) + suggestions.length) % suggestions.length);
								return;
							}
							if ((e.key === "Enter" || e.key === "Tab") && showSuggestions && !(e.metaKey || e.ctrlKey)) {
								e.preventDefault();
								const s = suggestions[active];
								if (s) pick(s.address, s.name);
								return;
							}
							if (e.key === "Enter" && !(e.metaKey || e.ctrlKey) && pending.trim()) {
								e.preventDefault();
								commit();
								return;
							}
							if (e.key === "Tab" && pending.trim()) commit();
							if (e.key === "Backspace" && !pending && values.length) {
								e.preventDefault();
								const last = values[values.length - 1];
								remove(values.length - 1);
								onPendingChange(last);
							}
						}}
						className="flex-1 min-w-[8rem] h-8 bg-transparent border-0 outline-none text-sm text-kumo-default"
					/>
				</div>
				{trailing && <div className={`shrink-0 flex items-center gap-2 ${compact ? "h-7" : "h-8"}`}>{trailing}</div>}
			</div>

			{showSuggestions && (
				<div id={listId} role="listbox" className="menu absolute left-0 right-0 md:right-auto md:min-w-[22rem] top-full mt-0.5 py-1">
					{suggestions.map((c, i) => (
						<button
							key={c.address}
							type="button"
							role="option"
							aria-selected={i === active}
							onMouseDown={(e) => e.preventDefault()}
							onClick={() => pick(c.address, c.name)}
							onMouseEnter={() => setActive(i)}
							className={`w-full flex items-center gap-3 px-3 py-2 text-left border-0 cursor-pointer ${i === active ? "bg-kumo-overlay" : "bg-transparent"}`}
						>
							<Avatar sender={c.name ? `${c.name} <${c.address}>` : c.address} size={32} />
							<span className="min-w-0">
								<span className="block truncate text-sm text-kumo-default">{c.name || c.address}</span>
								{c.name && <span className="block truncate text-xs text-kumo-subtle">{c.address}</span>}
							</span>
						</button>
					))}
				</div>
			)}
		</div>
	);
}
