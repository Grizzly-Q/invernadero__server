import { origenMonitoreoPermitido } from './origen-monitoreo';

describe('Origen del canal de monitoreo', () => {
  const origins = ['http://localhost:5173', 'https://app.example.test'];
  it.each(origins)('permite el origen configurado %s', (origin) => {
    expect(origenMonitoreoPermitido(origin, origins)).toBe(true);
  });
  it('permite clientes nativos sin Origin sin otorgarles autenticación', () => {
    expect(origenMonitoreoPermitido(undefined, origins)).toBe(true);
  });
  it.each([
    'null',
    '',
    'https://ajeno.test',
    'https://app.example.test.ajeno.test',
    'http://localhost:5174',
    'http://localhost:5173/',
    ['http://localhost:5173'],
  ])('rechaza un origen no autorizado %#', (origin) => {
    expect(origenMonitoreoPermitido(origin, origins)).toBe(false);
  });
});
