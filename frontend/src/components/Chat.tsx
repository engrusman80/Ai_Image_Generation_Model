"use client";

// Main app screen: history sidebar, the image conversation, prompt box, settings and dialogs.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  ApiError,
  downloadImage,
  FORMATS,
  type AspectRatio,
  type DownloadFormat,
  type GenerateResponse,
  type Generation,
  type Me,
  type PublicConfig,
} from "@/lib/api";
import { getSettings, updateSettings, useSettings } from "@/lib/settings";
import { supabase } from "@/lib/supabase";
import Composer, { type ComposerHandle } from "./Composer";
import { ImageCard, Lightbox, PendingCard } from "./ImageCard";
import { EditIcon, MenuIcon, PanelIcon, SparklesIcon } from "./icons";
import SettingsModal from "./SettingsModal";
import Sidebar, { type HistoryItem, type SidebarHandle } from "./Sidebar";
import { ConfirmDialog, Toast } from "./ui";

// A chat entry is a finished image, one still generating, or a failed attempt.
type Entry =
  | { kind: "done"; gen: Generation }
  | { kind: "pending"; id: string; prompt: string; aspect: AspectRatio; createdAt: string }
  | { kind: "error"; id: string; prompt: string; message: string };

type Confirm = { kind: "one"; gen: Generation } | { kind: "all" } | null;
type SendOptions = { prompt: string; aspect: AspectRatio; seed: number | null; enhance: boolean };

const entryId = (e: Entry) => (e.kind === "done" ? e.gen.id : e.id);

const EXAMPLES = [
  "A cozy cabin in a snowy pine forest at blue hour, warm light glowing from the windows, cinematic",
  "Studio portrait of an elderly fisherman with a weathered face, dramatic rim lighting, 85mm photo",
  "A futuristic city street at night in the rain, neon reflections, flying cars, ultra detailed",
  "A bowl of ramen on a wooden table, steam rising, soft window light, food photography",
];

export default function Chat({ email }: { email: string | null }) {
  const settings = useSettings();
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Composer state (aspect and enhance start from the saved defaults).
  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState<AspectRatio>(() => getSettings().aspect);
  const [enhance, setEnhance] = useState(() => getSettings().enhance);
  const [seed, setSeed] = useState("");
  const [busy, setBusy] = useState(false);

  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Generation | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [toast, setToast] = useState<{ message: string; tone: "info" | "error" } | null>(null);

  const composer = useRef<ComposerHandle>(null);
  const sidebar = useRef<SidebarHandle>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const entryRefs = useRef(new Map<string, HTMLDivElement>());
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const notify = useCallback((message: string, tone: "info" | "error" = "info") => {
    setToast({ message, tone });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }, []);

  const load = useCallback(async () => {
    try {
      const [cfg, meRes, history] = await Promise.all([
        api<PublicConfig>("/api/config"),
        api<Me>("/api/me"),
        api<Generation[]>("/api/history"),
      ]);
      setConfig(cfg);
      setMe(meRes);
      // The API returns newest first; the conversation reads oldest first.
      setEntries(history.reverse().map((gen) => ({ kind: "done", gen })));
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load your history.");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    // Load data from the API when the page opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // Keep the newest message in view.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [entries.length]);

  const history: HistoryItem[] = useMemo(
    () =>
      [...entries].reverse().flatMap((e): HistoryItem[] =>
        e.kind === "done"
          ? [{ id: e.gen.id, prompt: e.gen.prompt, imageUrl: e.gen.image_url, createdAt: e.gen.created_at, gen: e.gen }]
          : e.kind === "pending"
            ? [{ id: e.id, prompt: e.prompt, imageUrl: null, createdAt: e.createdAt, pending: true }]
            : [],
      ),
    [entries],
  );
  const imageCount = history.filter((h) => h.gen).length;

  const maxChars = config?.max_prompt_chars ?? 1000;
  const limitReached = me ? me.used_today >= me.daily_limit : false;
  const canSend = !busy && prompt.trim().length > 0 && prompt.length <= maxChars && !limitReached;
  const formatLabel = FORMATS.find((f) => f.value === settings.format)?.label ?? "PNG";

  async function send(opts?: SendOptions) {
    const job: SendOptions = opts ?? { prompt: prompt.trim(), aspect, seed: seed.trim() === "" ? null : Number(seed), enhance };
    if (busy || !job.prompt || limitReached) return;
    if (!opts && !canSend) return;
    const id = crypto.randomUUID();
    setBusy(true);
    setEntries((list) => [...list, { kind: "pending", id, prompt: job.prompt, aspect: job.aspect, createdAt: new Date().toISOString() }]);
    setActiveId(id);
    if (!opts) setPrompt("");
    try {
      const res = await api<GenerateResponse>("/api/generate", {
        method: "POST",
        body: JSON.stringify({ prompt: job.prompt, aspect_ratio: job.aspect, enhance: job.enhance, seed: job.seed }),
      });
      setEntries((list) => list.map((e) => (e.kind === "pending" && e.id === id ? { kind: "done", gen: res.generation } : e)));
      setActiveId(res.generation.id);
      setMe((m) => (m ? { ...m, used_today: res.used_today, daily_limit: res.daily_limit } : m));
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Something went wrong.";
      setEntries((list) => list.map((x) => (x.kind === "pending" && x.id === id ? { kind: "error", id, prompt: job.prompt, message } : x)));
      if (e instanceof ApiError && e.status === 401) await supabase.auth.signOut();
    } finally {
      setBusy(false);
    }
  }

  const regenerate = (gen: Generation) =>
    send({ prompt: gen.prompt, aspect: gen.aspect_ratio, seed: null, enhance: gen.prompt_used !== gen.prompt });

  async function download(gen: Generation, format: DownloadFormat = settings.format) {
    try {
      notify(`Preparing ${format.toUpperCase()}…`);
      await downloadImage(gen, format);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Download failed.", "error");
    }
  }

  async function copyPrompt(gen: Generation) {
    await navigator.clipboard.writeText(gen.prompt);
    notify("Prompt copied");
  }

  function reuse(gen: Generation) {
    setPrompt(gen.prompt);
    setSeed(String(gen.seed));
    setAspect(gen.aspect_ratio);
    setMobileOpen(false);
    composer.current?.focus();
  }

  async function confirmDelete() {
    const target = confirm;
    setConfirm(null);
    if (!target) return;
    try {
      if (target.kind === "one") {
        await api(`/api/generations/${target.gen.id}`, { method: "DELETE" });
        setEntries((list) => list.filter((e) => !(e.kind === "done" && e.gen.id === target.gen.id)));
        if (viewing?.id === target.gen.id) setViewing(null);
        notify("Image deleted");
      } else {
        const res = await api<{ deleted: number }>("/api/generations", { method: "DELETE" });
        setEntries([]);
        setSettingsOpen(false);
        notify(`Deleted ${res.deleted} image${res.deleted === 1 ? "" : "s"}`);
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : "Delete failed.", "error");
    }
  }

  function exportHistory() {
    const rows = history
      .filter((h) => h.gen)
      .map(({ gen }) => {
        const { image_url, ...rest } = gen!; // links expire, so they are left out
        void image_url;
        return rest;
      });
    const url = URL.createObjectURL(new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `image-history-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    notify("History exported");
  }

  function selectFromHistory(id: string) {
    setActiveId(id);
    setMobileOpen(false);
    entryRefs.current.get(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const newImage = useCallback(() => {
    setPrompt("");
    setSeed("");
    setAspect(getSettings().aspect);
    setActiveId(null);
    setMobileOpen(false);
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
    composer.current?.focus();
  }, []);

  // Keyboard shortcuts (listed in Settings -> Shortcuts).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const ctrl = e.ctrlKey || e.metaKey;
      const typing = e.target instanceof HTMLElement && e.target.closest("input, textarea, select, [contenteditable]");
      if (ctrl && e.key.toLowerCase() === "k") {
        e.preventDefault();
        updateSettings({ sidebarCollapsed: false });
        setMobileOpen(true);
        setTimeout(() => sidebar.current?.focusSearch(), 50);
      } else if (ctrl && e.shiftKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        newImage();
      } else if (ctrl && e.shiftKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        updateSettings({ sidebarCollapsed: !getSettings().sidebarCollapsed });
      } else if (e.key === "/" && !typing) {
        e.preventDefault();
        composer.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [newImage]);

  const modelName = config?.model.split("/").pop() ?? "";
  const iconBtn = "rounded-lg p-1.5 text-muted transition hover:bg-hover hover:text-fg";

  return (
    <div className="flex h-dvh overflow-hidden bg-app text-fg">
      <Sidebar
        ref={sidebar}
        items={history}
        activeId={activeId}
        me={me}
        email={email}
        mobileOpen={mobileOpen}
        collapsed={settings.sidebarCollapsed}
        formatLabel={formatLabel}
        onCloseMobile={() => setMobileOpen(false)}
        onCollapse={() => updateSettings({ sidebarCollapsed: true })}
        onSelect={selectFromHistory}
        onNew={newImage}
        onDownload={(g) => download(g)}
        onCopy={copyPrompt}
        onReuse={reuse}
        onDelete={(gen) => setConfirm({ kind: "one", gen })}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <div className="relative flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="flex h-14 shrink-0 items-center gap-1 px-3">
          <button onClick={() => setMobileOpen(true)} className={`${iconBtn} md:hidden`} aria-label="Open history">
            <MenuIcon className="h-5 w-5" />
          </button>
          {settings.sidebarCollapsed && (
            <>
              <button onClick={() => updateSettings({ sidebarCollapsed: false })} className={`${iconBtn} hidden md:block`} aria-label="Open sidebar" title="Open sidebar">
                <PanelIcon className="h-5 w-5" />
              </button>
              <button onClick={newImage} className={`${iconBtn} hidden md:block`} aria-label="New image" title="New image">
                <EditIcon className="h-5 w-5" />
              </button>
            </>
          )}
          <div className="ml-1 flex items-center gap-2 text-sm">
            <span className="font-semibold">{modelName || "…"}</span>
            {config?.worker_mode === "mock" && (
              <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-medium text-amber-600 ring-1 ring-amber-400/40 dark:text-amber-300">
                Test mode · placeholder images
              </span>
            )}
          </div>
        </header>

        {/* Conversation */}
        <div ref={scroller} className="flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 pb-52 pt-4">
            {loadError && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-200">
                {loadError}{" "}
                <button onClick={load} className="font-medium underline">
                  Retry
                </button>
              </div>
            )}

            {loaded && entries.length === 0 && !loadError && (
              <div className="mt-[8vh] flex flex-col items-center text-center">
                <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-amber-400 shadow-xl shadow-fuchsia-500/20">
                  <SparklesIcon className="h-7 w-7 text-white" />
                </div>
                <h2 className="mt-5 text-2xl font-semibold tracking-tight sm:text-3xl">What will you create today?</h2>
                <p className="mt-2 max-w-md text-sm text-muted">Describe a scene, a style and the lighting. The more detail, the better the image.</p>
                <div className="mt-8 grid w-full gap-2 sm:grid-cols-2">
                  {EXAMPLES.map((ex) => (
                    <button
                      key={ex}
                      onClick={() => {
                        setPrompt(ex);
                        composer.current?.focus();
                      }}
                      className="rounded-xl border border-line p-3 text-left text-[13px] leading-snug text-fg-soft transition hover:bg-hover"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {entries.map((entry) => {
              const id = entryId(entry);
              const text = entry.kind === "done" ? entry.gen.prompt : entry.prompt;
              return (
                <div
                  key={id}
                  ref={(el) => {
                    if (el) entryRefs.current.set(id, el);
                    else entryRefs.current.delete(id);
                  }}
                  className="flex scroll-mt-24 flex-col gap-4"
                >
                  {/* User prompt */}
                  <div className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-3xl bg-bubble px-4 py-2.5 text-[15px] leading-relaxed">{text}</div>
                  {/* Reply */}
                  {entry.kind === "pending" && <PendingCard aspect={entry.aspect} />}
                  {entry.kind === "error" && (
                    <div className="max-w-xl rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-200">{entry.message}</div>
                  )}
                  {entry.kind === "done" && (
                    <ImageCard
                      gen={entry.gen}
                      format={settings.format}
                      onOpen={() => setViewing(entry.gen)}
                      onDownload={(f) => download(entry.gen, f)}
                      onRegenerate={() => regenerate(entry.gen)}
                      onReuse={() => reuse(entry.gen)}
                      onDelete={() => setConfirm({ kind: "one", gen: entry.gen })}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Prompt box floats over the bottom of the conversation */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-app via-app/95 to-transparent px-4 pb-4 pt-10">
          <div className="pointer-events-auto mx-auto max-w-3xl">
            <Composer
              ref={composer}
              prompt={prompt}
              setPrompt={setPrompt}
              aspect={aspect}
              setAspect={setAspect}
              format={settings.format}
              setFormat={(f) => updateSettings({ format: f })}
              enhance={enhance}
              setEnhance={setEnhance}
              seed={seed}
              setSeed={setSeed}
              onSend={() => send()}
              canSend={canSend}
              busy={busy}
              maxChars={maxChars}
              limitReached={limitReached}
            />
            <p className="mt-2 text-center text-[11px] text-faint">
              {me ? `${Math.max(0, me.daily_limit - me.used_today)} of ${me.daily_limit} images left today · ` : ""}AI images can be imperfect.
            </p>
          </div>
        </div>
      </div>

      {viewing && <Lightbox gen={viewing} onClose={() => setViewing(null)} onDownload={() => download(viewing)} />}
      {settingsOpen && (
        <SettingsModal
          me={me}
          email={email}
          config={config}
          imageCount={imageCount}
          onClose={() => setSettingsOpen(false)}
          onDeleteAll={() => setConfirm({ kind: "all" })}
          onExport={exportHistory}
          onSignOut={() => supabase.auth.signOut()}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title={confirm.kind === "one" ? "Delete image?" : "Delete all images?"}
          message={
            confirm.kind === "one"
              ? "This image and its prompt will be permanently deleted. This cannot be undone."
              : `All ${imageCount} of your images will be permanently deleted. This cannot be undone.`
          }
          confirmLabel={confirm.kind === "one" ? "Delete" : "Delete all"}
          onConfirm={confirmDelete}
          onCancel={() => setConfirm(null)}
        />
      )}
      {toast && <Toast message={toast.message} tone={toast.tone} />}
    </div>
  );
}
