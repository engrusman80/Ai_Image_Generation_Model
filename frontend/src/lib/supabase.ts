// Browser-side Supabase client: used ONLY for login. It uses the publishable key, which is safe
// to ship to browsers. All image generation goes through our backend API.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const supabaseConfigured = Boolean(url && publishableKey);

export const supabase = createClient(url || "http://localhost:54321", publishableKey || "not-configured");
