import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { GreenhouseStatusDto, UpdateGreenhouseDto } from './greenhouse.dto';

/** Verifica el contrato HTTP real, incluidos transformaciones, campos ajenos y borrado explícito de opcionales. */
describe('Edición y estado de invernaderos: validación', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  const update = (value: unknown) =>
    pipe.transform(value, { type: 'body', metatype: UpdateGreenhouseDto });
  const status = (value: unknown) =>
    pipe.transform(value, { type: 'body', metatype: GreenhouseStatusDto });

  it('acepta cambios parciales, nombres recortados y opcionales nulos', async () => {
    await expect(
      update({ name: ' Norte ', height: null, description: null }),
    ).resolves.toMatchObject({
      name: 'Norte',
      height: null,
      description: null,
    });
    await expect(update({})).resolves.toEqual({});
  });

  it.each([
    { name: null },
    { name: ' ' },
    { location: null },
    { length: null },
    { length: 0 },
    { width: 2.333 },
    { height: -1 },
    { description: 'a'.repeat(501) },
    { name: 'a'.repeat(101) },
  ])('rechaza un cambio inválido %#', async (value) => {
    await expect(update(value)).rejects.toThrow(BadRequestException);
  });

  it.each(['status', 'role', 'userId', 'ownerId', 'operationMode'])(
    'no permite modificar %s mediante edición',
    async (field) => {
      await expect(update({ [field]: 'Activo' })).rejects.toThrow(
        BadRequestException,
      );
    },
  );

  it('respeta los límites Unicode y numéricos del DTO de creación', async () => {
    await expect(
      update({
        name: '🌱'.repeat(100),
        location: 'L'.repeat(200),
        length: 0.01,
        width: 999999.99,
        height: 2.25,
        description: '🌱'.repeat(500),
      }),
    ).resolves.toBeDefined();
  });

  it.each(['Activo', 'EnMantenimiento', 'Desactivado'])(
    'admite la transición explícita a %s',
    async (value) => {
      await expect(status({ status: value })).resolves.toHaveProperty(
        'status',
        value,
      );
    },
  );

  it.each([
    {},
    { status: 'Eliminado' },
    { status: null },
    { status: 'Desactivado', active: true },
  ])('rechaza un cuerpo de estado inválido %#', async (value) => {
    await expect(status(value)).rejects.toThrow(BadRequestException);
  });
});
