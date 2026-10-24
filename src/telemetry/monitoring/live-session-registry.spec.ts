import {
  LiveSessionRegistry,
  LIVE_LEASE_MS,
  LIVE_REFRESH_MS,
} from './live-session-registry';
import type { DeviceCommand, LiveState } from './live-session-registry';

describe('Concesiones de monitoreo por sensor', () => {
  let now: number;
  let commands: DeviceCommand[];
  let events: LiveState[];
  let registry: LiveSessionRegistry;

  beforeEach(() => {
    now = 100000;
    commands = [];
    events = [];
    registry = new LiveSessionRegistry(
      (_controllerId, command) => {
        commands.push(command);
        return true;
      },
      (_viewerId, state) => events.push(state),
      () => now,
    );
  });

  /** Confirma la última orden con la frecuencia que admite el sensor. */
  function ack(interval = 1000): string {
    const command = commands.at(-1)!;
    registry.acknowledge(
      '10',
      command.sensorId,
      command.requestId,
      true,
      interval,
    );
    return command.requestId;
  }

  it('espera confirmación y comparte una sola orden entre espectadores', () => {
    expect(registry.subscribe('a', '1', '10', 1000).state).toBe('starting');
    expect(registry.accept('10', '1', commands[0].requestId, 0)).toEqual([]);
    const id = ack();
    expect(registry.subscribe('b', '1', '10', 1000).state).toBe('active');
    expect(commands).toHaveLength(1);
    expect(registry.accept('10', '1', id, 0)).toEqual(['a', 'b']);
  });

  it('salir un espectador mantiene al otro y salir el último detiene el sensor', () => {
    registry.subscribe('a', '1', '10', 1000);
    ack();
    registry.subscribe('b', '1', '10', 1000);
    registry.unsubscribe('a', '1');
    expect(commands).toHaveLength(1);
    registry.unsubscribe('b', '1');
    expect(commands.at(-1)?.type).toBe('monitoring.stop');
  });

  it('reconcilia la frecuencia más rápida y vuelve a la lenta cuando corresponde', () => {
    registry.subscribe('a', '1', '10', 5000);
    ack(5000);
    registry.subscribe('b', '1', '10', 1000);
    expect(commands.at(-1)?.intervalMs).toBe(1000);
    ack();
    registry.unsubscribe('b', '1');
    expect(commands.at(-1)?.intervalMs).toBe(5000);
  });

  it('informa dos segundos si el sensor no admite uno', () => {
    registry.subscribe('a', '1', '10', 1000);
    ack(2000);
    expect(events.at(-1)?.intervalMs).toBe(2000);
  });

  it('rechaza confirmaciones de otro equipo y frecuencias inferiores al mínimo solicitado', () => {
    registry.subscribe('a', '1', '10', 1000);
    const id = commands[0].requestId;
    registry.acknowledge('otro', '1', id, true, 1000);
    expect(events.at(-1)?.state).toBe('starting');
    registry.acknowledge('10', '1', id, true, 500);
    expect(events.at(-1)?.reason).toBe('sensor_unsupported');
  });

  it('descarta secuencias repetidas, órdenes viejas y excesos de frecuencia', () => {
    registry.subscribe('a', '1', '10', 1000);
    const id = ack();
    expect(registry.accept('10', '1', id, 0)).toEqual(['a']);
    now += 100;
    expect(registry.accept('10', '1', id, 1)).toEqual([]);
    now += 1000;
    expect(registry.accept('10', '1', id, 0)).toEqual([]);
    expect(registry.accept('10', '1', 'vieja', 2)).toEqual([]);
    expect(registry.accept('10', '1', id, 2)).toEqual(['a']);
  });

  it('vence confirmaciones tardías incluso antes del siguiente tick', () => {
    registry.subscribe('a', '1', '10', 1000);
    now += 5001;
    ack();
    expect(events.at(-1)?.reason).toBe('ack_timeout');
  });

  it('detiene equipos sin confirmación y sensores que dejan de producir lecturas', () => {
    registry.subscribe('a', '1', '10', 1000);
    now += 5000;
    registry.tick();
    expect(events.at(-1)?.reason).toBe('ack_timeout');
    registry.subscribe('a', '1', '10', 1000);
    ack();
    now += 6000;
    registry.tick();
    expect(events.at(-1)?.reason).toBe('reading_timeout');
  });

  it('vence concesiones aunque Android siga conectado', () => {
    registry.subscribe('a', '1', '10', 1000);
    ack();
    now += LIVE_LEASE_MS;
    registry.tick();
    expect(events.at(-1)?.reason).toBe('lease_expired');
    expect(() => registry.renew('a', '1')).toThrow();
  });

  it('renueva órdenes sin perder espectadores y con identificadores nuevos', () => {
    registry.subscribe('a', '1', '10', 1000);
    const initial = ack();
    now += LIVE_REFRESH_MS;
    registry.accept('10', '1', initial, 0);
    registry.renew('a', '1');
    registry.tick();
    expect(commands.at(-1)?.requestId).not.toBe(initial);
    expect(commands.at(-1)?.durationSeconds).toBe(60);
    expect(registry.sensors('a')).toEqual(['1']);
  });

  it('limita sensores por conexión y rechaza renovaciones ajenas', () => {
    for (let id = 1; id <= 3; id++)
      registry.subscribe('a', String(id), '10', 1000);
    expect(() => registry.subscribe('a', '4', '10', 1000)).toThrow();
    expect(() => registry.renew('b', '1')).toThrow();
    registry.removeViewer('a');
    expect(registry.sensors('a')).toEqual([]);
  });

  it('limpia sesiones al desconectar el equipo o apagar el servidor', () => {
    registry.subscribe('a', '1', '10', 1000);
    ack();
    registry.removeDevice('10');
    expect(registry.sensors('a')).toEqual([]);
    registry.subscribe('a', '2', '10', 1000);
    registry.close();
    expect(registry.sensors('a')).toEqual([]);
  });
});
