// Analisi READ-ONLY dei due database. Non scrive nulla.
const { Pool } = require('pg');

const legacy = new Pool({
  host: 'localhost', port: 5432,
  database: 'DBCompanyManagement',
  user: 'sisuite_user', password: 'sisuite2024',
  max: 4,
});
const neu = new Pool({
  host: 'localhost', port: 5433,
  database: 'sisuite',
  user: 'sisuite_admin', password: 'dev_admin_pwd_change_me',
  max: 4,
});

const SIVAF = '17G2ML76qEsEmV2jCcXazg==';

async function q(pool, sql, params) {
  const r = await pool.query(sql, params);
  return r.rows;
}

(async () => {
  const out = {};
  try {
    // 1. connettività + tenants
    out.tenants = await q(legacy, `SELECT idtenant, teamname FROM tenants ORDER BY teamname`);

    // 2. profondità alberi via treesequence (4 char per livello)
    // projectsstructures
    out.ps_depth = await q(legacy, `
      SELECT MAX(length(treesequence)/4) AS max_depth,
             ROUND(AVG(length(treesequence)/4),2) AS avg_depth,
             COUNT(*) AS nodes
      FROM projectsstructures WHERE treesequence IS NOT NULL`);
    out.ps_depth_dist = await q(legacy, `
      SELECT length(treesequence)/4 AS depth, COUNT(*) AS n
      FROM projectsstructures WHERE treesequence IS NOT NULL
      GROUP BY 1 ORDER BY 1`);
    // assets
    out.assets_depth = await q(legacy, `
      SELECT MAX(length(treesequence)/4) AS max_depth, COUNT(*) AS nodes
      FROM assets WHERE treesequence IS NOT NULL`);
    out.assets_depth_dist = await q(legacy, `
      SELECT length(treesequence)/4 AS depth, COUNT(*) AS n
      FROM assets WHERE treesequence IS NOT NULL GROUP BY 1 ORDER BY 1`);
    // partscategories
    out.partscat_depth = await q(legacy, `
      SELECT MAX(length(treesequence)/4) AS max_depth, COUNT(*) AS nodes
      FROM partscategories WHERE treesequence IS NOT NULL`);
    // tasksparents
    out.tasksparents_depth = await q(legacy, `
      SELECT MAX(length(treesequence)/4) AS max_depth, COUNT(*) AS nodes
      FROM tasksparents WHERE treesequence IS NOT NULL`);

    // 3. profondità albero per ciascun progetto Sivaf (ricorsiva dalla radice)
    out.ps_depth_sivaf = await q(legacy, `
      WITH RECURSIVE roots AS (
        SELECT p.idproject, p.idprojectstructure AS idps, 1 AS depth
        FROM projects p WHERE p.idtenant = $1 AND p.idprojectstructure IS NOT NULL
        UNION ALL
        SELECT r.idproject, c.idprojectstructure, r.depth+1
        FROM roots r JOIN projectsstructures c ON c.idprojectstructureparent = r.idps
      )
      SELECT MAX(depth) AS max_depth, COUNT(*) AS nodes, COUNT(DISTINCT idproject) AS projects
      FROM roots`, [SIVAF]);
    // distribuzione profondità per progetto (max depth raggiunta per ogni progetto)
    out.ps_depth_per_project = await q(legacy, `
      WITH RECURSIVE roots AS (
        SELECT p.idproject, p.idprojectstructure AS idps, 1 AS depth
        FROM projects p WHERE p.idprojectstructure IS NOT NULL
        UNION ALL
        SELECT r.idproject, c.idprojectstructure, r.depth+1
        FROM roots r JOIN projectsstructures c ON c.idprojectstructureparent = r.idps
      )
      SELECT maxd AS project_max_depth, COUNT(*) AS num_projects FROM (
        SELECT idproject, MAX(depth) AS maxd FROM roots GROUP BY idproject
      ) z GROUP BY maxd ORDER BY maxd`);

    // 4. structuretype distribution (modelli MO vs reali)
    out.ps_structuretype = await q(legacy, `
      SELECT structuretype, COUNT(*) FROM projectsstructures GROUP BY 1 ORDER BY 2 DESC`);

    // 5. worksummary distribution per Sivaf
    out.ws_total = await q(legacy, `SELECT COUNT(*) FROM worksummary`);
    out.ws_by_type = await q(legacy, `
      SELECT workitemobjecttype, COUNT(*) FROM worksummary GROUP BY 1 ORDER BY 2 DESC`);
    out.ws_by_entity = await q(legacy, `
      SELECT entitytype, COUNT(*) FROM worksummary GROUP BY 1 ORDER BY 2 DESC`);
    out.ws_null_tenant = await q(legacy, `SELECT COUNT(*) FROM worksummary WHERE idtenant IS NULL`);
    out.ws_sivaf = await q(legacy, `SELECT COUNT(*) FROM worksummary WHERE idtenant = $1`, [SIVAF]);

    // 6. email duplicate cross-tenant
    out.email_dups = await q(legacy, `
      SELECT email, COUNT(DISTINCT idtenant) AS tenants, COUNT(*) AS rows
      FROM users WHERE email IS NOT NULL GROUP BY email HAVING COUNT(*) > 1 ORDER BY 3 DESC`);

    // 7. conteggi per Sivaf
    out.sivaf_counts = {};
    for (const t of ['users','companies','contacts','projects','assets','tasks','workorders','parts','partsstockmovements']) {
      try {
        const col = (t==='users'||t==='companies'||t==='contacts'||t==='projects'||t==='assets'||t==='tasks'||t==='workorders'||t==='parts'||t==='partsstockmovements') ? 'idtenant' : 'idtenant';
        const r = await q(legacy, `SELECT COUNT(*) AS n FROM ${t} WHERE ${col} = $1`, [SIVAF]);
        out.sivaf_counts[t] = r[0].n;
      } catch (e) { out.sivaf_counts[t] = 'ERR: '+e.message; }
    }

    // 8. tasktype distribution
    out.tasktype = await q(legacy, `SELECT tasktype, COUNT(*) FROM tasks GROUP BY 1 ORDER BY 2 DESC`);

    // 9. stato DB nuovo: tabelle e righe principali
    out.new_tables = await q(neu, `
      SELECT table_name FROM information_schema.tables
      WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`);
    out.new_counts = {};
    for (const t of ['tenant','app_user','company','engagement','phase','activity','asset','time_entry']) {
      try { const r = await q(neu, `SELECT COUNT(*) AS n FROM ${t}`); out.new_counts[t] = r[0].n; }
      catch(e){ out.new_counts[t] = 'ERR'; }
    }

    console.log(JSON.stringify(out, null, 2));
  } catch (e) {
    console.error('FATAL', e.message);
  } finally {
    await legacy.end(); await neu.end();
  }
})();
