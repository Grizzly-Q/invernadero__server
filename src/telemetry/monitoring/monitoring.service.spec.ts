import { UnauthorizedException } from '@nestjs/common';
import type { AuthService } from '../../auth/auth.service';
import type { ControllerCredentialsService } from '../../controllers/controller-credentials.service';
import { Role } from '../../users/role.enum';
import { SensorEntity } from '../entities/sensor.entity';
import type { MonitoringAccessService } from './monitoring-access.service';
import { MonitoringService } from './monitoring.service';

describe('Revocación durante la autorización de monitoreo', () => {
  it('no inicia un sensor si la sesión se cerró mientras PostgreSQL comprobaba permisos', async () => {
    let valid = true;
    let release!: (sensor: SensorEntity) => void;
    let entered!: () => void;
    const databasePending = new Promise<SensorEntity>((resolve) => {
      release = resolve;
    });
    const databaseEntered = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const auth = {
      authenticate: jest.fn(() =>
        valid
          ? Promise.resolve({
              user: { id: 'usuario', role: Role.ADMIN },
              sessionId: 'sesion',
            })
          : Promise.reject(new UnauthorizedException()),
      ),
    };
    const access = {
      sensor: jest.fn(() => {
        entered();
        return databasePending;
      }),
    };
    const service = new MonitoringService(
      auth as unknown as AuthService,
      {} as ControllerCredentialsService,
      access as unknown as MonitoringAccessService,
    );
    await service.addViewer('conexion', 'jwt-ficticio', jest.fn(), jest.fn());
    const attempt = service.start('conexion', { sensorId: '1' });
    await databaseEntered;
    valid = false;
    release(Object.assign(new SensorEntity(), { id: '1', controllerId: '1' }));
    await expect(attempt).rejects.toThrow(UnauthorizedException);
    expect(service.sessions.sensors('conexion')).toEqual([]);
    service.close();
  });
});
