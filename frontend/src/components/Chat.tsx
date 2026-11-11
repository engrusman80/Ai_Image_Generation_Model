"use client";

// The chat page: history of prompts and images, a prompt box with options, loading and error states.
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, type AspectRatio, type GenerateResponse, type Generation, type Me, type PublicConfig } from "@/lib/api";
import { supabase } from "@/lib/supabase";

// A chat entry is either a finished image, one still generating, or a failed attempt.
type Entry =
  | { kind: "done"; gen: Generation }
  | { kind: "pending"; id: string; prompt: string; aspect: AspectRatio }
  | { kind: "error"; id: string; prompt: string; message: string };

const ASPECTS: AspectRatio[] = ["1:1", "4:3", "16:9", "9:16"];

export default function Chat({ email }: { email: string | null }) {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState<AspectRatio>("1:1");
  const [enhance, setEnhance] = useState(false);
  const [seed, setSeed] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const [cfg, meRes, history] = await Promise.all([
        api<PublicConfig>("/api/config"),
        api<Me>("/api/me"),
        api<Generation[]>("/api/history"),
      ]);
      setConfig(cfg);
      setMe(meRes);
      // The API returns newest first; a chat reads oldest first.
      setEntries(history.reverse().map((gen) => ({ kind: "done", gen })));
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load your history.");
    }
  }, []);

  useEffect(() => {
    // Loading data from the API when the page opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries.length]);

  const maxChars = config?.max_prompt_chars ?? 1000;
  const remaining = me ? me.daily_limit - me.used_today : null;
  const canSend = !busy && prompt.trim().length > 0 && prompt.length <= maxChars && remaining !== 0;

  async function send() {
    if (!canSend) return;
    const text = prompt.trim();
    const id = crypto.randomUUID();
    setBusy(true);
    setEntries((list) => [...list, { kind: "pending", id, prompt: text, aspect }]);
    setPrompt("");
    try {
      const res = await api<GenerateResponse>("/api/generate", {
        method: "POST",
        body: JSON.stringify({
          prompt: text,
          aspect_ratio: aspect,
          enhance,
          seed: seed.trim() === "" ? null : Number(seed),
        }),
      });
      setEntries((list) => list.map((e) => (e.kind === "pending" && e.id === id ? { kind: "done", gen: res.generation } : e)));
      setMe((m) => (m ? { ...m, used_today: res.used_today, daily_limit: res.daily_limit } : m));
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Something went wrong.";
      setEntries((list) => list.map((x) => (x.kind === "pending" && x.id === id ? { kind: "error", id, prompt: text, message } : x)));
      if (e instanceof ApiError && e.status === 401) await supabase.auth.signOut();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-dvh flex-col">
      {/* Header */}
      <header className="flex items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <div className="min-w-0">
          <h1 className="font-semibold">Image Chat</h1>
          <p className="truncate text-xs text-neutral-500">
            {config ? `${config.model.split("/").pop()}${config.worker_mode === "mock" ? " · MOCK MODE (placeholder images)" : ""}` : "…"}
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          {me && (
            <span className="rounded-full bg-neutral-100 px-3 py-1 dark:bg-neutral-800" title="Images left today (resets at 00:00 UTC)">
              {me.daily_limit - me.used_today}/{me.daily_limit} left today
            </span>
          )}
          <span className="hidden text-neutral-500 sm:inline">{email}</span>
          <button onClick={() => supabase.auth.signOut()} className="underline">
            Sign out
          </button>
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          {loadError && (
            <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
              {loadError}{" "}
              <button onClick={load} className="underline">
                Retry
              </button>
            </div>
          )}
          {entries.length === 0 && !loadError && (
            <p className="mt-20 text-center text-neutral-500">Describe an image below to get started.</p>
          )}
          {entries.map((entry) => (
            <ChatEntry key={entry.kind === "done" ? entry.gen.id : entry.id} entry={entry} />
          ))}
          <div ref={bottomRef} />
        </div>
      </main>

      {/* Prompt box */}
      <footer className="border-t border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-end gap-2">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={2}
              placeholder={remaining === 0 ? "Daily limit reached. Come back tomorrow." : "Describe the image you want… (Enter to send, Shift+Enter for a new line)"}
              disabled={remaining === 0}
              className="flex-1 resize-none rounded-xl border border-neutral-300 bg-transparent px-3 py-2 outline-none focus:border-neutral-500 dark:border-neutral-700"
            />
            <button
              onClick={send}
              disabled={!canSend}
              className="rounded-xl bg-neutral-900 px-5 py-3 font-medium text-white disabled:opacity-40 dark:bg-white dark:text-neutral-900"
            >
              {busy ? "…" : "Send"}
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-neutral-600 dark:text-neutral-400">
            <label className="flex items-center gap-1">
              Aspect
              <select
                value={aspect}
                onChange={(e) => setAspect(e.target.value as AspectRatio)}
                className="rounded border border-neutral-300 bg-transparent px-1 py-0.5 dark:border-neutral-700"
              >
                {ASPECTS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={enhance} onChange={(e) => setEnhance(e.target.checked)} />
              Enhance prompt
            </label>
            <label className="flex items-center gap-1">
              Seed
              <input
                inputMode="numeric"
                placeholder="random"
                value={seed}
                onChange={(e) => setSeed(e.target.value.replace(/\D/g, "").slice(0, 10))}
                className="w-28 rounded border border-neutral-300 bg-transparent px-1 py-0.5 dark:border-neutral-700"
              />
            </label>
            <span className={`ml-auto ${prompt.length > maxChars ? "text-red-600" : ""}`}>
              {prompt.length}/{maxChars}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function ChatEntry({ entry }: { entry: Entry }) {
  const prompt = entry.kind === "done" ? entry.gen.prompt : entry.prompt;
  return (
    <div className="flex flex-col gap-2">
      {/* The user's prompt */}
      <div className="self-end max-w-[85%] whitespace-pre-wrap rounded-2xl bg-neutral-900 px-4 py-2 text-white dark:bg-neutral-100 dark:text-neutral-900">
        {prompt}
      </div>

      {/* The reply: loading, error, or the image */}
      {entry.kind === "pending" && (
        <div className="self-start flex items-center gap-3 rounded-2xl bg-neutral-100 px-4 py-3 text-sm dark:bg-neutral-800">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-400 border-t-transparent" />
          Generating your image ({entry.aspect})…
        </div>
      )}
      {entry.kind === "error" && (
        <div className="self-start rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {entry.message}
        </div>
      )}
      {entry.kind === "done" && <ImageReply gen={entry.gen} />}
    </div>
  );
}

function ImageReply({ gen }: { gen: Generation }) {
  // Supabase adds a "download" header when the link has &download=<filename>.
  const filename = `image-${gen.seed}.jpg`;
  const downloadUrl = gen.image_url ? `${gen.image_url}${gen.image_url.includes("?") ? "&" : "?"}download=${filename}` : null;
  return (
    <div className="self-start w-full max-w-xl rounded-2xl bg-neutral-100 p-2 dark:bg-neutral-800">
      {gen.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed, expiring Supabase links
        <img
          src={gen.image_url}
          alt={gen.prompt}
          width={gen.width}
          height={gen.height}
          className="h-auto w-full rounded-xl"
        />
      ) : (
        <p className="p-4 text-sm text-neutral-500">Image unavailable.</p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 px-2 pt-2 text-xs text-neutral-500">
        <span>
          {gen.width}×{gen.height} · seed {gen.seed} · {new Date(gen.created_at).toLocaleString()}
        </span>
        {downloadUrl && (
          <a href={downloadUrl} className="rounded-lg bg-neutral-900 px-3 py-1 font-medium text-white dark:bg-white dark:text-neutral-900">
            Download
          </a>
        )}
      </div>
      {gen.prompt_used !== gen.prompt && (
        <details className="px-2 pt-1 text-xs text-neutral-500">
          <summary className="cursor-pointer">Enhanced prompt</summary>
          {gen.prompt_used}
        </details>
      )}
    </div>
  );
}
