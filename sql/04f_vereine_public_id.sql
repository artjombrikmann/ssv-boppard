-- =====================================================================
-- 04f: id in die öffentliche Vereins-View (AP 4, Teil 2)
--
-- Das Frontend sucht die Mitgliedschaft über verein_id. Die View vereine_public
-- lieferte bisher keine id. Neue Spalten dürfen bei CREATE OR REPLACE VIEW nur
-- am ENDE angehängt werden, deshalb steht id ganz hinten.
--
-- Die id ist ein zufälliger Schlüssel ohne Zugriffswirkung (RLS schützt die Daten);
-- die von Boppard steht ohnehin im Repo.
--
-- WICHTIG: Diese Datei VOR dem Test der Preview von Teil 2 ausführen.
-- Nur eine View, keine Daten. Wiederholbar. Keine Secrets.
-- =====================================================================

begin;

create or replace view public.vereine_public as
  select slug, name, logo_url, farbe_primary, farbe_secondary,
         icon_192_url, icon_512_url, features,
         rechtsname, anschrift, plz_ort, land, kontakt_email, vertretung,
         id
    from public.vereine
   where aktiv;

grant select on public.vereine_public to anon, authenticated;

commit;

-- KONTROLLE (erwartet: eine Zeile, id = 5b0bba2d-0000-4000-8000-000000000001)
select slug, id from public.vereine_public where slug = 'boppard';

-- ROLLBACK (id wieder entfernen: View neu anlegen, Spaltenliste wie in 04a ohne id):
--   drop view public.vereine_public;
--   create view public.vereine_public as
--     select slug, name, logo_url, farbe_primary, farbe_secondary,
--            icon_192_url, icon_512_url, features,
--            rechtsname, anschrift, plz_ort, land, kontakt_email, vertretung
--       from public.vereine where aktiv;
--   grant select on public.vereine_public to anon, authenticated;
