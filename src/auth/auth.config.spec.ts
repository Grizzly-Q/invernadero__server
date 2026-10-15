import { authConfig } from './auth.config';

describe('Configuración de autenticación', () => {
  const original = { ...process.env };

  beforeEach(() => {
    process.env = { ...original };
    process.env.JWT_SECRET = 'secreto-exclusivo-de-pruebas-con-32-bytes';
    delete process.env.JWT_ACCESS_TTL_SECONDS;
  });

  afterAll(() => {
    process.env = original;
  });

  it('impide arrancar sin un secreto válido', () => {
    delete process.env.JWT_SECRET;
    expect(authConfig).toThrow('JWT_SECRET');
    process.env.JWT_SECRET = 'corto';
    expect(authConfig).toThrow('JWT_SECRET');
  });

  it.each(['0', '-1', 'NaN', '1.5', 'Infinity'])(
    'rechaza duraciones inválidas (%s)',
    (value) => {
      process.env.JWT_ACCESS_TTL_SECONDS = value;
      expect(authConfig).toThrow('JWT_ACCESS_TTL_SECONDS');
    },
  );

  it('utiliza 15 minutos de validez para el JWT por defecto', () => {
    expect(authConfig()).toMatchObject({ accessTtl: 900 });
  });
});
