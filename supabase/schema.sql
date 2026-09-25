-- Database condiviso per l'app Turni Gruppo Rea.
-- Da eseguire una volta in Supabase: SQL Editor → New query → incolla → Run.
--
-- I dati sono divisi in un documento per punto vendita ("sede:<id>") più uno
-- per le impostazioni comuni ("impostazioni"), così le sedi possono lavorare
-- contemporaneamente senza sovrascriversi a vicenda.

create table if not exists public.turni_dati (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

alter table public.turni_dati enable row level security;

-- Solo gli utenti che hanno effettuato l'accesso possono leggere e modificare.
drop policy if exists "lettura utenti registrati" on public.turni_dati;
create policy "lettura utenti registrati" on public.turni_dati
  for select to authenticated using (true);

drop policy if exists "inserimento utenti registrati" on public.turni_dati;
create policy "inserimento utenti registrati" on public.turni_dati
  for insert to authenticated with check (true);

drop policy if exists "modifica utenti registrati" on public.turni_dati;
create policy "modifica utenti registrati" on public.turni_dati
  for update to authenticated using (true) with check (true);

-- Aggiornamento in tempo reale: le modifiche di una sede compaiono subito alle altre.
do $$
begin
  alter publication supabase_realtime add table public.turni_dati;
exception when duplicate_object then null;
end $$;
