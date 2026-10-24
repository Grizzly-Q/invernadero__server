import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { validateEnvironment } from './environment.validation';

describe('Validación de variables de entorno', () => {
  const validEnvironment = {
    DATABASE_URL: 'postgresql://usuario:clave@localhost:5432/invernadero',
    JWT_SECRET: 'secreto-exclusivo-de-pruebas-con-32-bytes',
    TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  };

  it.each(['postgres', 'postgresql'])(
    'acepta el protocolo %s y conserva las variables adicionales',
    (protocol) => {
      const environment = {
        ...validEnvironment,
        DATABASE_URL: `${protocol}://usuario:clave@localhost:5432/invernadero`,
        PORT: '3000',
      };
      expect(validateEnvironment(environment)).toEqual(environment);
    },
  );

  it.each([
    undefined,
    '',
    '   ',
    'no-es-una-url',
    'https://proyecto.supabase.co/postgres',
    'mysql://usuario:clave@localhost/invernadero',
    'postgresql:///invernadero',
    'postgresql://localhost',
    'postgresql://localhost/',
    ' postgresql://localhost/invernadero ',
  ])('rechaza una URL PostgreSQL ausente o inválida (%s)', (databaseUrl) => {
    expect(() =>
      validateEnvironment({ ...validEnvironment, DATABASE_URL: databaseUrl }),
    ).toThrow('DATABASE_URL');
  });

  it.each([undefined, '', 'corto', ' '.repeat(32)])(
    'rechaza un secreto JWT ausente o inválido (%s)',
    (secret) => {
      expect(() =>
        validateEnvironment({ ...validEnvironment, JWT_SECRET: secret }),
      ).toThrow('JWT_SECRET');
    },
  );

  it('no expone credenciales en el error de la URL', () => {
    const environment = {
      ...validEnvironment,
      DATABASE_URL: 'https://usuario:clave-privada@localhost/invernadero',
    };
    expect(() => validateEnvironment(environment)).toThrow('DATABASE_URL');
    expect(() => validateEnvironment(environment)).not.toThrow('clave-privada');
  });

  it('valida el secreto en bytes y conserva su contenido original', () => {
    const environment = { ...validEnvironment, JWT_SECRET: 'á'.repeat(16) };
    expect(validateEnvironment(environment).JWT_SECRET).toBe(
      environment.JWT_SECRET,
    );
  });

  it('informa las dos variables inválidas en el mismo error', () => {
    expect(() => validateEnvironment({})).toThrow('DATABASE_URL');
    expect(() => validateEnvironment({})).toThrow('JWT_SECRET');
  });

  it.each([
    'postgresql://usuario:clave@[::1]:5432/invernadero',
    'postgresql://usuario:cl%40ve@localhost/invernadero?sslmode=require',
  ])('acepta IPv6 y credenciales codificadas (%s)', (databaseUrl) => {
    const environment = { ...validEnvironment, DATABASE_URL: databaseUrl };
    expect(validateEnvironment(environment)).toEqual(environment);
  });

  it('permite que ConfigService lea las variables validadas sin conectarse a la base', async () => {
    const originalEnvironment = process.env;
    process.env = { ...validEnvironment };
    try {
      const module = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            ignoreEnvFile: true,
            validate: validateEnvironment,
          }),
        ],
      }).compile();
      try {
        expect(module.get(ConfigService).get<string>('DATABASE_URL')).toBe(
          validEnvironment.DATABASE_URL,
        );
      } finally {
        await module.close();
      }
    } finally {
      process.env = originalEnvironment;
    }
  });
});
