"use client";

// Email/password sign-in and sign-up, plus "Continue with Google" (handled by Supabase).
import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function AuthForm() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) setError(error.message);
      else if (!data.session) setNotice("Account created. Check your email and click the confirmation link, then sign in.");
    }
    setBusy(false);
  }

  async function google() {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) setError(error.message);
  }

  return (
    <div className="mx-auto mt-16 w-full max-w-sm rounded-2xl border border-neutral-200 p-6 shadow-sm dark:border-neutral-800">
      <h1 className="text-2xl font-semibold">Image Chat</h1>
      <p className="mt-1 text-sm text-neutral-500">
        {mode === "signin" ? "Sign in to create images." : "Create an account to get started."}
      </p>

      <form onSubmit={submit} className="mt-6 space-y-3">
        <input
          type="email"
          required
          autoComplete="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 outline-none focus:border-neutral-500 dark:border-neutral-700"
        />
        <input
          type="password"
          required
          minLength={8}
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          placeholder="Password (min 8 characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 outline-none focus:border-neutral-500 dark:border-neutral-700"
        />
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-neutral-900 py-2 font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>
      </form>

      <button
        onClick={google}
        className="mt-3 w-full rounded-lg border border-neutral-300 py-2 font-medium dark:border-neutral-700"
      >
        Continue with Google
      </button>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {notice && <p className="mt-3 text-sm text-green-600">{notice}</p>}

      <p className="mt-6 text-center text-sm text-neutral-500">
        {mode === "signin" ? "No account yet? " : "Already have an account? "}
        <button
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="font-medium text-neutral-900 underline dark:text-white"
        >
          {mode === "signin" ? "Create one" : "Sign in"}
        </button>
      </p>
    </div>
  );
}
