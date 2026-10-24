import 'reflect-metadata';
import { HistoryQueryDto } from './dto/history-query.dto';
import { historyRange } from './history.service';

describe('Ventanas del historial', () => {
  const now = new Date('2026-10-23T18:00:00Z');

  it('usa ventanas móviles de 24 horas y siete días', () => {
    expect(historyRange(new HistoryQueryDto(), now).from.toISOString()).toBe(
      '2026-10-22T18:00:00.000Z',
    );
    expect(
      historyRange(
        Object.assign(new HistoryQueryDto(), { period: 'week' }),
        now,
      ).from.toISOString(),
    ).toBe('2026-10-16T18:00:00.000Z');
  });

  it('respeta el desfase de Perú sin convertirlo como hora local del servidor', () => {
    const query = Object.assign(new HistoryQueryDto(), {
      from: '2026-10-22T00:00:00-05:00',
      to: '2026-10-23T00:00:00-05:00',
    });
    expect(historyRange(query).from.toISOString()).toBe(
      '2026-10-22T05:00:00.000Z',
    );
  });

  it('rechaza filtros incompatibles y rangos vacíos o excesivos', () => {
    for (const filters of [
      { period: 'day', from: now.toISOString() },
      { from: now.toISOString() },
      { from: now.toISOString(), to: now.toISOString() },
      { from: '2026-01-01T00:00:00Z', to: '2026-03-01T00:00:00Z' },
    ])
      expect(() =>
        historyRange(Object.assign(new HistoryQueryDto(), filters)),
      ).toThrow();
  });
});
