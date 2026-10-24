import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ControllersModule } from '../controllers/controllers.module';
import { MonitoringAdminController } from './monitoring/monitoring-admin.controller';
import { MonitoringAccessService } from './monitoring/monitoring-access.service';
import { MonitoringService } from './monitoring/monitoring.service';
import { MonitoringTransport } from './monitoring/monitoring.transport';
import { TelemetryController } from './telemetry.controller';
import { TelemetryService } from './telemetry.service';
import { HistoryController } from './history.controller';
import { HistoryService } from './history.service';

/** Agrupa el historial de mediciones y el monitoreo en vivo con sus respectivas autorizaciones. */
@Module({
  imports: [AuthModule, ControllersModule],
  controllers: [
    TelemetryController,
    HistoryController,
    MonitoringAdminController,
  ],
  providers: [
    TelemetryService,
    HistoryService,
    MonitoringAccessService,
    MonitoringService,
    MonitoringTransport,
  ],
  exports: [MonitoringService],
})
export class TelemetryModule {}
