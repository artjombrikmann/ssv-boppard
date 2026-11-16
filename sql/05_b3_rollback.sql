-- =====================================================================
-- 05_b3_rollback.sql  –  macht 05_b3_switch.sql rückgängig   (AP 5)
--
-- Stellt den Policy-Stand VOR dem Switch wieder her. Die alten Policies liest die Datei aus
-- backup_pre_b3.policies, das der Switch selbst angelegt hat. Es wird nichts nachgebaut,
-- also kann keine Policy "vergessen" werden.
--
-- Nur ausführen, wenn der Switch durchgelaufen ist und etwas nicht stimmt.
-- Entscheidung binnen 10 Minuten: Je länger der Switch läuft, desto mehr Änderungen (Anmeldungen,
-- Punkte) entstehen unter den neuen Regeln. Die Daten bleiben beim Rollback erhalten, nur die Rechte
-- gehen zurück.
--
-- Das Frontend muss dabei NICHT zurückgesetzt werden: Es funktioniert mit alter und neuer Policy-Welt.
-- (Das ist die Voraussetzung für den Switch, siehe AP5_VORBEREITUNG.md.)
--
-- Wiederherstellung der Constraints: die zwei alten Unique-Constraints werden NICHT automatisch
-- zurückgelegt (sie würden mit Daten eines zweiten Vereins kollidieren). Beim Rollback vor dem
-- Anlegen von Spay ist das unkritisch, siehe Abschnitt 3.
-- =====================================================================

begin;

-- 0) Die Sicherung muss existieren und Zeilen haben
do $$
begin
  if to_regclass('backup_pre_b3.policies') is null
     or (select count(*) from backup_pre_b3.policies) = 0 then
    raise exception 'backup_pre_b3.policies fehlt oder ist leer, kein Rollback möglich';
  end if;
end $$;

-- 1) Alle Policies der betroffenen Tabellen entfernen (die neuen aus dem Switch)
do $$
declare
  p record;
begin
  for p in
    select tablename, policyname from pg_policies
     where schemaname = 'public'
       and tablename in (
         'vereine', 'mitgliedschaften', 'profiles',
         'veranstaltungen', 'schichten', 'kategorien', 'punkteregeln', 'preise', 'einstellungen', 'schicht_vorlagen',
         'schichtbelegungen', 'schicht_vorlagen_positionen',
         'shop_anfragen', 'gutschein_anfragen', 'benachrichtigungen', 'push_subscriptions')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- 2) Die gesicherten Policies neu anlegen (exakt wie vor dem Switch)
--    Jede Rolle wird einzeln als Name eingesetzt (%I), nichts wird ungeprüft zusammengebaut.
do $$
declare
  p record;
  rollen text;
  sql text;
  angelegt integer := 0;
begin
  for p in select * from backup_pre_b3.policies
            where tablename in (
              'vereine', 'mitgliedschaften', 'profiles',
         'veranstaltungen', 'schichten', 'kategorien', 'punkteregeln', 'preise', 'einstellungen', 'schicht_vorlagen',
         'schichtbelegungen', 'schicht_vorlagen_positionen',
         'shop_anfragen', 'gutschein_anfragen', 'benachrichtigungen', 'push_subscriptions')
            order by tablename, policyname loop
    select string_agg(quote_ident(r), ', ') into rollen from unnest(p.roles) as r;
    sql := format('create policy %I on public.%I as %s for %s to %s',
                  p.policyname, p.tablename,
                  case when p.permissive = 'PERMISSIVE' then 'permissive' else 'restrictive' end,
                  p.cmd, coalesce(rollen, 'public'));
    if p.qual is not null then sql := sql || format(' using (%s)', p.qual); end if;
    if p.with_check is not null then sql := sql || format(' with check (%s)', p.with_check); end if;
    execute sql;
    angelegt := angelegt + 1;
  end loop;

  -- Selbsttest: Es müssen genau so viele Policies existieren, wie gesichert wurden
  if angelegt <> (select count(*) from backup_pre_b3.policies where tablename in (
         'vereine', 'mitgliedschaften', 'profiles',
         'veranstaltungen', 'schichten', 'kategorien', 'punkteregeln', 'preise', 'einstellungen', 'schicht_vorlagen',
         'schichtbelegungen', 'schicht_vorlagen_positionen',
         'shop_anfragen', 'gutschein_anfragen', 'benachrichtigungen', 'push_subscriptions'))
     or (select count(*) from pg_policies where schemaname = 'public' and tablename in (
         'vereine', 'mitgliedschaften', 'profiles',
         'veranstaltungen', 'schichten', 'kategorien', 'punkteregeln', 'preise', 'einstellungen', 'schicht_vorlagen',
         'schichtbelegungen', 'schicht_vorlagen_positionen',
         'shop_anfragen', 'gutschein_anfragen', 'benachrichtigungen', 'push_subscriptions'))
        <> angelegt then
    raise exception 'Rollback unvollständig: % Policies angelegt', angelegt;
  end if;
end $$;

-- 3) RLS-Schalter auf den Stand vor dem Switch (nur wo er sich unterscheidet)
do $$
declare
  r record;
begin
  for r in select tabelle, rls_an from backup_pre_b3.rls_status loop
    if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                where n.nspname = 'public' and c.relname = r.tabelle and c.relkind = 'r') then
      execute format('alter table public.%I %s row level security',
                     r.tabelle, case when r.rls_an then 'enable' else 'disable' end);
    end if;
  end loop;
end $$;

-- 4) Alte Constraints zurücklegen, aber nur wenn es noch KEINE Daten eines zweiten Vereins gibt
do $$
begin
  if (select count(*) from public.vereine) = 1 then
    if not exists (select 1 from pg_constraint where conname = 'kategorien_name_key') then
      alter table public.kategorien add constraint kategorien_name_key unique (name);
    end if;
    if not exists (select 1 from pg_constraint where conname = 'push_subscriptions_user_id_key') then
      alter table public.push_subscriptions add constraint push_subscriptions_user_id_key unique (user_id);
    end if;
  else
    raise notice 'Mehr als ein Verein: Die alten Unique-Constraints wurden NICHT zurückgelegt.';
  end if;
end $$;

commit;

-- KONTROLLE 1: Anzahl Policies wie vorher (Vergleich mit der Sicherung)
--   select (select count(*) from pg_policies where schemaname = 'public') as jetzt,
--          (select count(*) from backup_pre_b3.policies)                  as gesichert;
--   -- erwartet: gleich (der Rollback fasst nur die 16 Tabellen des Switchs an; die übrigen standen vor und nach dem Switch gleich)
-- KONTROLLE 2: Die alten offenen Policies sind zurück
--   select tablename, policyname from pg_policies
--    where schemaname = 'public' and policyname in ('read_all', 'own_insert') order by 1, 2;
-- Danach: App öffnen, einloggen, Marktplatz laden, an- und abmelden.
