import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

/** Valida mensajes de sockets con las mismas reglas estrictas que los DTOs HTTP. */
export function validateMessage<T extends object>(
  type: new () => T,
  payload: unknown,
): T {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    throw new BadRequestException('Mensaje inválido.');
  const message = plainToInstance(type, payload);
  if (
    validateSync(message, {
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
    }).length
  )
    throw new BadRequestException(
      'El mensaje contiene campos o valores inválidos.',
    );
  return message;
}
