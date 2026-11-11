// Calls to our FastAPI backend. The user's login token is attached; no other keys live in the browser.
import { supabase } from "./supabase";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

export type AspectRatio = "1:1" | "4:3" | "16:9" | "9:16";
export type DownloadFormat = "png" | "jpeg" | "webp";

export const FORMATS: { value: DownloadFormat; label: string; hint: string }[] = [
  { value: "png", label: "PNG", hint: "Lossless, best quality" },
  { value: "jpeg", label: "JPEG", hint: "Smaller, works everywhere" },
  { value: "webp", label: "WebP", hint: "Lossless, smaller than PNG" },
];

export interface Generation {
  id: string;
  prompt: string;
  prompt_used: string;
  aspect_ratio: AspectRatio;
  width: number;
  height: number;
  seed: number;
  model: string;
  image_url: string | null;
  created_at: string;
}

export interface PublicConfig {
  model: string;
  model_license: string;
  commercial_use: boolean;
  aspect_ratios: Record<AspectRatio, [number, number]>;
  max_prompt_chars: number;
  daily_limit: number;
  worker_mode: string;
}

export interface Me {
  id: string;
  email: string | null;
  used_today: number;
  daily_limit: number;
}

export interface GenerateResponse {
  generation: Generation;
  used_today: number;
  daily_limit: number;
}

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError("Cannot reach the server. Is the backend running?", 0);
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") message = body.detail;
      // Validation errors come back as a list; show the first one in plain words.
      else if (Array.isArray(body.detail) && body.detail[0]?.msg) message = `Invalid input: ${body.detail[0].msg}`;
    } catch {
      /* not JSON: keep the generic message */
    }
    throw new ApiError(message, res.status);
  }
  return res;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  return (await request(path, init)).json() as Promise<T>;
}

/** Download an image in the chosen format (the server converts it). */
export async function downloadImage(gen: Generation, format: DownloadFormat): Promise<void> {
  const res = await request(`/api/generations/${gen.id}/download?format=${format}`);
  const blob = await res.blob();
  const ext = format === "jpeg" ? "jpg" : format;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `image-${gen.seed}.${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
