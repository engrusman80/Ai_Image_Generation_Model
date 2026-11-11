"use client";

// Shows the login form or the chat, depending on whether the user is signed in.
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import AuthForm from "@/components/AuthForm";
import Chat from "@/components/Chat";
import { supabase, supabaseConfigured } from "@/lib/supabase";

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!supabaseConfigured) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!supabaseConfigured) {
    return (
      <div className="mx-auto mt-16 max-w-md p-6 text-sm">
        <h1 className="text-xl font-semibold">Setup needed</h1>
        <p className="mt-2">
          Copy <code>frontend/.env.example</code> to <code>frontend/.env.local</code>, fill in your Supabase URL and
          publishable key, then restart <code>npm run dev</code>.
        </p>
      </div>
    );
  }
  if (!ready) return <p className="mt-16 text-center text-neutral-500">Loading…</p>;
  return session ? <Chat email={session.user.email ?? null} /> : <AuthForm />;
}
