"use client";

// A finished image with its action bar, the "generating" placeholder, and the full-screen viewer.
import { useEffect, useState } from "react";
import { FORMATS, type AspectRatio, type DownloadFormat, type Generation } from "@/lib/api";
import { CheckIcon, ChevronDownIcon, CloseIcon, CopyIcon, DownloadIcon, EditIcon, ExpandIcon, RefreshIcon, TrashIcon } from "./icons";
import { Menu } from "./ui";

const RATIO: Record<AspectRatio, string> = { "1:1": "1 / 1", "4:3": "4 / 3", "16:9": "16 / 9", "9:16": "9 / 16" };
// Portrait images are narrower so they don't fill the whole screen height.
const WIDTH: Record<AspectRatio, string> = { "1:1": "max-w-xl", "4:3": "max-w-2xl", "16:9": "max-w-3xl", "9:16": "max-w-sm" };

const toolBtn = "grid h-8 w-8 place-items-center rounded-lg text-muted transition hover:bg-hover hover:text-fg";

interface CardProps {
  gen: Generation;
  format: DownloadFormat;
  onOpen: () => void;
  onDownload: (format: DownloadFormat) => void;
  onRegenerate: () => void;
  onReuse: () => void;
  onDelete: () => void;
}

export function ImageCard({ gen, format, onOpen, onDownload, onRegenerate, onReuse, onDelete }: CardProps) {
  const [copied, setCopied] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const formatLabel = FORMATS.find((f) => f.value === format)?.label ?? "PNG";

  async function copyPrompt() {
    await navigator.clipboard.writeText(gen.prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className={`w-full ${WIDTH[gen.aspect_ratio]}`}>
      <div className="group relative overflow-hidden rounded-2xl bg-hover ring-1 ring-line" style={{ aspectRatio: RATIO[gen.aspect_ratio] }}>
        {!loaded && <div className="absolute inset-0 animate-pulse bg-active" />}
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
          <div className="grid h-full place-items-center text-sm text-muted">Image unavailable</div>
        )}
        <button
          onClick={onOpen}
          aria-label="View full size"
          className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-xl bg-black/50 text-white ring-1 ring-white/15 backdrop-blur-md transition hover:bg-black/70 md:opacity-0 md:group-hover:opacity-100"
        >
          <ExpandIcon />
        </button>
      </div>

      {/* Action bar, like the icons under a ChatGPT answer */}
      <div className="mt-1.5 flex flex-wrap items-center gap-0.5">
        <div className="mr-1 flex items-center overflow-hidden rounded-lg ring-1 ring-line">
          <button onClick={() => onDownload(format)} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition hover:bg-hover">
            <DownloadIcon className="h-3.5 w-3.5" /> {formatLabel}
          </button>
          <Menu
            label="Choose download format"
            triggerClassName="border-l border-line px-1.5 py-1.5 text-muted transition hover:bg-hover hover:text-fg"
            trigger={<ChevronDownIcon className="h-3.5 w-3.5" />}
            align="left"
            items={FORMATS.map((f) => ({ label: `Download ${f.label}`, hint: f.hint, onClick: () => onDownload(f.value) }))}
          />
        </div>
        <button onClick={copyPrompt} className={toolBtn} title="Copy prompt" aria-label="Copy prompt">
          {copied ? <CheckIcon /> : <CopyIcon />}
        </button>
        <button onClick={onRegenerate} className={toolBtn} title="Regenerate (new seed)" aria-label="Regenerate">
          <RefreshIcon />
        </button>
        <button onClick={onReuse} className={toolBtn} title="Edit prompt (reuse prompt & seed)" aria-label="Edit prompt">
          <EditIcon />
        </button>
        <button onClick={onDelete} className={`${toolBtn} hover:text-red-500`} title="Delete" aria-label="Delete image">
          <TrashIcon />
        </button>
        <span className="ml-auto px-1 text-[11px] text-faint">
          {gen.width}×{gen.height} · seed {gen.seed}
        </span>
      </div>
      {gen.prompt_used !== gen.prompt && (
        <details className="mt-1 px-1 text-xs text-muted">
          <summary className="cursor-pointer text-violet-600 hover:text-violet-500 dark:text-violet-300">Enhanced prompt</summary>
          <p className="mt-1 leading-relaxed">{gen.prompt_used}</p>
        </details>
      )}
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
      <div className="relative overflow-hidden rounded-2xl bg-hover ring-1 ring-line" style={{ aspectRatio: RATIO[aspect] }}>
        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-violet-500/25 via-fuchsia-500/15 to-amber-400/15" />
        <div className="shimmer absolute inset-0" />
        <div className="absolute inset-0 grid place-items-center">
          <div className="flex flex-col items-center gap-3 text-sm text-fg-soft">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-line-strong border-t-fg" />
            <span>Creating your image… {seconds}s</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Lightbox({ gen, onClose, onDownload }: { gen: Generation; onClose: () => void; onDownload: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const btn = "grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-white ring-1 ring-white/15 transition hover:bg-white/20";
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-md" onClick={onClose}>
      <div className="flex items-center justify-end gap-2 p-4" onClick={(e) => e.stopPropagation()}>
        <button onClick={onDownload} className={btn} title="Download" aria-label="Download">
          <DownloadIcon />
        </button>
        <button onClick={onClose} className={btn} title="Close (Esc)" aria-label="Close">
          <CloseIcon />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center px-4 pb-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- signed, expiring storage links */}
        <img src={gen.image_url ?? ""} alt={gen.prompt} className="max-h-full max-w-full rounded-xl object-contain shadow-2xl" onClick={(e) => e.stopPropagation()} />
      </div>
      <p className="mx-auto max-w-3xl px-6 pb-6 text-center text-sm text-zinc-300" onClick={(e) => e.stopPropagation()}>
        {gen.prompt}
      </p>
    </div>
  );
}
