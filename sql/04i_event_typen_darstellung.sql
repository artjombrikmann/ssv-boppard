-- =====================================================================
-- 04i: Event-Typen mit Icon, Verlauf und Deko (AP 4, Teil 4.6)
--
-- Das Frontend liest Label, Symbol und Banner-Verlauf künftig aus event_typen
-- statt aus dem Code (eventBanner.ts). Dafür brauchen die Typen drei Spalten:
--   icon      Emoji im Banner und in den Auswahllisten
--   verlauf   fertiger CSS-Verlauf für das Banner (optional; ohne Wert baut das
--             Frontend einen Verlauf aus der Typ-Farbe bzw. der Vereinsfarbe)
--   deko      true = Konfetti-Deko im Banner (bisher fest bei "Vereinsfest")
--
-- Boppard bekommt exakt die bisherigen Werte aus eventBanner.ts, damit sich
-- nichts ändert. Einzige sichtbare Änderung: Im Dropdown stand bei Vereinsfest
-- 🎉, im Banner 🎪. Künftig gilt überall das Banner-Symbol 🎪.
--
-- Rein additiv (neue Spalten mit Default), die laufende App liest event_typen nicht.
-- Keine Secrets. Wiederholbar.
-- =====================================================================

begin;

alter table public.event_typen
  add column if not exists icon    text,
  add column if not exists verlauf text,
  add column if not exists deko    boolean not null default false;

-- Selbsttest der Regel mit Postgres' eigener Regex-Engine (sie unterscheidet sich von JavaScript):
-- Die vier Boppard-Verläufe müssen passen, bekannte Angriffe müssen scheitern. Sonst bricht die Datei ab,
-- bevor sie etwas ändert.
do $$
declare
  re constant text := '^linear-gradient\((?:[#0-9a-zA-Z%,. -]|var\(--[a-z-]+\))+\)$';
begin
  if not ('linear-gradient(135deg, #1a7a1a 0%, #2ecc40 60%, #145214 100%)' ~ re
      and 'linear-gradient(135deg, #0d631b 0%, #1a7a1a 40%, #b8860b 100%)' ~ re
      and 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)' ~ re
      and 'linear-gradient(135deg, #0d631b 0%, #1a7a1a 50%, #145214 100%)' ~ re
      and 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)' ~ re) then
    raise exception 'Verlauf-Regel lehnt gültige Werte ab, Datei wurde nicht angewendet';
  end if;
  if ('linear-gradient(red, url(https://evil.example/x.png))' ~ re
      or 'linear-gradient(red, blue); background:url(x)' ~ re
      or 'linear-gradient(red, blue) expression(alert(1))' ~ re
      or 'linear-gradient(red, "blue")' ~ re
      or 'linear-gradient(var(--x, url(y)), blue)' ~ re) then
    raise exception 'Verlauf-Regel lässt gefährliche Werte durch, Datei wurde nicht angewendet';
  end if;
end $$;

-- Verlaufswerte: Der Wert landet im style-Attribut. Erlaubt ist NUR linear-gradient( ... ) und
-- darin Farben, Zahlen, Prozent, Komma sowie var(--name) als einzige innere Klammer.
-- Damit gehen weder url(...), expression(...), Strichpunkt noch Anführungszeichen durch.
alter table public.event_typen drop constraint if exists event_typen_verlauf_check;
alter table public.event_typen
  add constraint event_typen_verlauf_check
  check (verlauf is null or (verlauf ~ '^linear-gradient\((?:[#0-9a-zA-Z%,. -]|var\(--[a-z-]+\))+\)$' and length(verlauf) <= 200));

alter table public.event_typen drop constraint if exists event_typen_farbe_check;
alter table public.event_typen
  add constraint event_typen_farbe_check
  check (farbe is null or farbe ~ '^#[0-9a-fA-F]{6}$');

-- Boppard: Werte exakt wie bisher in src/eventBanner.ts
update public.event_typen set
  icon = '⚽', deko = false,
  verlauf = 'linear-gradient(135deg, #1a7a1a 0%, #2ecc40 60%, #145214 100%)'
where verein_id = '5b0bba2d-0000-4000-8000-000000000001' and key = 'heimspiel';

update public.event_typen set
  icon = '🎪', deko = true,
  verlauf = 'linear-gradient(135deg, #0d631b 0%, #1a7a1a 40%, #b8860b 100%)'
where verein_id = '5b0bba2d-0000-4000-8000-000000000001' and key = 'vereinsfest';

update public.event_typen set
  icon = '🏈', deko = false,
  verlauf = 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)'
where verein_id = '5b0bba2d-0000-4000-8000-000000000001' and key = 'flag-football';

update public.event_typen set
  icon = '🏆', deko = false,
  verlauf = 'linear-gradient(135deg, #0d631b 0%, #1a7a1a 50%, #145214 100%)'
where verein_id = '5b0bba2d-0000-4000-8000-000000000001' and key = 'turnier';

commit;

-- KONTROLLE (erwartet: 4 Zeilen, alle mit icon und verlauf, nur vereinsfest mit deko = true)
select key, label, icon, deko, left(verlauf, 40) as verlauf_anfang
  from public.event_typen
 where verein_id = '5b0bba2d-0000-4000-8000-000000000001'
 order by sort;

-- ROLLBACK:
--   alter table public.event_typen
--     drop constraint if exists event_typen_verlauf_check,
--     drop constraint if exists event_typen_farbe_check,
--     drop column if exists icon, drop column if exists verlauf, drop column if exists deko;
