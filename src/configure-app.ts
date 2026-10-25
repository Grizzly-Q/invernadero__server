import {
  BadRequestException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import type { ValidationError } from 'class-validator';

const propertyLabels: Record<string, string> = {
  email: 'El correo',
  password: 'La contraseña',
  name: 'El nombre',
  greenhouseId: 'El invernadero',
  active: 'El estado',
  beforeId: 'El cursor',
  type: 'El tipo',
  unit: 'La unidad',
  period: 'El periodo',
  from: 'La fecha inicial',
  to: 'La fecha final',
  groupBy: 'La agrupación',
  page: 'La página',
  limit: 'El límite',
  sensorId: 'El sensor',
  readingId: 'El identificador de lectura',
  measuredAt: 'La fecha de medición',
  value: 'El valor',
  readings: 'Las lecturas',
  intervalMs: 'El intervalo',
  requestId: 'El identificador de solicitud',
  accepted: 'La confirmación',
  sequence: 'La secuencia',
  databaseUserId: 'El usuario de base de datos',
  expiresAt: 'La fecha de vencimiento',
};

/** Traduce las restricciones predeterminadas de class-validator y conserva mensajes personalizados en español. */
function translateConstraint(
  property: string,
  constraint: string,
  message: string,
): string {
  if (/debe|inválid|reservad|caracteres/i.test(message)) return message;
  const label = propertyLabels[property] ?? `El campo "${property}"`;
  const limit = message.match(/\d+(?:\.\d+)?/)?.[0];

  switch (constraint) {
    case 'isEmail':
      return `${label} debe tener un formato de correo válido.`;
    case 'isString':
      return `${label} debe ser texto.`;
    case 'minLength':
      return `${label} debe tener al menos ${limit ?? 'el mínimo requerido'} caracteres.`;
    case 'maxLength':
      return `${label} no debe superar ${limit ?? 'el máximo permitido'} caracteres.`;
    case 'min':
      return `${label} debe ser mayor o igual a ${limit ?? 'el mínimo permitido'}.`;
    case 'max':
      return `${label} debe ser menor o igual a ${limit ?? 'el máximo permitido'}.`;
    case 'isInt':
      return `${label} debe ser un número entero.`;
    case 'isNumber':
      return `${label} debe ser un número válido.`;
    case 'isBoolean':
      return `${label} debe ser verdadero o falso.`;
    case 'isArray':
      return `${label} debe ser una lista.`;
    case 'arrayMinSize':
      return `${label} debe contener al menos ${limit ?? 'un elemento'}.`;
    case 'arrayMaxSize':
      return `${label} no debe contener más de ${limit ?? 'el máximo permitido'} elementos.`;
    case 'isIn':
      return `${label} contiene un valor no permitido.`;
    case 'isISO8601':
      return `${label} debe ser una fecha válida en formato ISO 8601.`;
    case 'matches':
      return `${label} tiene un formato no válido.`;
    case 'isUUID':
      return `${label} debe ser un UUID válido.`;
    case 'equals':
      return `${label} tiene un valor no válido.`;
    case 'isNotEmpty':
      return `${label} no puede estar vacío.`;
    case 'isDefined':
      return `${label} es obligatorio.`;
    case 'whitelistValidation':
      return `La propiedad "${property}" no está permitida.`;
    case 'unknownValue':
      return 'El cuerpo de la solicitud contiene datos no válidos.';
    default:
      return `${label} no es válido.`;
  }
}

function validationMessages(errors: ValidationError[]): string[] {
  return errors.flatMap((error) => [
    ...Object.entries(error.constraints ?? {}).map(([constraint, message]) =>
      translateConstraint(error.property, constraint, message),
    ),
    ...validationMessages(error.children ?? []),
  ]);
}

/**
 * Configura CORS para el proyecto React local y aplica la validación global de entradas.
 * @param app Instancia NestJS que recibe el middleware HTTP y el pipe de validación.
 * @returns Sin contenido; modifica la configuración de la aplicación antes de iniciarla.
 */
export function configureApp(app: INestApplication): void {
  // React usa JWT en Authorization; no necesita cookies ni credenciales de sesión del navegador.
  app.enableCors({
    origin: ['http://localhost:5173'],
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    credentials: false,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors) =>
        new BadRequestException(validationMessages(errors)),
    }),
  );
}
