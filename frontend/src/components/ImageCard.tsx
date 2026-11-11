"use client";

// A finished image with actions, the "generating" placeholder, and the full-screen viewer.
import { useEffect, useState } from "react";
import type { AspectRatio, Generation } from "@/lib/api";
import { CheckIcon, CloseIcon, CopyIcon, DownloadIcon, ExpandIcon, RefreshIcon } from "./icons";

const RATIO: Record<AspectRatio, string> = { "1:1": "1 / 1", "4:3": "4 / 3", "16:9": "16 / 9", "9:16": "9 / 16" };
// Portrait images are narrower so they don't fill the whole screen height.
const WIDTH: Record<AspectRatio, string> = { "1:1": "max-w-xl", "4:3": "max-w-2xl", "16:9": "max-w-3xl", "9:16": "max-w-sm" };

export function downloadUrl(gen: Generation): string | null {
  if (!gen.image_url) return null;
  // Supabase sends the file as a download when the link has &download=<filename>.
  return `${gen.image_url}${gen.image_url.includes("?") ? "&" : "?"}download=image-${gen.seed}.jpg`;
}

function ActionButton({ onClick, href, title, children }: { onClick?: () => void; href?: string; title: string; children: React.ReactNode }) {
  const cls = "grid h-9 w-9 place-items-center rounded-xl bg-black/50 text-white ring-1 ring-white/15 backdrop-blur-md transition hover:bg-black/70";
  return href ? (
    <a href={href} title={title} aria-label={title} className={cls}>
      {children}
    </a>
  ) : (
    <button onClick={onClick} title={title} aria-label={title} className={cls}>
      {children}
    </button>
  );
}

export function ImageCard({ gen, onOpen, onRemix }: { gen: Generation; onOpen: () => void; onRemix: () => void }) {
  const [copied, setCopied] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const dl = downloadUrl(gen);

  async function copyPrompt() {
    await navigator.clipboard.writeText(gen.prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className={`w-full ${WIDTH[gen.aspect_ratio]}`}>
      <div className="group relative overflow-hidden rounded-2xl bg-white/[0.03] ring-1 ring-white/10" style={{ aspectRatio: RATIO[gen.aspect_ratio] }}>
        {!loaded && <div className="absolute inset-0 animate-pulse bg-white/[0.04]" />}
        {gen.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed, expiring storage links
          <img
            src={gen.image_url}
            alt={gen.prompt}
            onLoad={() => setLoaded(true)}
            onClick={onOpen}
            className={`h-full w-full cursor-zoom-in object-cover transition duration-500 ${loaded ? "opacity-100" : "opacity-0"}`}
          />
        ) : (
          <div className="grid h-full place-items-center text-sm text-zinc-500">Image unavailable</div>
        )}
        {/* Actions appear on hover (always visible on touch screens) */}
        <div className="absolute right-3 top-3 flex gap-2 transition md:opacity-0 md:group-hover:opacity-100">
          <ActionButton onClick={copyPrompt} title="Copy prompt">{copied ? <CheckIcon /> : <CopyIcon />}</ActionButton>
          <ActionButton onClick={onRemix} title="Reuse prompt and seed"><RefreshIcon /></ActionButton>
          <ActionButton onClick={onOpen} title="View full size"><ExpandIcon /></ActionButton>
          {dl && <ActionButton href={dl} title="Download"><DownloadIcon /></ActionButton>}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs text-zinc-500">
        <span>{gen.width}×{gen.height}</span>
        <span>seed {gen.seed}</span>
        <span>{new Date(gen.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        {gen.prompt_used !== gen.prompt && (
          <details className="w-full">
            <summary className="cursor-pointer text-violet-300/80 hover:text-violet-200">Enhanced prompt</summary>
            <p className="mt-1 leading-relaxed text-zinc-400">{gen.prompt_used}</p>
          </details>
        )}
      </div>
    </div>
  );
}

export function PendingCard({ aspect }: { aspect: AspectRatio }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className={`w-full ${WIDTH[aspect]}`}>
      <div className="relative overflow-hidden rounded-2xl bg-[#14141b] ring-1 ring-white/10" style={{ aspectRatio: RATIO[aspect] }}>
        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-violet-600/20 via-fuchsia-500/10 to-amber-400/10" />
        <div className="shimmer absolute inset-0" />
        <div className="absolute inset-0 grid place-items-center">
          <div className="flex flex-col items-center gap-3 text-sm text-zinc-300">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
            <span>Creating your image… {seconds}s</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Lightbox({ gen, onClose }: { gen: Generation; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const dl = downloadUrl(gen);
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-md" onClick={onClose}>
      <div className="flex items-center justify-end gap-2 p-4" onClick={(e) => e.stopPropagation()}>
        {dl && <ActionButton href={dl} title="Download"><DownloadIcon /></ActionButton>}
        <ActionButton onClick={onClose} title="Close"><CloseIcon /></ActionButton>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center px-4 pb-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- signed, expiring storage links */}
        <img src={gen.image_url ?? ""} alt={gen.prompt} className="max-h-full max-w-full rounded-xl object-contain shadow-2xl" onClick={(e) => e.stopPropagation()} />
      </div>
      <p className="mx-auto max-w-3xl px-6 pb-6 text-center text-sm text-zinc-400" onClick={(e) => e.stopPropagation()}>
        {gen.prompt}
      </p>
    </div>
  );
}
