import { describe, expect, it } from 'vitest';
import { CODE_LABELS } from '../src/api';
import {
  EXECUTION_STATE_META,
  LIMIT_STATUS_META,
  WORKER_STATUS_META,
  buildComputeHistoryChartModel,
  formatAgeMs,
  formatLimitRejectionReason,
  formatLimitsTriple,
  formatSlotDuration,
  formatTimelineEventLabel,
  validateComputeLimitsDraft,
  validateJobIdFilter,
} from '../src/components/computeFormat';
import type { ComputeHistoryPoint, ComputeHistoryResponse } from '../src/types';

function makePoint(overrides: Partial<ComputeHistoryPoint> & { at: string }): ComputeHistoryPoint {
  return {
    at: overrides.at,
    ...(overrides.bootId !== undefined ? { bootId: overrides.bootId } : {}),
    usage: overrides.usage ?? { total: 1, encode: 1, probe: 0 },
    waiting: overrides.waiting ?? { total: 0, encode: 0, probe: 0 },
    applied: overrides.applied ?? { total: 2, encode: 1, probe: 1 },
    hard: overrides.hard ?? { total: 4, encode: 2, probe: 2 },
    workers: overrides.workers ?? 1,
    clockUncertain: overrides.clockUncertain ?? false,
    gap: overrides.gap ?? false,
  };
}

describe('buildComputeHistoryChartModel', () => {
  it('returns empty model cleanly for null or zero-point history', () => {
    const empty = buildComputeHistoryChartModel(
      { since: '2026-04-01T00:00:00.000Z', until: '2026-04-01T01:00:00.000Z', points: [] },
      'total',
    );
    expect(empty.empty).toBe(true);
    expect(empty.segments).toEqual([]);
    expect(empty.missingRanges).toEqual([]);
    expect(empty.drainMarkers).toEqual([]);

    expect(buildComputeHistoryChartModel(null, 'encode').empty).toBe(true);
  });

  it('handles single-point history and degenerate since === until bounds without NaN', () => {
    const history: ComputeHistoryResponse = {
      since: '2026-04-01T00:10:00.000Z',
      until: '2026-04-01T00:10:00.000Z',
      points: [makePoint({ at: '2026-04-01T00:10:00.000Z' })],
    };

    const model = buildComputeHistoryChartModel(history, 'total');
    expect(model.empty).toBe(false);
    expect(model.segments).toHaveLength(1);
    expect(model.segments[0]?.points).toHaveLength(1);
    expect(model.dots).toHaveLength(1);
    expect(Number.isFinite(model.dots[0]!.x)).toBe(true);
    expect(Number.isFinite(model.dots[0]!.usageY)).toBe(true);
    expect(model.segments[0]?.appliedStepPath).toContain('H');
    expect(model.segments[0]?.hardPath).toContain('H');
    expect(model.segments[0]?.usagePath).not.toContain('NaN');
  });

  it('handles all-zero samples with yMax=1 and baseline coordinates', () => {
    const zero = { total: 0, encode: 0, probe: 0 };
    const history: ComputeHistoryResponse = {
      since: '2026-04-01T00:00:00.000Z',
      until: '2026-04-01T00:05:00.000Z',
      points: [
        makePoint({ at: '2026-04-01T00:01:00.000Z', usage: zero, applied: zero, hard: zero }),
        makePoint({ at: '2026-04-01T00:01:05.000Z', usage: zero, applied: zero, hard: zero }),
      ],
    };

    const model = buildComputeHistoryChartModel(history, 'probe');
    expect(model.empty).toBe(false);
    expect(model.yMax).toBe(1);
    expect(model.yTicks.map((t) => t.value)).toEqual([0, 1]);
    expect(model.segments).toHaveLength(1);
    expect(model.segments[0]?.points.every((p) => p.usageY === model.plotBottom)).toBe(true);
    expect(model.hasDraining).toBe(false);
  });

  it('splits curve into disconnected segments across >15s gaps, explicit gap flags, and boot changes', () => {
    const history: ComputeHistoryResponse = {
      since: '2026-04-01T00:00:00.000Z',
      until: '2026-04-01T00:05:00.000Z',
      points: [
        makePoint({ at: '2026-04-01T00:01:00.000Z', bootId: 'boot-a' }),
        makePoint({ at: '2026-04-01T00:01:15.000Z', bootId: 'boot-a' }), // exactly 15s: contiguous
        makePoint({ at: '2026-04-01T00:01:31.000Z', bootId: 'boot-a' }), // 16s > 15s: gap!
        makePoint({ at: '2026-04-01T00:01:36.000Z', bootId: 'boot-b' }), // boot changed: gap!
        makePoint({ at: '2026-04-01T00:01:41.000Z', bootId: 'boot-b', gap: true }), // explicit telemetry gap!
      ],
    };

    const model = buildComputeHistoryChartModel(history, 'total');
    expect(model.hasGap).toBe(true);
    expect(model.segments).toHaveLength(4);
    expect(model.segments.map((s) => s.points.length)).toEqual([2, 1, 1, 1]);
    expect(model.missingRanges).toHaveLength(3);
    expect(model.missingRanges[0]).toMatchObject({
      fromAt: '2026-04-01T00:01:15.000Z',
      toAt: '2026-04-01T00:01:31.000Z',
    });
  });

  it('renders applied step line and detects draining intervals per selected resource metric', () => {
    const history: ComputeHistoryResponse = {
      since: '2026-04-01T00:00:00.000Z',
      until: '2026-04-01T00:02:00.000Z',
      points: [
        makePoint({
          at: '2026-04-01T00:00:10.000Z',
          usage: { total: 3, encode: 2, probe: 1 },
          applied: { total: 4, encode: 2, probe: 2 },
          hard: { total: 4, encode: 2, probe: 2 },
        }),
        makePoint({
          at: '2026-04-01T00:00:15.000Z',
          usage: { total: 3, encode: 2, probe: 1 },
          applied: { total: 1, encode: 0, probe: 1 },
          hard: { total: 4, encode: 2, probe: 2 },
          clockUncertain: true,
        }),
        makePoint({
          at: '2026-04-01T00:00:20.000Z',
          usage: { total: 1, encode: 0, probe: 1 },
          applied: { total: 1, encode: 0, probe: 1 },
          hard: { total: 4, encode: 2, probe: 2 },
        }),
      ],
    };

    const totalModel = buildComputeHistoryChartModel(history, 'total');
    expect(totalModel.hasDraining).toBe(true);
    expect(totalModel.hasClockUncertain).toBe(true);
    expect(totalModel.drainRanges).toHaveLength(1);
    expect(totalModel.drainMarkers).toHaveLength(1);
    expect(totalModel.drainMarkers[0]).toMatchObject({
      at: '2026-04-01T00:00:15.000Z',
      usage: 3,
      applied: 1,
    });
    expect(totalModel.segments[0]?.appliedStepPath).toMatch(/^M.* H.* V.* H.* V/);

    const encodeModel = buildComputeHistoryChartModel(history, 'encode');
    expect(encodeModel.hasDraining).toBe(true);
    expect(encodeModel.drainMarkers[0]).toMatchObject({ usage: 2, applied: 0 });

    const probeModel = buildComputeHistoryChartModel(history, 'probe');
    expect(probeModel.hasDraining).toBe(false);
    expect(probeModel.drainMarkers).toHaveLength(0);
  });
});

describe('validateComputeLimitsDraft', () => {
  const hard = { total: 6, encode: 3, probe: 4 };

  it('accepts valid non-negative integers within hard limits including 0/0/0 pause and independent totals', () => {
    const normal = validateComputeLimitsDraft({ total: '4', encode: '2', probe: '3' }, hard);
    expect(normal).toEqual({
      valid: true,
      limits: { total: 4, encode: 2, probe: 3 },
      fieldErrors: {},
      pausesResources: [],
    });

    const fullPause = validateComputeLimitsDraft({ total: '0', encode: '0', probe: '0' }, hard);
    expect(fullPause.valid).toBe(true);
    expect(fullPause.limits).toEqual({ total: 0, encode: 0, probe: 0 });
    expect(fullPause.pausesResources).toEqual(['total', 'encode', 'probe']);

    // Backend parseWorkerLimits does NOT enforce total >= encode or total >= encode + probe
    const independent = validateComputeLimitsDraft({ total: '1', encode: '3', probe: '4' }, hard);
    expect(independent.valid).toBe(true);
    expect(independent.limits).toEqual({ total: 1, encode: 3, probe: 4 });
  });

  it('rejects values exceeding deployment hard limits', () => {
    const result = validateComputeLimitsDraft({ total: '7', encode: '4', probe: '2' }, hard);
    expect(result.valid).toBe(false);
    expect(result.limits).toBeNull();
    expect(result.fieldErrors.total).toContain('6');
    expect(result.fieldErrors.encode).toContain('3');
    expect(result.fieldErrors.probe).toBeUndefined();
  });

  it('rejects negative numbers, decimals, empty strings, non-numeric text, and unsafe integers', () => {
    const negative = validateComputeLimitsDraft({ total: '-1', encode: '1.5', probe: '' }, hard);
    expect(negative.valid).toBe(false);
    expect(negative.fieldErrors.total).toBeTruthy();
    expect(negative.fieldErrors.encode).toBeTruthy();
    expect(negative.fieldErrors.probe).toBeTruthy();

    const unsafe = validateComputeLimitsDraft(
      { total: '9007199254740993', encode: 'abc', probe: '1e2' },
      null,
    );
    expect(unsafe.valid).toBe(false);
    expect(unsafe.fieldErrors.total).toBeTruthy();
    expect(unsafe.fieldErrors.encode).toBeTruthy();
    expect(unsafe.fieldErrors.probe).toBeTruthy();
  });
});

describe('compute status labels, UUID filters, and error code mappings', () => {
  it('formats status labels, limit triples, durations, and rejection reasons', () => {
    expect(WORKER_STATUS_META.online.label).toBe('在线');
    expect(WORKER_STATUS_META.stale.label).toBe('数据过期');
    expect(WORKER_STATUS_META.offline.label).toBe('离线');
    expect(WORKER_STATUS_META.unseen.label).toBe('尚无心跳');

    expect(EXECUTION_STATE_META.queued.label).toBe('待槽');
    expect(EXECUTION_STATE_META.active.label).toBe('占槽中');
    expect(EXECUTION_STATE_META.released.label).toBe('已释放');
    expect(EXECUTION_STATE_META.cancelled.label).toBe('已取消');
    expect(EXECUTION_STATE_META.unknown.label).toBe('占槽不确定');

    expect(LIMIT_STATUS_META.pending.label).toBe('待生效');
    expect(LIMIT_STATUS_META.applied.label).toBe('已生效');
    expect(LIMIT_STATUS_META.rejected.label).toBe('已拒绝');

    expect(formatLimitsTriple({ total: 4, encode: 2, probe: 2 })).toBe('4 / 2 / 2');
    expect(formatLimitsTriple(null)).toBe('—');
    expect(formatAgeMs(5_200)).toBe('5 秒前');
    expect(formatAgeMs(125_000)).toBe('2 分 5 秒前');
    expect(formatSlotDuration('2026-04-01T00:00:01.000Z', '2026-04-01T00:00:03.250Z')).toBe(
      '2.250 秒',
    );
    expect(formatLimitRejectionReason('HARD_LIMIT_EXCEEDED')).toBe(CODE_LABELS.HARD_LIMIT_EXCEEDED);
    expect(formatLimitRejectionReason(null)).toBeNull();
  });

  it('validates and lowercases job UUID v4 filters and formats timeline events', () => {
    expect(validateJobIdFilter('')).toEqual({ value: undefined, error: null });
    expect(validateJobIdFilter('  550e8400-e29b-41d4-a716-446655440000  ')).toEqual({
      value: '550e8400-e29b-41d4-a716-446655440000',
      error: null,
    });
    expect(validateJobIdFilter('  550E8400-E29B-41D4-A716-446655440000  ')).toEqual({
      value: '550e8400-e29b-41d4-a716-446655440000',
      error: null,
    });
    expect(validateJobIdFilter('not-a-uuid').error).toBeTruthy();

    expect(
      formatTimelineEventLabel({
        kind: 'execution',
        state: 'acquired',
        at: 1_700_000_000_000,
        execution: {
          executionId: '550e8400-e29b-41d4-a716-446655440001',
          protocol: 'media',
          jobId: '550e8400-e29b-41d4-a716-446655440000',
          attemptId: '550e8400-e29b-41d4-a716-446655440002',
          inspectionId: null,
          resource: 'encode',
          slots: 1,
        },
      }),
    ).toBe('取得资源槽');

    expect(
      formatTimelineEventLabel({
        kind: 'phase',
        phase: 'processing',
        at: 1_700_000_000_000,
        execution: {
          executionId: '550e8400-e29b-41d4-a716-446655440001',
          protocol: 'media',
          jobId: '550e8400-e29b-41d4-a716-446655440000',
          attemptId: '550e8400-e29b-41d4-a716-446655440002',
          inspectionId: null,
          resource: 'encode',
          slots: 1,
        },
      }),
    ).toContain('媒体处理中');

    expect(
      formatTimelineEventLabel({
        kind: 'hold',
        state: 'blocked',
        at: 1_700_000_000_000,
        resource: 'probe',
        identity: 'queue-item-1',
      }),
    ).toContain('探测 阻断 (HOLD)');
  });

  it('includes localized error code labels for all compute worker observability error codes', () => {
    const requiredCodes = [
      'COMPUTE_OPS_UNAVAILABLE',
      'WORKER_NOT_FOUND',
      'WORKER_NOT_OBSERVED',
      'WORKER_REVISION_CONFLICT',
      'WORKER_HARD_LIMIT_EXCEEDED',
      'HARD_LIMIT_EXCEEDED',
      'STALE_REVISION',
      'INSTANCE_MISMATCH',
      'LIMITS_INVALID',
    ];
    for (const code of requiredCodes) {
      expect(CODE_LABELS[code]).toBeTruthy();
    }
  });
});
