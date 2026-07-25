-- ARTeam PrintFlow - Supabase starter schema
-- Run this file in Supabase SQL Editor.
-- It stores the current local app data as versioned JSON records per user.

create table if not exists public.printflow_records (
  owner_id uuid not null default auth.uid(),
  kind text not null check (
    kind in (
      'sections',
      'services',
      'clients',
      'projects',
      'devis',
      'pricingRuleVersions',
      'machines',
      'papers'
    )
  ),
  entity_id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (owner_id, kind, entity_id)
);

create index if not exists printflow_records_kind_idx
  on public.printflow_records (owner_id, kind);

alter table public.printflow_records enable row level security;

drop policy if exists "printflow_records_select_own" on public.printflow_records;
create policy "printflow_records_select_own"
  on public.printflow_records
  for select
  to authenticated
  using (owner_id = auth.uid());

drop policy if exists "printflow_records_insert_own" on public.printflow_records;
create policy "printflow_records_insert_own"
  on public.printflow_records
  for insert
  to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "printflow_records_update_own" on public.printflow_records;
create policy "printflow_records_update_own"
  on public.printflow_records
  for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "printflow_records_delete_own" on public.printflow_records;
create policy "printflow_records_delete_own"
  on public.printflow_records
  for delete
  to authenticated
  using (owner_id = auth.uid());
