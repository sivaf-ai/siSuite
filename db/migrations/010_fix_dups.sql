-- =====================================================================
--  010 — CORREZIONI di consistenza (introdotte dalle sessioni 14/06):
--  (a) la 008 aveva re-inserito campi di sistema GIÀ presenti dalla 004
--      (engagement.budget, resource.hourly_cost). Con vertical NULL l'UNIQUE
--      parziale non li intercetta (NULL distinti) → doppioni nei form. Rimuovo
--      le righe aggiunte dalla 008 (riconosciute da group_key/sequence).
--      `material.unit_cost` resta (era davvero nuovo).
--  (b) la 009 aveva creato `engagement_template`, che DUPLICA la tabella
--      `template` preesistente (scope+blueprint). Riconciliato: i modelli usano
--      ora `template` (scope='engagement'); rimuovo la tabella ridondante (vuota).
-- =====================================================================

-- (a) dedup field_definition di sistema
DELETE FROM field_definition
 WHERE tenant_id IS NULL AND vertical IS NULL
   AND entity = 'engagement' AND key = 'budget' AND group_key = 'economics';
DELETE FROM field_definition
 WHERE tenant_id IS NULL AND vertical IS NULL
   AND entity = 'resource' AND key = 'hourly_cost' AND sequence = 50;

-- (b) rimuove la tabella ridondante (i modelli confluiscono in `template`)
DROP TABLE IF EXISTS public.engagement_template;
