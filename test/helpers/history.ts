import assert from 'node:assert/strict';
import request from 'supertest';
import type { Server } from 'node:http';
import type { DataSource } from 'typeorm';
import { MeasurementEntity } from '../../src/telemetry/entities/measurement.entity';

/** Campos del contrato que comprueban las aserciones HTTP del historial. */
interface HistoryResponse {
  summary: {
    count: string;
    minimum: number | null;
    maximum: number | null;
    average: number | null;
  };
  pagination: { total: string; hasNext: boolean };
  items: Array<{
    value?: number;
    measuredAt?: string | null;
    average?: number;
    count?: string;
  }>;
}

/** Verifica permisos, límites temporales, paginación y agregaciones con datos aislados. */
export async function verifyHistory(
  http: Server,
  source: DataSource,
  sensorId: string,
  foreignSensorId: string,
  token: string,
  deviceKey: string,
) {
  const path = `/telemetry/sensors/${sensorId}/history`;
  await request(http).get(path).expect(401);
  await request(http).get(path).auth(deviceKey, { type: 'bearer' }).expect(401);
  await request(http)
    .get(`/telemetry/sensors/${foreignSensorId}/history`)
    .auth(token, { type: 'bearer' })
    .expect(403);
  const repository = source.getRepository(MeasurementEntity);
  const dates = [
    '2026-01-01T00:00:00Z',
    '2026-01-01T00:30:00Z',
    '2026-01-01T01:00:00Z',
    '2026-01-02T00:00:00Z',
  ];
  try {
    await repository.insert(
      dates.map((date, index) => ({
        sensorId,
        readingId: `history-test:${index}`,
        value: String((index + 1) * 10),
        measuredAt: index === 1 ? null : new Date(date),
        receivedAt: new Date(date),
      })),
    );
    const filters = { from: dates[0], to: dates[3], limit: 2 };
    const first = await request(http)
      .get(path)
      .auth(token, { type: 'bearer' })
      .query(filters)
      .expect(200);
    assert.deepEqual((first.body as HistoryResponse).summary, {
      count: '3',
      minimum: 10,
      maximum: 30,
      average: 20,
    });
    assert.equal((first.body as HistoryResponse).items.length, 2);
    assert.equal((first.body as HistoryResponse).items[1].measuredAt, null);
    assert.equal((first.body as HistoryResponse).pagination.hasNext, true);
    const second = await request(http)
      .get(path)
      .auth(token, { type: 'bearer' })
      .query({ ...filters, page: 2 })
      .expect(200);
    assert.equal((second.body as HistoryResponse).items[0].value, 30);
    assert.equal((second.body as HistoryResponse).pagination.hasNext, false);
    const hourly = await request(http)
      .get(path)
      .auth(token, { type: 'bearer' })
      .query({ ...filters, groupBy: 'hour' })
      .expect(200);
    assert.equal((hourly.body as HistoryResponse).pagination.total, '2');
    assert.equal((hourly.body as HistoryResponse).items[0].average, 15);
    assert.equal((hourly.body as HistoryResponse).items[0].count, '2');
    const empty = await request(http)
      .get(path)
      .auth(token, { type: 'bearer' })
      .query({ from: '2025-01-01T00:00:00Z', to: '2025-01-02T00:00:00Z' })
      .expect(200);
    assert.equal((empty.body as HistoryResponse).summary.count, '0');
    assert.equal((empty.body as HistoryResponse).summary.average, null);
    for (const query of [
      { period: 'month' },
      { ...filters, period: 'day' },
      { from: dates[0] },
      { ...filters, to: dates[0] },
      { ...filters, from: '2026-01-01T00:00:00' },
      { limit: 501 },
      { page: 0 },
      { unexpected: 'yes' },
    ]) {
      await request(http)
        .get(path)
        .auth(token, { type: 'bearer' })
        .query(query)
        .expect(400);
    }
    for (const period of ['day', 'week']) {
      await request(http)
        .get(path)
        .auth(token, { type: 'bearer' })
        .query({ period })
        .expect(200);
    }
  } finally {
    // Solo borra las lecturas del sensor sintético en el esquema desechable de esta prueba.
    await repository.delete({ sensorId });
  }
}
