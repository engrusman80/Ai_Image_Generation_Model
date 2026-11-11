"use client";

// ChatGPT-style left sidebar: new image, search, history grouped by date (with a ⋯ menu per item),
// usage bar, settings and account.
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import type { Generation, Me } from "@/lib/api";
import {
  CopyIcon,
  DotsIcon,
  DownloadIcon,
  EditIcon,
  GearIcon,
  LogoMark,
  PanelIcon,
  PlusIcon,
  SearchIcon,
  CloseIcon,
  TrashIcon,
} from "./icons";
import { Menu } from "./ui";

export type HistoryItem = { id: string; prompt: string; imageUrl: string | null; createdAt: string; gen?: Generation; pending?: boolean };

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

interface Props {
  items: HistoryItem[]; // newest first
  activeId: string | null;
  me: Me | null;
  email: string | null;
  mobileOpen: boolean;
  collapsed: boolean;
  formatLabel: string;
  onCloseMobile: () => void;
  onCollapse: () => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDownload: (gen: Generation) => void;
  onCopy: (gen: Generation) => void;
  onReuse: (gen: Generation) => void;
  onDelete: (gen: Generation) => void;
  onOpenSettings: () => void;
}

export type SidebarHandle = { focusSearch: () => void };

const Sidebar = forwardRef<SidebarHandle, Props>(function Sidebar(p, ref) {
  const [query, setQuery] = useState("");
  const search = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => ({ focusSearch: () => search.current?.focus() }));

  const q = query.trim().toLowerCase();
  const visible = q ? p.items.filter((i) => i.prompt.toLowerCase().includes(q)) : p.items;
  const groups: { label: string; items: HistoryItem[] }[] = [];
  for (const item of visible) {
    const label = item.pending ? "Today" : groupLabel(item.createdAt);
    const last = groups.at(-1);
    if (last?.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  const used = p.me?.used_today ?? 0;
  const limit = p.me?.daily_limit ?? 0;
  const iconBtn = "rounded-lg p-1.5 text-muted transition hover:bg-hover hover:text-fg";

  return (
    <>
      {/* Dimmed backdrop on phones when the sidebar is open */}
      <div
        onClick={p.onCloseMobile}
        className={`fixed inset-0 z-30 bg-overlay backdrop-blur-sm transition-opacity md:hidden ${p.mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 shrink-0 flex-col border-r border-line bg-panel transition-transform duration-300 md:static md:z-auto ${
          p.mobileOpen ? "translate-x-0" : "-translate-x-full"
        } ${p.collapsed ? "md:hidden" : "md:translate-x-0"}`}
      >
        <div className="flex items-center justify-between px-3 pt-3">
          <div className="flex items-center gap-2.5 px-1">
            <LogoMark />
            <span className="text-[15px] font-semibold tracking-tight">Image Studio</span>
          </div>
          <button onClick={p.onCloseMobile} className={`${iconBtn} md:hidden`} aria-label="Close sidebar">
            <CloseIcon />
          </button>
          <button onClick={p.onCollapse} className={`${iconBtn} hidden md:block`} aria-label="Close sidebar" title="Close sidebar">
            <PanelIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-2 px-3 pt-4">
          <button
            onClick={p.onNew}
            className="flex w-full items-center gap-2 rounded-xl border border-line bg-elev px-3 py-2.5 text-sm font-medium shadow-sm transition hover:bg-hover"
          >
            <EditIcon /> New image
            <kbd className="ml-auto hidden text-[10px] font-normal text-faint lg:inline">Ctrl ⇧ O</kbd>
          </button>
          <label className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted ring-1 ring-line transition focus-within:ring-violet-400/50">
            <SearchIcon />
            <input
              ref={search}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setQuery("")}
              placeholder="Search images"
              className="min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:text-faint"
            />
            {query ? (
              <button onClick={() => setQuery("")} aria-label="Clear search" className="text-faint hover:text-fg">
                <CloseIcon className="h-3.5 w-3.5" />
              </button>
            ) : (
              <kbd className="hidden text-[10px] text-faint lg:inline">Ctrl K</kbd>
            )}
          </label>
        </div>

        <nav className="mt-3 flex-1 overflow-y-auto px-3 pb-4">
          {visible.length === 0 && (
            <p className="px-2 py-6 text-center text-xs text-faint">{q ? "No images match your search." : "Your images will appear here."}</p>
          )}
          {groups.map((group) => (
            <div key={group.label} className="mb-4">
              <p className="px-2 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-faint">{group.label}</p>
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.id} className="group relative">
                    <button
                      onClick={() => p.onSelect(item.id)}
                      className={`flex w-full items-center gap-2.5 rounded-lg py-1.5 pl-2 pr-9 text-left text-[13px] transition ${
                        p.activeId === item.id ? "bg-active text-fg" : "text-fg-soft hover:bg-hover hover:text-fg"
                      }`}
                    >
                      <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-md bg-hover ring-1 ring-line">
                        {item.pending ? (
                          <span className="absolute inset-0 animate-pulse bg-gradient-to-br from-violet-500/40 to-fuchsia-500/30" />
                        ) : item.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- signed, expiring storage links
                          <img src={item.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                        ) : null}
                      </span>
                      <span className="line-clamp-1 flex-1">{item.prompt}</span>
                    </button>
                    {item.gen && (
                      <div className="absolute right-1 top-1/2 -translate-y-1/2 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100">
                        <Menu
                          label="Image options"
                          triggerClassName="rounded-md p-1 text-muted hover:bg-active hover:text-fg"
                          trigger={<DotsIcon />}
                          items={[
                            { label: `Download ${p.formatLabel}`, icon: <DownloadIcon />, onClick: () => p.onDownload(item.gen!) },
                            { label: "Copy prompt", icon: <CopyIcon />, onClick: () => p.onCopy(item.gen!) },
                            { label: "Reuse prompt & seed", icon: <PlusIcon />, onClick: () => p.onReuse(item.gen!) },
                            "divider",
                            { label: "Delete", icon: <TrashIcon />, danger: true, onClick: () => p.onDelete(item.gen!) },
                          ]}
                        />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-line p-3">
          {p.me && (
            <div className="mb-2 px-1">
              <div className="flex justify-between text-xs text-muted">
                <span>Daily images</span>
                <span className="tabular-nums">
                  {used} / {limit}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-active">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all"
                  style={{ width: `${limit ? Math.min(100, (used / limit) * 100) : 0}%` }}
                />
              </div>
            </div>
          )}
          <button onClick={p.onOpenSettings} className="flex w-full items-center gap-2.5 rounded-xl px-1.5 py-1.5 text-left transition hover:bg-hover">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-xs font-semibold uppercase text-white">
              {(p.email ?? "?").slice(0, 1)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium">{p.email}</span>
              <span className="block text-[11px] text-faint">Free plan</span>
            </span>
            <GearIcon className="h-4 w-4 text-muted" />
          </button>
        </div>
      </aside>
    </>
  );
});

export default Sidebar;
