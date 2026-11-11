-- Run this once in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run.
-- Creates the history table, the daily-usage counter, and a private bucket for images.
-- Only the backend (secret key) can read or write these. Browsers have no direct access.

-- 1) One row per generated image.
create table if not exists public.generations (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  prompt       text not null,          -- what the user typed
  prompt_used  text not null,          -- what was sent to the model (after the optional enhancer)
  model        text not null,
  aspect_ratio text not null,
  width        int  not null,
  height       int  not null,
  steps        int  not null,
  guidance     real not null,
  seed         bigint not null,
  image_path   text not null,          -- path inside the "images" storage bucket
  created_at   timestamptz not null default now()
);
create index if not exists generations_user_created on public.generations (user_id, created_at desc);

-- 2) Images used per user per UTC day (the daily limit).
create table if not exists public.daily_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day     date not null,
  count   int  not null default 0,
  primary key (user_id, day)
);

-- Row Level Security ON with no policies = no access through the public (browser) key.
alter table public.generations enable row level security;
alter table public.daily_usage enable row level security;

-- 3) Atomically count one image against today's limit. Returns the new count, or NULL if the
--    limit is already reached. Safe even when two requests arrive at the same moment.
create or replace function public.claim_generation(p_user uuid, p_limit int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  insert into public.daily_usage (user_id, day, count)
  values (p_user, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, day)
    do update set count = public.daily_usage.count + 1
    where public.daily_usage.count < p_limit
  returning count into v_count;
  return v_count;
end;
$$;

-- 4) Give one image back (used when a generation fails).
create or replace function public.release_generation(p_user uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.daily_usage set count = count - 1
  where user_id = p_user and day = (now() at time zone 'utc')::date and count > 0;
$$;

-- Only the backend may call these functions.
revoke execute on function public.claim_generation(uuid, int) from public, anon, authenticated;
revoke execute on function public.release_generation(uuid) from public, anon, authenticated;
grant execute on function public.claim_generation(uuid, int) to service_role;
grant execute on function public.release_generation(uuid) to service_role;

-- 5) Private bucket for the images (served through short-lived signed links).
insert into storage.buckets (id, name, public)
values ('images', 'images', false)
on conflict (id) do nothing;
