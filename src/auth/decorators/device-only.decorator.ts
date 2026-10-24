import { SetMetadata } from '@nestjs/common';

export const DEVICE_ONLY_KEY = 'auth:deviceOnly';

/** Exige una credencial de ESP32 y excluye JWT de usuarios; no hace pública la ruta. */
export const DeviceOnly = () => SetMetadata(DEVICE_ONLY_KEY, true);
