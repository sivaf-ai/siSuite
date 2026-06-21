# DONE_J — Immagini materiali (migrazione V048_material_images.sql)

**V048:** **DROP `material.primary_image_url`** (ridondante: la primaria È `material_image WHERE is_primary`) + unique parziale `material_image_one_primary_uidx` (max una primaria per articolo).

**Backend:** bucket MinIO dedicato `material-images`; storage.ts generalizzato (`putObject/presignObject/removeObject/ensureBucketNamed`) + **client presign con endpoint PUBBLICO** (localhost:9100, region esplicita → presign locale, URL raggiungibile dal browser). `materialCatalog.ts`: **upload multipart** (chiave `tenant/material/<uuid>.<ext>`, prima immagine → primaria), **list** con URL presigned, **set-primary** (transazione), **reorder**, **delete** (rimuove oggetto MinIO + promuove la prossima a primaria). `materials.ts`: SELECT risolve la primaria via join e ne restituisce l'URL presigned (lista+scheda); rimosso ogni riferimento a primary_image_url.

**FE:** galleria nella scheda Articolo (upload drag&drop/picker, miniature, set-primary, elimina); miniatura primaria nella lista articoli.

**NON FARE rispettati:** binari mai nel DB (solo object_key); bucket non pubblico (URL presigned a scadenza); niente primary_image_url.

**Aperti:** reorder drag&drop UI (endpoint pronto); in prod impostare MINIO_PUBLIC_ENDPOINT.

**AC J:** SUPERATO (upload, set-primary, riordino via API, delete; miniatura in lista; URL scaricabile HTTP 200; oggetto rimosso da MinIO al delete).
