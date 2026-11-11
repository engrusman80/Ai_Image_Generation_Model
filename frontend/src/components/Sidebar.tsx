"use client";

// ChatGPT-style left sidebar: new image button, history grouped by date, and the account panel.
import type { Generation, Me } from "@/lib/api";
import { CloseIcon, LogOutIcon, LogoMark, PlusIcon } from "./icons";

export type HistoryItem = { id: string; prompt: string; imageUrl: string | null; createdAt: string; pending?: boolean };

function groupLabel(iso: string): string {
  const day = 24 * 60 * 60 * 1000;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const t = new Date(iso).getTime();
  if (t >= start.getTime()) return "Today";
  if (t >= start.getTime() - day) return "Yesterday";
  if (t >= start.getTime() - 7 * day) return "Previous 7 days";
  if (t >= start.getTime() - 30 * day) return "Previous 30 days";
  return "Older";
}

export function toHistoryItem(gen: Generation): HistoryItem {
  return { id: gen.id, prompt: gen.prompt, imageUrl: gen.image_url, createdAt: gen.created_at };
}

interface Props {
  items: HistoryItem[]; // newest first
  activeId: string | null;
  me: Me | null;
  email: string | null;
  open: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onSignOut: () => void;
}

export default function Sidebar({ items, activeId, me, email, open, onClose, onSelect, onNew, onSignOut }: Props) {
  const groups: { label: string; items: HistoryItem[] }[] = [];
  for (const item of items) {
    const label = item.pending ? "Today" : groupLabel(item.createdAt);
    const last = groups.at(-1);
    if (last?.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  const used = me?.used_today ?? 0;
  const limit = me?.daily_limit ?? 0;

  return (
    <>
      {/* Dark backdrop on phones when the sidebar is open */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-30 bg-black/60 backdrop-blur-sm transition-opacity md:hidden ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-white/[0.06] bg-[#0f0f14] transition-transform duration-300 md:static md:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex items-center justify-between px-4 pt-4">
          <div className="flex items-center gap-2.5">
            <LogoMark />
            <span className="text-[15px] font-semibold tracking-tight">Image Studio</span>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/5 hover:text-white md:hidden" aria-label="Close sidebar">
            <CloseIcon />
          </button>
        </div>

        <div className="px-3 pt-4">
          <button
            onClick={onNew}
            className="flex w-full items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.07]"
          >
            <PlusIcon /> New image
          </button>
        </div>

        <nav className="mt-4 flex-1 overflow-y-auto px-3 pb-4 [scrollbar-width:thin]">
          {items.length === 0 && <p className="px-2 py-6 text-center text-xs text-zinc-500">Your images will appear here.</p>}
          {groups.map((group) => (
            <div key={group.label} className="mb-4">
              <p className="px-2 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">{group.label}</p>
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <button
                      onClick={() => onSelect(item.id)}
                      className={`group flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13px] transition ${
                        activeId === item.id ? "bg-white/10 text-white" : "text-zinc-300 hover:bg-white/[0.05] hover:text-white"
                      }`}
                    >
                      <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-md bg-white/5 ring-1 ring-white/10">
                        {item.pending ? (
                          <span className="absolute inset-0 animate-pulse bg-gradient-to-br from-violet-500/30 to-fuchsia-500/20" />
                        ) : item.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- signed, expiring storage links
                          <img src={item.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                        ) : null}
                      </span>
                      <span className="line-clamp-1 flex-1">{item.prompt}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-white/[0.06] p-3">
          {me && (
            <div className="mb-3 px-1">
              <div className="flex justify-between text-xs text-zinc-400">
                <span>Daily images</span>
                <span className="tabular-nums">
                  {used} / {limit}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all"
                  style={{ width: `${limit ? Math.min(100, (used / limit) * 100) : 0}%` }}
                />
              </div>
            </div>
          )}
          <div className="flex items-center gap-2.5 rounded-xl px-1 py-1">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-zinc-600 to-zinc-800 text-xs font-semibold uppercase">
              {(email ?? "?").slice(0, 1)}
            </div>
            <span className="min-w-0 flex-1 truncate text-[13px] text-zinc-300">{email}</span>
            <button onClick={onSignOut} className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/5 hover:text-white" title="Sign out" aria-label="Sign out">
              <LogOutIcon />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
