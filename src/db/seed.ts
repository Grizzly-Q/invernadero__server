import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { faker } from '@faker-js/faker';
import { PasswordService } from '../auth/password.service';
import { AppModule } from '../app.module';

faker.seed(20261022);

type SensorSeed = {
  id: string;
  tipo: string;
  controlador: string;
};

async function seed() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const dataSource = app.get(DataSource);
    const passwords = app.get(PasswordService);

    await dataSource.transaction(async (manager) => {
      console.log('Iniciando seeder...');

      const usuarios = [
        {
          nombre: 'seed_admin_demo',
          contrasena: 'AdminDemo2026!',
          rol: 'Administrador',
        },
        {
          nombre: 'seed_operador_demo',
          contrasena: 'OperadorDemo2026!',
          rol: 'Operador',
        },
      ];

      const idsUsuarios: string[] = [];

      for (const usuario of usuarios) {
        const existente = await manager.query<Record<string, string>[]>(
          `SELECT "idUsuario_Usuario"
           FROM "Usuario"
           WHERE "nombreUsuario" = $1`,
          [usuario.nombre],
        );

        if (existente.length > 0) {
          idsUsuarios.push(String(existente[0].idUsuario_Usuario));
          continue;
        }

        const hash = await passwords.hash(usuario.contrasena);

        const resultado = await manager.query<Record<string, string>[]>(
          `INSERT INTO "Usuario"
             ("nombreUsuario", "contrasena", "rol")
           VALUES ($1, $2, $3)
           RETURNING "idUsuario_Usuario"`,
          [usuario.nombre, hash, usuario.rol],
        );

        idsUsuarios.push(String(resultado[0].idUsuario_Usuario));
      }

      const datosInvernaderos = [
        {
          nombre: 'Invernadero Demo 01',
          ubicacion: 'Zona Norte',
        },
        {
          nombre: 'Invernadero Demo 02',
          ubicacion: 'Zona Sur',
        },
      ];

      const idsInvernaderos: string[] = [];

      for (const invernadero of datosInvernaderos) {
        const existente = await manager.query<Record<string, string>[]>(
          `SELECT "idInvernadero_Invernadero"
           FROM "Invernadero"
           WHERE "nombre_Invernadero" = $1
             AND "ubicacion" = $2`,
          [invernadero.nombre, invernadero.ubicacion],
        );

        if (existente.length > 0) {
          idsInvernaderos.push(String(existente[0].idInvernadero_Invernadero));
          continue;
        }

        const resultado = await manager.query<Record<string, string>[]>(
          `INSERT INTO "Invernadero"
             ("nombre_Invernadero", "ubicacion",
              "largo", "ancho", "alto", "descripcion")
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING "idInvernadero_Invernadero"`,
          [
            invernadero.nombre,
            invernadero.ubicacion,
            faker.number.float({
              min: 10,
              max: 30,
              fractionDigits: 2,
            }),
            faker.number.float({
              min: 5,
              max: 15,
              fractionDigits: 2,
            }),
            faker.number.float({
              min: 2,
              max: 6,
              fractionDigits: 2,
            }),
            faker.lorem.sentence(),
          ],
        );

        idsInvernaderos.push(String(resultado[0].idInvernadero_Invernadero));
      }

      for (let i = 0; i < idsInvernaderos.length; i++) {
        await manager.query(
          `INSERT INTO "UsuarioInvernadero"
             ("idUsuario_UsuarioInvernadero",
              "idInvernadero_UsuarioInvernadero")
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [idsUsuarios[i], idsInvernaderos[i]],
        );
      }

      const idsControladores: string[] = [];

      for (const idInvernadero of idsInvernaderos) {
        const existente = await manager.query<Record<string, string>[]>(
          `SELECT "idControlador_Controlador"
           FROM "Controlador"
           WHERE "idInvernadero_Controlador" = $1`,
          [idInvernadero],
        );

        if (existente.length > 0) {
          idsControladores.push(String(existente[0].idControlador_Controlador));
          continue;
        }

        const resultado = await manager.query<Record<string, string>[]>(
          `INSERT INTO "Controlador"
             ("idInvernadero_Controlador",
              "estadoConexion_Controlador")
           VALUES ($1, $2)
           RETURNING "idControlador_Controlador"`,
          [idInvernadero, 'Conectado'],
        );

        idsControladores.push(String(resultado[0].idControlador_Controlador));
      }

      const tiposSensores = ['HumedadAmbiental', 'HumedadSuelo', 'NivelAgua'];

      const sensores: SensorSeed[] = [];

      for (const idControlador of idsControladores) {
        for (const tipo of tiposSensores) {
          const existente = await manager.query<Record<string, string>[]>(
            `SELECT "idSensor_Sensor"
             FROM "Sensor"
             WHERE "idControlador_Sensor" = $1
               AND "tipoSensor" = $2`,
            [idControlador, tipo],
          );

          let idSensor: string;

          if (existente.length > 0) {
            idSensor = String(existente[0].idSensor_Sensor);
          } else {
            const resultado = await manager.query<Record<string, string>[]>(
              `INSERT INTO "Sensor"
                 ("idControlador_Sensor",
                  "tipoSensor", "unidadMedida",
                  "estadoConexion_Sensor")
               VALUES ($1, $2, $3, $4)
               RETURNING "idSensor_Sensor"`,
              [idControlador, tipo, '%', 'Conectado'],
            );

            idSensor = String(resultado[0].idSensor_Sensor);
          }

          sensores.push({
            id: idSensor,
            tipo,
            controlador: idControlador,
          });
        }
      }

      for (const sensor of sensores) {
        let minimo: number;
        let maximo: number;

        switch (sensor.tipo) {
          case 'HumedadAmbiental':
            minimo = 40;
            maximo = 80;
            break;

          case 'HumedadSuelo':
            minimo = 30;
            maximo = 70;
            break;

          default:
            minimo = 20;
            maximo = 90;
        }

        await manager.query(
          `INSERT INTO "LimiteSensor"
             ("idSensor_LimiteSensor",
              "limiteMinimo", "limiteMaximo")
           VALUES ($1, $2, $3)
           ON CONFLICT ("idSensor_LimiteSensor")
           DO NOTHING`,
          [sensor.id, minimo, maximo],
        );
      }

      const fechaBase = Date.UTC(2026, 9, 1, 12, 0, 0);

      for (let i = 0; i < sensores.length; i++) {
        const sensor = sensores[i];

        for (let muestra = 0; muestra < 3; muestra++) {
          let valor: number;

          switch (sensor.tipo) {
            case 'HumedadAmbiental':
              valor = faker.number.float({
                min: 45,
                max: 75,
                fractionDigits: 2,
              });
              break;

            case 'HumedadSuelo':
              valor = faker.number.float({
                min: 35,
                max: 65,
                fractionDigits: 2,
              });
              break;

            default:
              valor = faker.number.float({
                min: 25,
                max: 85,
                fractionDigits: 2,
              });
          }

          const fechaHora = new Date(fechaBase - muestra * 60 * 60 * 1000)
            .toISOString()
            .slice(0, 19)
            .replace('T', ' ');

          await manager.query(
            `INSERT INTO "Medicion"
               ("idSensor_Medicion",
                "fechaHora", "valor")
             VALUES ($1, $2, $3)
             ON CONFLICT
               ("idSensor_Medicion", "fechaHora")
             DO NOTHING`,
            [sensor.id, fechaHora, valor],
          );
        }
      }

      const idsConfiguraciones: string[] = [];

      for (let i = 0; i < idsInvernaderos.length; i++) {
        const esHorario = i === 1;

        const nombre = `Riego Demo 0${i + 1}`;
        const tipoProgramacion = esHorario ? 'Horario' : 'Intervalo';

        const existente = await manager.query<Record<string, string>[]>(
          `SELECT
             "idConfiguracionRiego_ConfiguracionRiego"
           FROM "ConfiguracionRiego"
           WHERE "idInvernadero_ConfiguracionRiego" = $1
             AND "nombre_ConfiguracionRiego" = $2`,
          [idsInvernaderos[i], nombre],
        );

        let idConfiguracion: string;

        if (existente.length > 0) {
          idConfiguracion = String(
            existente[0].idConfiguracionRiego_ConfiguracionRiego,
          );
        } else {
          const resultado = await manager.query<Record<string, string>[]>(
            `INSERT INTO "ConfiguracionRiego"
               ("idInvernadero_ConfiguracionRiego",
                "nombre_ConfiguracionRiego",
                "humedadActivacion",
                "tipoProgramacion", "activa",
                "duracionRiego", "intervaloTiempo")
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING
               "idConfiguracionRiego_ConfiguracionRiego"`,
            [
              idsInvernaderos[i],
              nombre,
              35,
              tipoProgramacion,
              false,
              10,
              esHorario ? null : 60,
            ],
          );

          idConfiguracion = String(
            resultado[0].idConfiguracionRiego_ConfiguracionRiego,
          );
        }

        idsConfiguraciones.push(idConfiguracion);

        if (esHorario) {
          for (const hora of ['08:00:00', '16:00:00']) {
            await manager.query(
              `INSERT INTO "HorarioRiego"
                 ("idConfiguracionRiego_HorarioRiego",
                  "hora")
               VALUES ($1, $2)
               ON CONFLICT DO NOTHING`,
              [idConfiguracion, hora],
            );
          }
        }
      }

      const fechaNotificacion = '2026-10-01 10:00:00';

      for (const sensor of sensores) {
        const existente = await manager.query<Record<string, string>[]>(
          `SELECT "idNotificacion"
           FROM "Notificacion"
           WHERE "idSensor_Notificacion" = $1
             AND "tipoNotificacion" = $2
             AND "fechaHoraGeneracion" = $3`,
          [sensor.id, 'Umbral de prueba', fechaNotificacion],
        );

        if (existente.length > 0) {
          continue;
        }

        await manager.query(
          `INSERT INTO "Notificacion"
             ("idSensor_Notificacion",
              "tipoNotificacion", "valorDetectado",
              "fechaHoraGeneracion", "estado_Notificacion")
           VALUES ($1, $2, $3, $4, $5)`,
          [sensor.id, 'Prueba', 25, fechaNotificacion, 'Pendiente'],
        );
      }

      const fechaInicioManual = '2026-10-01 09:00:00';
      const fechaFinManual = '2026-10-01 09:10:00';

      const fechaInicioAuto = '2026-10-01 11:00:00';
      const fechaFinAuto = '2026-10-01 11:10:00';

      for (let i = 0; i < idsInvernaderos.length; i++) {
        const idInvernadero = idsInvernaderos[i];

        const manualExistente = await manager.query<Record<string, string>[]>(
          `SELECT "idEjecucionRiego"
           FROM "EjecucionRiego"
           WHERE "idInvernadero_EjecucionRiego" = $1
             AND "idUsuario_EjecucionRiego" = $2
             AND "idConfiguracionRiego_EjecucionRiego" IS NULL
             AND "fechaHoraInicio" = $3
             AND "modoEjecucion" = $4`,
          [idInvernadero, idsUsuarios[i], fechaInicioManual, 'Manual'],
        );

        if (manualExistente.length === 0) {
          await manager.query(
            `INSERT INTO "EjecucionRiego"
               ("idInvernadero_EjecucionRiego",
                "idUsuario_EjecucionRiego",
                "idConfiguracionRiego_EjecucionRiego",
                "fechaHoraInicio", "fechaHoraFin",
                "duracionProgramada", "modoEjecucion",
                "estadoRiego")
             VALUES ($1, $2, NULL, $3, $4, $5, $6, $7)`,
            [
              idInvernadero,
              idsUsuarios[i],
              fechaInicioManual,
              fechaFinManual,
              10,
              'Manual',
              'Finalizado',
            ],
          );
        }

        const autoExistente = await manager.query<Record<string, string>[]>(
          `SELECT "idEjecucionRiego"
           FROM "EjecucionRiego"
           WHERE "idInvernadero_EjecucionRiego" = $1
             AND "idUsuario_EjecucionRiego" IS NULL
             AND "idConfiguracionRiego_EjecucionRiego" = $2
             AND "fechaHoraInicio" = $3
             AND "modoEjecucion" = $4`,
          [idInvernadero, idsConfiguraciones[i], fechaInicioAuto, 'Automatico'],
        );

        if (autoExistente.length === 0) {
          await manager.query(
            `INSERT INTO "EjecucionRiego"
               ("idInvernadero_EjecucionRiego",
                "idUsuario_EjecucionRiego",
                "idConfiguracionRiego_EjecucionRiego",
                "fechaHoraInicio", "fechaHoraFin",
                "duracionProgramada", "modoEjecucion",
                "estadoRiego")
             VALUES ($1, NULL, $2, $3, $4, $5, $6, $7)`,
            [
              idInvernadero,
              idsConfiguraciones[i],
              fechaInicioAuto,
              fechaFinAuto,
              10,
              'Automatico',
              'Finalizado',
            ],
          );
        }
      }

      console.log('Datos de prueba procesados correctamente.');
    });

    console.log('Seeder finalizado.');
  } finally {
    await app.close();
  }
}

seed().catch((error) => {
  console.error('Error al ejecutar el seeder:', error);
  process.exitCode = 1;
});
