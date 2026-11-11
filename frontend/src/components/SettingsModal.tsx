"use client";

// Settings window, laid out like ChatGPT's: General, Data controls, Account, Shortcuts.
import { useState } from "react";
import { FORMATS, type Me, type PublicConfig } from "@/lib/api";
import { updateSettings, useSettings, type Theme } from "@/lib/settings";
import { ASPECTS } from "./Composer";
import { DatabaseIcon, GearIcon, KeyboardIcon, LogOutIcon, MonitorIcon, MoonIcon, SunIcon, UserIcon } from "./icons";
import { Modal } from "./ui";

type Tab = "general" | "data" | "account" | "shortcuts";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "general", label: "General", icon: <GearIcon /> },
  { id: "data", label: "Data controls", icon: <DatabaseIcon /> },
  { id: "account", label: "Account", icon: <UserIcon /> },
  { id: "shortcuts", label: "Shortcuts", icon: <KeyboardIcon /> },
];

const THEMES: { value: Theme; label: string; icon: React.ReactNode }[] = [
  { value: "system", label: "System", icon: <MonitorIcon /> },
  { value: "light", label: "Light", icon: <SunIcon /> },
  { value: "dark", label: "Dark", icon: <MoonIcon /> },
];

const SHORTCUTS: [string, string][] = [
  ["New image", "Ctrl + Shift + O"],
  ["Search images", "Ctrl + K"],
  ["Toggle sidebar", "Ctrl + Shift + S"],
  ["Focus the prompt box", "/"],
  ["Generate", "Enter"],
  ["New line in prompt", "Shift + Enter"],
  ["Close a window or menu", "Esc"],
];

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-b border-line py-4 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

const selectCls = "rounded-lg border border-line bg-elev px-2.5 py-1.5 text-sm text-fg outline-none focus:border-violet-400/60";

interface Props {
  me: Me | null;
  email: string | null;
  config: PublicConfig | null;
  imageCount: number;
  onClose: () => void;
  onDeleteAll: () => void;
  onExport: () => void;
  onSignOut: () => void;
}

export default function SettingsModal({ me, email, config, imageCount, onClose, onDeleteAll, onExport, onSignOut }: Props) {
  const [tab, setTab] = useState<Tab>("general");
  const s = useSettings();

  return (
    <Modal title="Settings" onClose={onClose} wide>
      <div className="flex min-h-[420px] flex-col sm:flex-row">
        <nav className="flex gap-1 overflow-x-auto border-b border-line p-2 sm:w-48 sm:flex-col sm:border-b-0 sm:border-r">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition ${
                tab === t.id ? "bg-active font-medium text-fg" : "text-muted hover:bg-hover hover:text-fg"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </nav>

        <div className="flex-1 overflow-y-auto px-5 py-1">
          {tab === "general" && (
            <>
              <Row label="Theme" hint="System follows your device's light/dark setting.">
                <div className="flex rounded-xl bg-hover p-0.5 ring-1 ring-line">
                  {THEMES.map((t) => (
                    <button
                      key={t.value}
                      onClick={() => updateSettings({ theme: t.value })}
                      aria-pressed={s.theme === t.value}
                      className={`flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-xs font-medium transition ${
                        s.theme === t.value ? "bg-elev text-fg shadow-sm ring-1 ring-line" : "text-muted hover:text-fg"
                      }`}
                    >
                      {t.icon}
                      {t.label}
                    </button>
                  ))}
                </div>
              </Row>
              <Row label="Default download format" hint="Used by the Download button. You can still pick another format each time.">
                <select value={s.format} onChange={(e) => updateSettings({ format: e.target.value as typeof s.format })} className={selectCls}>
                  {FORMATS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}: {f.hint}
                    </option>
                  ))}
                </select>
              </Row>
              <Row label="Default aspect ratio" hint="Shape selected when you start a new image.">
                <select value={s.aspect} onChange={(e) => updateSettings({ aspect: e.target.value as typeof s.aspect })} className={selectCls}>
                  {ASPECTS.map((a) => (
                    <option key={a.value} value={a.value}>
                      {a.label} ({a.value})
                    </option>
                  ))}
                </select>
              </Row>
              <Row label="Enhance prompts by default" hint="Adds detail and quality words to short prompts.">
                <button
                  role="switch"
                  aria-checked={s.enhance}
                  onClick={() => updateSettings({ enhance: !s.enhance })}
                  className={`relative h-6 w-11 rounded-full transition ${s.enhance ? "bg-violet-500" : "bg-active ring-1 ring-line-strong"}`}
                >
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${s.enhance ? "left-[22px]" : "left-0.5"}`} />
                </button>
              </Row>
              {config && (
                <Row label="Model" hint={`${config.model_license} license`}>
                  <span className="text-sm text-muted">{config.model.split("/").pop()}</span>
                </Row>
              )}
            </>
          )}

          {tab === "data" && (
            <>
              <Row label="Export prompt history" hint="Download your prompts, seeds and settings as a JSON file.">
                <button onClick={onExport} className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium transition hover:bg-hover">
                  Export
                </button>
              </Row>
              <Row label="Delete all images" hint={`Permanently deletes your ${imageCount} saved image${imageCount === 1 ? "" : "s"}. This cannot be undone.`}>
                <button
                  onClick={onDeleteAll}
                  disabled={imageCount === 0}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-red-500 disabled:opacity-40"
                >
                  Delete all
                </button>
              </Row>
              <p className="py-4 text-xs leading-relaxed text-muted">
                Your images are private: they are stored in a private bucket and shown through links that expire after one
                hour. Settings on this page are saved in this browser only.
              </p>
            </>
          )}

          {tab === "account" && (
            <>
              <Row label="Email">
                <span className="text-sm text-muted">{email}</span>
              </Row>
              <Row label="Plan" hint="Daily allowance resets at 00:00 UTC.">
                <span className="text-sm text-muted">Free · {me ? `${me.used_today} of ${me.daily_limit} images used today` : "…"}</span>
              </Row>
              <Row label="Sign out" hint="Sign out on this device.">
                <button onClick={onSignOut} className="flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-sm font-medium transition hover:bg-hover">
                  <LogOutIcon /> Sign out
                </button>
              </Row>
            </>
          )}

          {tab === "shortcuts" && (
            <ul className="py-2">
              {SHORTCUTS.map(([what, keys]) => (
                <li key={what} className="flex items-center justify-between border-b border-line py-3 text-sm last:border-0">
                  <span>{what}</span>
                  <span className="flex gap-1">
                    {keys.split(" + ").map((k) => (
                      <kbd key={k} className="rounded-md border border-line bg-hover px-2 py-0.5 font-mono text-xs text-fg-soft">
                        {k}
                      </kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}
