import { Injectable } from '@nestjs/common';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/** Protege las contraseñas mediante scrypt con una sal aleatoria por usuario. */
@Injectable()
export class PasswordService {
  private readonly dummyHash = this.hash(randomBytes(32).toString('hex'));

  private derive(password: string, salt: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      scrypt(password, salt, 64, (error, key) => {
        if (error) reject(error);
        else resolve(key);
      });
    });
  }

  /** Devuelve un hash con su sal; propaga los errores del proveedor criptográfico. */
  async hash(password: string): Promise<string> {
    const salt = randomBytes(16).toString('hex');
    const key = await this.derive(password, salt);
    return `scrypt:${salt}:${key.toString('hex')}`;
  }

  /** Compara en tiempo constante; sin usuario realiza igualmente el cálculo scrypt. */
  async verify(password: string, hash?: string): Promise<boolean> {
    const encoded = hash ?? (await this.dummyHash);
    const [algorithm, salt, hex] = encoded.split(':');
    if (algorithm !== 'scrypt' || !salt || !hex) return false;
    const expected = Buffer.from(hex, 'hex');
    const actual = await this.derive(password, salt);
    return (
      hash !== undefined &&
      expected.length === actual.length &&
      timingSafeEqual(expected, actual)
    );
  }
}
