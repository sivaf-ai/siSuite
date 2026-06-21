# DONE_E — Affinamenti altre entità + asset anchor (V045_entity_refinements.sql)

**Creato:** `work_order` +priority/due_date/site_id; `engagement` +planned_start/planned_end/priority; `asset` +model/manufacturer/warranty_until/status/parent_asset_id; **E.2**: asset.company_id nullable + work_order_subject_id + CHECK `asset_anchor_check` (company OR site OR work_order_subject); `company_contact` +mobile/department/note. Backend asset esteso (anchor + nuove colonne).

**Scostamenti:** V045. company_contact mobile/department/note: colonne a DB ma non ancora esposte nello schema FE/route contatti (additivo).

**AC E:** SUPERATO (asset ancorato SOLO a site, senza company, passa il CHECK). Niente soggetti "civetta" per gli end-user FTTH (work_order_subject + site).
