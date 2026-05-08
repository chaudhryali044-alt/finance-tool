-- Meridian Database Schema
-- Run this in the Supabase SQL editor

-- Watchlist table
create table if not exists watchlist (
  id uuid default gen_random_uuid() primary key,
  user_session text not null,
  session_id text not null,
  company_name text not null,
  deal_type text,
  tool_type text check (tool_type in ('raise', 'deals')) not null,
  signal_strength text,
  signal_changed boolean default false,
  brief_data jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes
create index if not exists watchlist_session_idx on watchlist (session_id);
create index if not exists watchlist_created_idx on watchlist (created_at desc);

-- Shared briefs table (for share links)
create table if not exists shared_briefs (
  id uuid default gen_random_uuid() primary key,
  tool_type text check (tool_type in ('raise', 'deals')) not null,
  company_name text,
  brief_data jsonb,
  session_id text,
  created_at timestamptz default now()
);

-- Row Level Security
alter table watchlist enable row level security;
alter table shared_briefs enable row level security;

-- Policies: allow all operations (session-based, no auth)
create policy "Allow all watchlist operations" on watchlist
  for all using (true) with check (true);

create policy "Allow all shared_briefs operations" on shared_briefs
  for all using (true) with check (true);

-- Auto-update updated_at
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger watchlist_updated_at
  before update on watchlist
  for each row execute function update_updated_at();
