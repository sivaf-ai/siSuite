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
import { savedViewRoutes } from './routes/savedViews.js';
import { listPresetRoutes } from './routes/listPresets.js';

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
      return reply.code(400).send({
        error: 'bad_request',
        message: 'Dati non validi',
        statusCode: 400,
        issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
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
  await app.register(savedViewRoutes);
  await app.register(listPresetRoutes);

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
