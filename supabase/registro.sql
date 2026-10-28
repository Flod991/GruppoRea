-- Registro attività dell'app Turni Gruppo Rea.
-- Da eseguire una volta in Supabase: SQL Editor → New query → incolla → Run.
--
-- Ogni operazione fatta nell'app (accessi, turni generati o modificati, personale, PDF,
-- impostazioni) viene registrata con utente, data e ora. Il registro:
--   - può essere scritto da qualsiasi utente collegato, ma utente e orario li mette il database
--     (non si possono falsificare dall'app);
--   - può essere letto SOLO dagli amministratori elencati nella tabella "amministratori";
--   - non può essere modificato né cancellato da nessuno dall'app.

-- Amministratori: chi può leggere il registro.
create table if not exists public.amministratori (
  email text primary key
);
alter table public.amministratori enable row level security;
drop policy if exists "amministratore vede solo se stesso" on public.amministratori;
create policy "amministratore vede solo se stesso" on public.amministratori
  for select to authenticated
  using (lower(email) = lower(auth.jwt() ->> 'email'));

-- Registro.
create table if not exists public.registro_attivita (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid,
  email text,
  azione text not null,
  sede text,
  reparto text,
  dettagli text
);
create index if not exists registro_attivita_data on public.registro_attivita (created_at desc);
alter table public.registro_attivita enable row level security;

-- Utente e orario vengono sempre dal database, mai dall'app.
create or replace function public.registro_attivita_autore()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.user_id := auth.uid();
  new.email := auth.jwt() ->> 'email';
  new.created_at := now();
  return new;
end $$;
drop trigger if exists registro_attivita_autore on public.registro_attivita;
create trigger registro_attivita_autore before insert on public.registro_attivita
  for each row execute function public.registro_attivita_autore();

drop policy if exists "utenti collegati scrivono" on public.registro_attivita;
create policy "utenti collegati scrivono" on public.registro_attivita
  for insert to authenticated with check (auth.uid() is not null);

drop policy if exists "solo amministratori leggono" on public.registro_attivita;
create policy "solo amministratori leggono" on public.registro_attivita
  for select to authenticated
  using (exists (select 1 from public.amministratori a where lower(a.email) = lower(auth.jwt() ->> 'email')));

-- Sui dati dei turni: chi ha fatto l'ultima modifica e quando.
create or replace function public.turni_dati_autore()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists turni_dati_autore on public.turni_dati;
create trigger turni_dati_autore before insert or update on public.turni_dati
  for each row execute function public.turni_dati_autore();

-- Inserisci qui l'email di chi può leggere il registro (una riga per amministratore):
-- insert into public.amministratori (email) values ('nome@esempio.it') on conflict do nothing;
