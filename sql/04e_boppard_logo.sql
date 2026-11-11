-- =====================================================================
-- 04e: Boppard-Logo in vereine eintragen (AP 4, Teil 1)
--
-- Das Frontend zeigt das Logo aus vereine_public.logo_url. Für Boppard ist die
-- Spalte noch leer; das Logo liegt als Datei im Frontend (public/). Der relative
-- Pfad funktioniert auf jedem Host (boppard., app., Vorschau-Adressen).
-- Ohne diesen Eintrag zeigt die App für Boppard nur das Kürzel "SSV".
--
-- Nur Daten. Keine Secrets. Wiederholbar.
-- =====================================================================

begin;

update public.vereine
   set logo_url = '/LOGO-SSV-BOPPARD-_1_.png'
 where slug = 'boppard' and logo_url is null;

commit;

-- KONTROLLE (erwartet: logo_url = /LOGO-SSV-BOPPARD-_1_.png)
select slug, logo_url, farbe_primary from public.vereine_public where slug = 'boppard';

-- ROLLBACK:
--   update public.vereine set logo_url = null where slug = 'boppard';
