import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

/** Resultado de conectividad; COUNT se recibe como texto para conservar precisión. */
export interface DatabaseProbe {
  hora: Date;
  total: string;
}

/** Comprueba el acceso a la tabla de usuarios sin devolver sus registros. */
@Injectable()
export class DbService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * @returns Hora del servidor y cantidad de usuarios, sin datos personales.
   * @throws Error de PostgreSQL si falla la conexión o el acceso a la tabla.
   */
  async probarConsulta(): Promise<DatabaseProbe> {
    const resultado = await this.dataSource.query<DatabaseProbe[]>(`
      SELECT NOW() AS hora, COUNT(*) AS total
      FROM public."Usuario"
    `);

    return resultado[0];
  }
}
