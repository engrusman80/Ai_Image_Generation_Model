"use client";

// Main app screen: history sidebar on the left, the image conversation in the middle, prompt box below.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError, type AspectRatio, type GenerateResponse, type Generation, type Me, type PublicConfig } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import Composer, { type ComposerHandle } from "./Composer";
import { ImageCard, Lightbox, PendingCard } from "./ImageCard";
import { MenuIcon, SparklesIcon } from "./icons";
import Sidebar, { toHistoryItem, type HistoryItem } from "./Sidebar";

// A chat entry is a finished image, one still generating, or a failed attempt.
type Entry =
  | { kind: "done"; gen: Generation }
  | { kind: "pending"; id: string; prompt: string; aspect: AspectRatio; createdAt: string }
  | { kind: "error"; id: string; prompt: string; message: string };

const entryId = (e: Entry) => (e.kind === "done" ? e.gen.id : e.id);

const EXAMPLES = [
  "A cozy cabin in a snowy pine forest at blue hour, warm light glowing from the windows, cinematic",
  "Studio portrait of an elderly fisherman with a weathered face, dramatic rim lighting, 85mm photo",
  "A futuristic city street at night in the rain, neon reflections, flying cars, ultra detailed",
  "A bowl of ramen on a wooden table, steam rising, soft window light, food photography",
];

export default function Chat({ email }: { email: string | null }) {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState<AspectRatio>("1:1");
  const [enhance, setEnhance] = useState(false);
  const [seed, setSeed] = useState("");
  const [busy, setBusy] = useState(false);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Generation | null>(null);

  const composer = useRef<ComposerHandle>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const entryRefs = useRef(new Map<string, HTMLDivElement>());

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
      [...entries]
        .reverse()
        .flatMap((e): HistoryItem[] =>
          e.kind === "done"
            ? [toHistoryItem(e.gen)]
            : e.kind === "pending"
              ? [{ id: e.id, prompt: e.prompt, imageUrl: null, createdAt: e.createdAt, pending: true }]
              : [],
        ),
    [entries],
  );

  const maxChars = config?.max_prompt_chars ?? 1000;
  const limitReached = me ? me.used_today >= me.daily_limit : false;
  const canSend = !busy && prompt.trim().length > 0 && prompt.length <= maxChars && !limitReached;

  async function send() {
    if (!canSend) return;
    const text = prompt.trim();
    const id = crypto.randomUUID();
    setBusy(true);
    setEntries((list) => [...list, { kind: "pending", id, prompt: text, aspect, createdAt: new Date().toISOString() }]);
    setActiveId(id);
    setPrompt("");
    try {
      const res = await api<GenerateResponse>("/api/generate", {
        method: "POST",
        body: JSON.stringify({ prompt: text, aspect_ratio: aspect, enhance, seed: seed.trim() === "" ? null : Number(seed) }),
      });
      setEntries((list) => list.map((e) => (e.kind === "pending" && e.id === id ? { kind: "done", gen: res.generation } : e)));
      setActiveId(res.generation.id);
      setMe((m) => (m ? { ...m, used_today: res.used_today, daily_limit: res.daily_limit } : m));
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Something went wrong.";
      setEntries((list) => list.map((x) => (x.kind === "pending" && x.id === id ? { kind: "error", id, prompt: text, message } : x)));
      if (e instanceof ApiError && e.status === 401) await supabase.auth.signOut();
    } finally {
      setBusy(false);
    }
  }

  function selectFromHistory(id: string) {
    setActiveId(id);
    setSidebarOpen(false);
    entryRefs.current.get(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function newImage() {
    setPrompt("");
    setSeed("");
    setActiveId(null);
    setSidebarOpen(false);
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
    composer.current?.focus();
  }

  function remix(gen: Generation) {
    setPrompt(gen.prompt);
    setSeed(String(gen.seed));
    setAspect(gen.aspect_ratio);
    composer.current?.focus();
  }

  const modelName = config?.model.split("/").pop() ?? "";

  return (
    <div className="flex h-dvh overflow-hidden bg-[#0b0b10] text-zinc-100">
      <Sidebar
        items={history}
        activeId={activeId}
        me={me}
        email={email}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onSelect={selectFromHistory}
        onNew={newImage}
        onSignOut={() => supabase.auth.signOut()}
      />

      <div className="relative flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.06] px-4">
          <button onClick={() => setSidebarOpen(true)} className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/5 hover:text-white md:hidden" aria-label="Open history">
            <MenuIcon className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium text-zinc-200">{modelName || "…"}</span>
            {config?.worker_mode === "mock" && (
              <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-[11px] font-medium text-amber-300 ring-1 ring-amber-400/30">
                Test mode · placeholder images
              </span>
            )}
          </div>
        </header>

        {/* Conversation */}
        <div ref={scroller} className="flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 pb-48 pt-8">
            {loadError && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
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
                <p className="mt-2 max-w-md text-sm text-zinc-400">Describe a scene, a style and the lighting. The more detail, the better the image.</p>
                <div className="mt-8 grid w-full gap-2 sm:grid-cols-2">
                  {EXAMPLES.map((ex) => (
                    <button
                      key={ex}
                      onClick={() => {
                        setPrompt(ex);
                        composer.current?.focus();
                      }}
                      className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 text-left text-[13px] leading-snug text-zinc-300 transition hover:border-white/20 hover:bg-white/[0.05]"
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
                  <div className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-3xl rounded-br-lg bg-white/[0.07] px-4 py-2.5 text-[15px] leading-relaxed text-zinc-100">
                    {text}
                  </div>
                  {/* Reply */}
                  {entry.kind === "pending" && <PendingCard aspect={entry.aspect} />}
                  {entry.kind === "error" && (
                    <div className="max-w-xl rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{entry.message}</div>
                  )}
                  {entry.kind === "done" && <ImageCard gen={entry.gen} onOpen={() => setViewing(entry.gen)} onRemix={() => remix(entry.gen)} />}
                </div>
              );
            })}
          </div>
        </div>

        {/* Prompt box floats over the bottom of the conversation */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#0b0b10] via-[#0b0b10]/95 to-transparent px-4 pb-4 pt-10">
          <div className="pointer-events-auto mx-auto max-w-3xl">
            <Composer
              ref={composer}
              prompt={prompt}
              setPrompt={setPrompt}
              aspect={aspect}
              setAspect={setAspect}
              enhance={enhance}
              setEnhance={setEnhance}
              seed={seed}
              setSeed={setSeed}
              onSend={send}
              canSend={canSend}
              busy={busy}
              maxChars={maxChars}
              limitReached={limitReached}
            />
            <p className="mt-2 text-center text-[11px] text-zinc-500">
              {me ? `${Math.max(0, me.daily_limit - me.used_today)} of ${me.daily_limit} images left today · ` : ""}AI images can be imperfect.
            </p>
          </div>
        </div>
      </div>

      {viewing && <Lightbox gen={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
