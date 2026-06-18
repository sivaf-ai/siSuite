// Censimento READ-ONLY scoped su Sivaf reale. Non scrive nulla.
const { Pool } = require('pg');
const legacy = new Pool({ host:'localhost',port:5432,database:'DBCompanyManagement',user:'sisuite_user',password:'sisuite2024',max:4 });
const SIVAF = '17G2ML76qEsEmV2jCcXazg==';

// per ogni tabella: SQL di conteggio scoped Sivaf (alcune via join)
const queries = {
  users:                `SELECT COUNT(*) n FROM users WHERE idtenant=$1`,
  usersgroups:          `SELECT COUNT(*) n FROM usersgroups WHERE idtenant=$1`,
  usersgroupsmembers:   `SELECT COUNT(*) n FROM usersgroupsmembers m JOIN users u ON u.iduser=m.iduser WHERE u.idtenant=$1`,
  companies:            `SELECT COUNT(*) n FROM companies WHERE idtenant=$1`,
  contacts:             `SELECT COUNT(*) n FROM contacts WHERE idtenant=$1`,
  projects:             `SELECT COUNT(*) n FROM projects WHERE idtenant=$1`,
  assetscategories:     `SELECT COUNT(*) n FROM assetscategories WHERE idtenant=$1`,
  assets:               `SELECT COUNT(*) n FROM assets WHERE idtenant=$1`,
  tasks:                `SELECT COUNT(*) n FROM tasks WHERE idtenant=$1`,
  tasksusers:           `SELECT COUNT(*) n FROM tasksusers tu JOIN tasks t ON t.idtask=tu.idtask WHERE t.idtenant=$1`,
  tasksstatus:          `SELECT COUNT(*) n FROM tasksstatus WHERE idtenant=$1`,
  workorders:           `SELECT COUNT(*) n FROM workorders WHERE idtenant=$1`,
  workordersassets:     `SELECT COUNT(*) n FROM workordersassets wa JOIN workorders w ON w.idworkorder=wa.idworkorder WHERE w.idtenant=$1`,
  workordersparts:      `SELECT COUNT(*) n FROM workordersparts wp JOIN workorders w ON w.idworkorder=wp.idworkorder WHERE w.idtenant=$1`,
  parts:                `SELECT COUNT(*) n FROM parts WHERE idtenant=$1`,
  partscategories:      `SELECT COUNT(*) n FROM partscategories WHERE idtenant=$1`,
  partsstockmovements:  `SELECT COUNT(*) n FROM partsstockmovements sm JOIN parts p ON p.idpart=sm.idpart WHERE p.idtenant=$1`,
  worksummary:          `SELECT COUNT(*) n FROM worksummary WHERE idtenant=$1`,
  worksummarycategories:`SELECT COUNT(*) n FROM worksummarycategories WHERE idtenant=$1`,
  workingtime:          `SELECT COUNT(*) n FROM workingtime WHERE idtenant=$1`,
};

(async()=>{
  const res={};
  for (const [name,sql] of Object.entries(queries)) {
    try { const r=await legacy.query(sql,[SIVAF]); res[name]=r.rows[0].n; }
    catch(e){ res[name]='ERR: '+e.message; }
  }
  // worksummary Sivaf split per workitemobjecttype + entitytype
  const ws=await legacy.query(`SELECT workitemobjecttype, entitytype, COUNT(*) n FROM worksummary WHERE idtenant=$1 GROUP BY 1,2 ORDER BY 3 DESC`,[SIVAF]);
  console.log(JSON.stringify(res,null,2));
  console.log('--- worksummary Sivaf split ---');
  ws.rows.forEach(r=>console.log(`  ${r.workitemobjecttype}/${r.entitytype}: ${r.n}`));
  await legacy.end();
})().catch(e=>{console.error(e.message);process.exit(1)});
