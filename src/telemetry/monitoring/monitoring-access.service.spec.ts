import { ForbiddenException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import type { GreenhouseAccessService } from '../../greenhouses/greenhouse-access.service';
import { MonitoringAccessService } from './monitoring-access.service';

/** Impide que historial y conexiones en vivo compartan el antiguo acceso administrativo global. */
describe('Acceso a sensores por invernadero', () => {
  const sensor = { id: '1', controller: { greenhouseId: '7' } };
  const repository = { findOne: jest.fn() };
  const access = { require: jest.fn() };
  const service = new MonitoringAccessService(
    { getRepository: () => repository } as unknown as DataSource,
    access as unknown as GreenhouseAccessService,
  );
  const user = { id: 'ana', name: 'Ana', email: 'ana@example.com' };
  beforeEach(() => {
    jest.clearAllMocks();
    repository.findOne.mockResolvedValue(sensor);
  });
  it('comprueba el propietario real del sensor para cualquier cuenta', async () => {
    access.require.mockResolvedValueOnce('OPERATOR');
    await expect(service.sensor(user, '1')).resolves.toEqual(sensor);
    expect(access.require).toHaveBeenCalledWith('ana', '7');
  });
  it('deniega sensores ajenos aunque la persona administre otro invernadero', async () => {
    access.require.mockRejectedValueOnce(new ForbiddenException());
    await expect(service.sensor(user, '1')).rejects.toThrow(ForbiddenException);
  });
});
