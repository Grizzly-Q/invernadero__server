import { ForbiddenException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Role } from '../users/role.enum';

/** Comprueba la pertenencia persistente; nunca acepta un rol indicado por el cliente o el JWT. */
@Injectable()
export class GreenhouseAccessService {
  constructor(private readonly source: DataSource) {}

  /** Escapa el esquema configurado tanto en producción como en pruebas aisladas. */
  schema(): string {
    if (this.source.options.type !== 'postgres')
      throw new Error('Se requiere PostgreSQL.');
    return this.source.driver.escape(this.source.options.schema ?? 'public');
  }

  /**
   * Exige un rol en el invernadero solicitado, sin privilegios globales.
   * @param userId UUID de la cuenta autenticada.
   * @param greenhouseId Identificador bigint del invernadero, como cadena.
   * @param roles Roles permitidos para la operación.
   * @returns Rol persistido y verificado.
   * @throws ForbiddenException si no hay pertenencia o el rol no autoriza la operación.
   */
  async require(
    userId: string,
    greenhouseId: string,
    roles: Role[] = [Role.ADMIN, Role.OPERATOR],
  ): Promise<Role> {
    const rows = await this.source.query<Array<{ role: Role }>>(
      `SELECT m."rol_UsuarioInvernadero" AS role
      FROM ${this.schema()}."UsuarioInvernadero" m
      JOIN ${this.schema()}."Usuario" u ON u."idUsuario_Usuario" = m."idUsuario_UsuarioInvernadero"
      WHERE u."uuid_Usuario" = $1 AND m."idInvernadero_UsuarioInvernadero" = $2`,
      [userId, greenhouseId],
    );
    if (!rows[0] || !roles.includes(rows[0].role))
      throw new ForbiddenException('No tienes permisos en este invernadero.');
    return rows[0].role;
  }
}
