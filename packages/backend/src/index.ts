/**
 * index.ts — bootstrap del server Fastify.
 *  - CORS per il frontend Vite
 *  - app.authenticate (verifica JWT + contesto)
 *  - route: /health (pubblica), /me, /engagements
 *  - error handler: ZodError -> 400; resto -> 500 (senza leak interni)
 */
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { ZodError } from 'zod';
import { config } from './config.js';
import { startQueue } from './queue.js';
import { registerAuthenticate } from './context/authenticate.js';
import { healthRoutes } from './routes/health.js';
import { meRoutes } from './routes/me.js';
import { engagementRoutes } from './routes/engagements.js';
import { companyRoutes } from './routes/companies.js';
import { companyDedupRoutes } from './routes/companyDedup.js';
import { assetRoutes } from './routes/assets.js';
import { resourceRoutes } from './routes/resources.js';
import { materialRoutes } from './routes/materials.js';
import { lookupRoutes } from './routes/lookups.js';
import { phaseRoutes } from './routes/phases.js';
import { activityRoutes } from './routes/activities.js';
import { timeEntryRoutes } from './routes/timeEntries.js';
import { consumptionRoutes } from './routes/consumptions.js';
import { scheduleRoutes } from './routes/schedule.js';
import { templateRoutes } from './routes/templates.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { notificationRoutes } from './routes/notifications.js';
import { captureRoutes } from './routes/captures.js';
import { fieldDefinitionRoutes } from './routes/fieldDefinitions.js';
import { numberSeriesRoutes } from './routes/numberSeries.js';
import { roleRoutes } from './routes/roles.js';
import { userRoutes } from './routes/users.js';
import { billingRoutes } from './routes/billing.js';
import { narrativeRoutes } from './routes/narrative.js';
import { platformRoutes } from './routes/platform.js';
import { settingsRoutes } from './routes/settings.js';
import { stockRoutes } from './routes/stock.js';
import { absenceRoutes } from './routes/absences.js';
import { timeTrackingRoutes } from './routes/timeTracking.js';
import { workReportRoutes } from './routes/workReports.js';
import { budgetRoutes } from './routes/budget.js';
import { workOrderRoutes } from './routes/workOrders.js';
import { serialRoutes } from './routes/serials.js';
import { siteRoutes } from './routes/sites.js';
import { priceRoutes } from './routes/prices.js';
import { workLineRoutes } from './routes/workLines.js';
import { financeRoutes } from './routes/finance.js';
import { exportPresetRoutes } from './routes/exportPresets.js';
import { listFilterRoutes } from './routes/listFilter.js';
import { stockAssistRoutes } from './routes/stockAssist.js';
import { savedViewRoutes } from './routes/savedViews.js';
import { listPresetRoutes } from './routes/listPresets.js';
import { savedReportRoutes } from './routes/savedReports.js';
import { taxRateRoutes } from './routes/taxRates.js';
import { materialCatalogRoutes } from './routes/materialCatalog.js';
import { unitOfMeasureRoutes } from './routes/unitsOfMeasure.js';
import { warehouseRoutes } from './routes/warehouse.js';
import { resourceExtrasRoutes } from './routes/resourceExtras.js';
import { auditRoutes } from './routes/audit.js';

async function build() {
  const app = Fastify({
    logger: {
      level: config.nodeEnv === 'production' ? 'info' : 'debug',
      transport: config.nodeEnv === 'production' ? undefined : { target: 'pino-pretty' },
    },
  });

  await app.register(cors, {
    origin: config.cors.origin === '*' ? true : config.cors.origin.split(','),
    credentials: true,
  });
  await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024 } }); // audio capture ≤ 25MB

  app.setErrorHandler((err, request, reply) => {
    if (err instanceof ZodError) {
      // messaggio leggibile per l'utente: elenca i campi non validi (it-IT)
      const tr = (m: string) => {
        if (/required/i.test(m)) return 'obbligatorio';
        if (/invalid uuid/i.test(m)) return 'selezione non valida';
        if (/invalid email/i.test(m)) return 'email non valida';
        if (/expected number|nan|number/i.test(m)) return 'deve essere un numero';
        if (/at least|maggiore|greater|>/i.test(m)) return 'valore non valido';
        return m;
      };
      const issues = err.issues.map((i) => ({ path: i.path.filter((p) => p !== 'lines' || true).join('.'), message: i.message }));
      const summary = issues.map((i) => `${i.path || 'campo'}: ${tr(i.message)}`).join(' · ');
      return reply.code(400).send({
        error: 'bad_request',
        message: summary ? `Dati non validi — ${summary}` : 'Dati non validi',
        statusCode: 400,
        issues,
      });
    }
    // ── Integrità referenziale e unicità (regole canoniche del DB) ──────
    const pg = err as { code?: string; detail?: string; table?: string; constraint?: string };
    // mappa tabella tecnica → nome leggibile (per messaggi professionali)
    const ENTITY_IT: Record<string, string> = {
      material: 'articoli', material_supplier: 'fornitori articolo', material_image: 'immagini articolo',
      material_category: 'categorie articolo', stock_movement: 'movimenti di magazzino', stock_balance: 'giacenze',
      stock_document: 'documenti di magazzino', stock_document_line: 'righe documento', stock_serial_unit: 'unità seriali',
      stock_lot: 'lotti', stock_count: 'conteggi', stock_count_line: 'righe conteggio', stock_location: 'magazzini/ubicazioni',
      purchase_order: "ordini d'acquisto", purchase_order_line: "righe ordine d'acquisto",
      pick_list: 'pick list', pick_list_line: 'righe pick list', resource: 'risorse', resource_skill: 'competenze risorsa',
      resource_certification: 'certificazioni', skill: 'competenze', company: 'soggetti', company_role: 'ruoli soggetto',
      company_contact: 'contatti', site: 'siti', asset: 'asset', engagement: 'commesse', phase: 'fasi', activity: 'attività',
      work_order: 'ordini di lavoro', work_order_item: 'apparati ordine', work_order_subject: 'intestatari',
      time_entry: 'ore', work_line: 'lavorazioni', material_consumption: 'consumi', tax_rate: 'aliquote IVA',
      unit_of_measure: 'unità di misura', price_list_item: 'voci di listino', app_user: 'utenti', role: 'ruoli', user_role: 'assegnazioni ruolo',
    };

    // raise_exception dai trigger anti-ciclo degli alberi (STANDARD entità ad albero §3)
    if (pg.code === 'P0001' && /ciclo non ammesso/i.test((err as Error).message)) {
      return reply.code(409).send({
        error: 'conflict',
        message: 'Spostamento non consentito: non puoi mettere una voce dentro una sua stessa sotto-voce.',
        statusCode: 409,
      });
    }
    if (pg.code === '23503') { // foreign_key_violation: il record è ancora referenziato → non cancellabile
      const m = /referenced from table "([^"]+)"/.exec(pg.detail ?? '');
      const refTable = m?.[1];
      const where = refTable ? (ENTITY_IT[refTable] ?? refTable) : 'altre entità';
      return reply.code(409).send({
        error: 'conflict',
        message: `Impossibile eliminare: il record è utilizzato in ${where}. Rimuovi prima i collegamenti, poi riprova.`,
        statusCode: 409,
      });
    }
    if (pg.code === '23505') { // unique_violation: chiave duplicata → mai consentita
      // detail tipico: «Key (tenant_id, code)=(…, pz) already exists.»
      const dv = /\)=\(([^)]*)\) already exists/.exec(pg.detail ?? '');
      const raw = dv?.[1]?.split(',').map((s) => s.trim()).filter((s) => s && !/^[0-9a-f-]{36}$/i.test(s));
      const val = raw && raw.length ? raw.join(' · ') : null;
      const where = pg.table ? ENTITY_IT[pg.table] : undefined;
      const subj = where ? ` in ${where}` : '';
      return reply.code(409).send({
        error: 'conflict',
        message: val
          ? `Valore duplicato${subj}: «${val}» esiste già. Scegli un valore diverso.`
          : `Esiste già un record con questi dati${subj}: scegli un valore diverso.`,
        statusCode: 409,
      });
    }

    request.log.error(err);
    const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
    return reply.code(statusCode).send({
      error: statusCode >= 500 ? 'internal_error' : 'error',
      message: statusCode >= 500 ? 'Errore interno' : (err as Error).message,
      statusCode,
    });
  });

  registerAuthenticate(app);
  await app.register(healthRoutes);
  await app.register(meRoutes);
  await app.register(lookupRoutes);
  await app.register(engagementRoutes);
  await app.register(companyRoutes);
  await app.register(companyDedupRoutes);
  await app.register(assetRoutes);
  await app.register(resourceRoutes);
  await app.register(materialRoutes);
  await app.register(phaseRoutes);
  await app.register(activityRoutes);
  await app.register(timeEntryRoutes);
  await app.register(consumptionRoutes);
  await app.register(scheduleRoutes);
  await app.register(templateRoutes);
  await app.register(dashboardRoutes);
  await app.register(notificationRoutes);
  await app.register(captureRoutes);
  await app.register(fieldDefinitionRoutes);
  await app.register(numberSeriesRoutes);
  await app.register(roleRoutes);
  await app.register(userRoutes);
  await app.register(billingRoutes);
  await app.register(narrativeRoutes);
  await app.register(platformRoutes);
  await app.register(settingsRoutes);
  await app.register(stockRoutes);
  await app.register(absenceRoutes);
  await app.register(timeTrackingRoutes);
  await app.register(workReportRoutes);
  await app.register(budgetRoutes);
  await app.register(workOrderRoutes);
  await app.register(serialRoutes);
  await app.register(siteRoutes);
  await app.register(priceRoutes);
  await app.register(workLineRoutes);
  await app.register(financeRoutes);
  await app.register(exportPresetRoutes);
  await app.register(listFilterRoutes);
  await app.register(stockAssistRoutes);
  await app.register(savedViewRoutes);
  await app.register(listPresetRoutes);
  await app.register(savedReportRoutes);
  await app.register(taxRateRoutes);
  await app.register(materialCatalogRoutes);
  await app.register(unitOfMeasureRoutes);
  await app.register(warehouseRoutes);
  await app.register(resourceExtrasRoutes);
  await app.register(auditRoutes);

  return app;
}

build()
  .then((app) =>
    app.listen({ host: '0.0.0.0', port: config.port }).then(() => {
      app.log.info(`siSuite backend in ascolto su :${config.port}`);
      void startQueue(); // coda asincrona per le capture vocali (tollerante)
    }),
  )
  .catch((err) => {
    console.error('Avvio backend fallito:', err);
    process.exit(1);
  });
