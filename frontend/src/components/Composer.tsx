"use client";

// The prompt box at the bottom: auto-growing text area, aspect ratio pills, enhancer and seed.
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { AspectRatio } from "@/lib/api";
import { ArrowUpIcon, SparklesIcon } from "./icons";

export const ASPECTS: { value: AspectRatio; label: string; box: string }[] = [
  { value: "1:1", label: "Square", box: "h-3.5 w-3.5" },
  { value: "4:3", label: "Landscape", box: "h-3 w-4" },
  { value: "16:9", label: "Wide", box: "h-2.5 w-[18px]" },
  { value: "9:16", label: "Portrait", box: "h-[18px] w-2.5" },
];

interface Props {
  prompt: string;
  setPrompt: (v: string) => void;
  aspect: AspectRatio;
  setAspect: (v: AspectRatio) => void;
  enhance: boolean;
  setEnhance: (v: boolean) => void;
  seed: string;
  setSeed: (v: string) => void;
  onSend: () => void;
  canSend: boolean;
  busy: boolean;
  maxChars: number;
  limitReached: boolean;
}

export type ComposerHandle = { focus: () => void };

const Composer = forwardRef<ComposerHandle, Props>(function Composer(p, ref) {
  const area = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => ({ focus: () => area.current?.focus() }));

  // Grow the text box with its content, up to a limit.
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [p.prompt]);

  const over = p.prompt.length > p.maxChars;

  return (
    <div className="rounded-2xl border border-white/10 bg-[#16161d]/90 p-2 shadow-2xl shadow-black/40 backdrop-blur-xl transition focus-within:border-violet-400/40">
      <textarea
        ref={area}
        value={p.prompt}
        onChange={(e) => p.setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            p.onSend();
          }
        }}
        rows={1}
        disabled={p.limitReached}
        placeholder={p.limitReached ? "You've used today's images. Come back tomorrow." : "Describe the image you want to create…"}
        className="block max-h-[220px] w-full resize-none bg-transparent px-3 pb-2 pt-2.5 text-[15px] leading-relaxed text-zinc-100 outline-none placeholder:text-zinc-500 disabled:cursor-not-allowed"
      />
      <div className="flex flex-wrap items-center gap-1.5 px-1 pt-1">
        {/* Aspect ratio */}
        <div className="flex rounded-xl bg-white/[0.04] p-0.5 ring-1 ring-white/[0.06]">
          {ASPECTS.map((a) => (
            <button
              key={a.value}
              onClick={() => p.setAspect(a.value)}
              title={`${a.label} (${a.value})`}
              className={`flex items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-xs font-medium transition ${
                p.aspect === a.value ? "bg-white/10 text-white shadow-sm" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <span className={`rounded-[3px] border-[1.5px] border-current ${a.box}`} />
              <span className="hidden sm:inline">{a.value}</span>
            </button>
          ))}
        </div>

        {/* Prompt enhancer */}
        <button
          onClick={() => p.setEnhance(!p.enhance)}
          title="Automatically add detail and quality words to short prompts"
          className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-medium ring-1 transition ${
            p.enhance ? "bg-violet-500/15 text-violet-200 ring-violet-400/40" : "text-zinc-400 ring-white/[0.06] hover:text-zinc-200"
          }`}
        >
          <SparklesIcon className="h-3.5 w-3.5" /> Enhance
        </button>

        {/* Seed */}
        <label className="flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs text-zinc-400 ring-1 ring-white/[0.06]" title="Same seed + same prompt = same image">
          Seed
          <input
            inputMode="numeric"
            placeholder="random"
            value={p.seed}
            onChange={(e) => p.setSeed(e.target.value.replace(/\D/g, "").slice(0, 10))}
            className="w-20 bg-transparent text-zinc-200 outline-none placeholder:text-zinc-600"
          />
        </label>

        <span className={`ml-auto text-xs tabular-nums ${over ? "text-red-400" : "text-zinc-500"}`}>
          {p.prompt.length > 0 && `${p.prompt.length}/${p.maxChars}`}
        </span>
        <button
          onClick={p.onSend}
          disabled={!p.canSend}
          aria-label="Generate image"
          className="grid h-9 w-9 place-items-center rounded-xl bg-white text-black transition hover:bg-zinc-200 disabled:bg-white/10 disabled:text-zinc-500"
        >
          {p.busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-500 border-t-transparent" /> : <ArrowUpIcon />}
        </button>
      </div>
    </div>
  );
});

export default Composer;
