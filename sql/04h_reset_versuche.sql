-- =====================================================================
-- 04h: Begrenzung für Passwort-Reset-Mails (AP 4, Teil 3b)
--
-- Die Function passwort-reset ist ohne Login aufrufbar. Damit niemand mit ihr
-- Postfächer zumüllen kann, zählt sie pro E-Mail-Adresse die Anfragen der letzten
-- Stunde (höchstens 3) und pro Aufrufer-IP (höchstens 20).
--
-- Gespeichert wird nur ein Hash (SHA-256) von E-Mail bzw. IP, keine Klartextdaten.
-- Die Function (Service Role) ist der einzige Zugriff. RLS ist an, bewusst ohne Policy.
-- Alte Einträge löscht die Function bei jedem Aufruf (älter als 1 Tag).
--
-- Rein additiv, die laufende App merkt nichts. Keine Secrets. Wiederholbar.
-- =====================================================================

begin;

create table if not exists public.reset_versuche (
  id          bigint generated always as identity primary key,
  schluessel  text not null,                    -- 'mail:<sha256>' oder 'ip:<sha256>'
  erstellt_am timestamptz not null default now()
);

alter table public.reset_versuche enable row level security;

create index if not exists reset_versuche_schluessel_idx
  on public.reset_versuche (schluessel, erstellt_am desc);

commit;

-- KONTROLLE (erwartet: Tabelle vorhanden, RLS an, keine Policy, 0 Zeilen)
select
  (select count(*) from public.reset_versuche)                                  as zeilen,
  (select relrowsecurity from pg_class where oid = 'public.reset_versuche'::regclass) as rls_an,
  (select count(*) from pg_policies where tablename = 'reset_versuche')         as policies;

-- ROLLBACK:
--   drop table if exists public.reset_versuche;
