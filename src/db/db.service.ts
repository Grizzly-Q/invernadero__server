import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class DbService {
  //Inyectamosla conexiona postgre
  constructor(private readonly dataSource: DataSource) {}

  //ejecutamosla consulta directa
  async probarConsulta() {
    const resultado = await this.dataSource.query(`
      SELECT NOW() AS hora, COUNT(*) AS total
      FROM public."Usuario"
    `);

    //devuelve la unica fila producida por la consulta
    return resultado[0];
  }
}
