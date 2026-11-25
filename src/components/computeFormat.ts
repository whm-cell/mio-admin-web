import { CODE_LABELS } from '../api';
import type {
  ComputeHistoryResponse,
  ComputeWorkerExecutionPhase,
  ComputeWorkerExecutionState,
  ComputeWorkerLimitChangeStatus,
  ComputeWorkerLimitRejectionReason,
  ComputeWorkerLimits,
  ComputeWorkerMetricKey,
  ComputeWorkerStatus,
  ComputeWorkerTelemetryEvent,
} from '../types';

export const COMPUTE_METRIC_KEYS: readonly ComputeWorkerMetricKey[] = ['total', 'encode', 'probe'];

export const COMPUTE_METRIC_LABELS: Record<ComputeWorkerMetricKey, string> = {
  total: '总槽',
  encode: '编码',
  probe: '探测',
};

export interface StatusMeta {
  label: string;
  badgeClass: string;
  dotClass?: string;
}

export const WORKER_STATUS_META: Record<ComputeWorkerStatus, StatusMeta> = {
  online: {
    label: '在线',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    dotClass: 'bg-emerald-500',
  },
  stale: {
    label: '数据过期',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
    dotClass: 'bg-amber-500',
  },
  offline: {
    label: '离线',
    badgeClass: 'bg-rose-100 text-rose-800 border-rose-200',
    dotClass: 'bg-rose-500',
  },
  unseen: {
    label: '尚无心跳',
    badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
    dotClass: 'bg-slate-400',
  },
};

export const EXECUTION_STATE_META: Record<ComputeWorkerExecutionState, StatusMeta> = {
  queued: { label: '待槽', badgeClass: 'bg-amber-100 text-amber-800' },
  active: { label: '占槽中', badgeClass: 'bg-emerald-100 text-emerald-800' },
  released: { label: '已释放', badgeClass: 'bg-slate-100 text-slate-700' },
  cancelled: { label: '已取消', badgeClass: 'bg-slate-100 text-slate-600' },
  unknown: { label: '占槽不确定', badgeClass: 'bg-amber-100 text-amber-900' },
};

export const LIMIT_STATUS_META: Record<ComputeWorkerLimitChangeStatus, StatusMeta> = {
  pending: { label: '待生效', badgeClass: 'bg-amber-100 text-amber-800' },
  applied: { label: '已生效', badgeClass: 'bg-emerald-100 text-emerald-800' },
  rejected: { label: '已拒绝', badgeClass: 'bg-rose-100 text-rose-800' },
};

const EXECUTION_PHASE_LABELS: Record<ComputeWorkerExecutionPhase, string> = {
  downloading: '下载输入',
  processing: '媒体处理中',
  uploading: '上传产物',
  finalizing: '收尾确认',
};

const EXECUTION_EVENT_STATE_LABELS: Record<
  'queued' | 'acquired' | 'released' | 'cancelled',
  string
> = {
  queued: '进入待槽',
  acquired: '取得资源槽',
  released: '释放资源槽',
  cancelled: '取消等待',
};

const JOB_UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NON_NEGATIVE_INT_RE = /^\d+$/;

const HISTORY_GAP_THRESHOLD_MS = 15_000;
const DRAIN_SAMPLE_WINDOW_MS = 5_000;

const clockTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

const shortDateTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

const chartAxisTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function formatLimitsTriple(limits: ComputeWorkerLimits | null | undefined): string {
  if (!limits) return '—';
  return `${limits.total} / ${limits.encode} / ${limits.probe}`;
}

export function formatComputeDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return shortDateTimeFormatter.format(parsed);
}

export function formatComputeClockTime(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return clockTimeFormatter.format(parsed);
}

export function formatAgeMs(ageMs: number | null): string {
  if (ageMs === null || !Number.isFinite(ageMs)) return '—';
  const seconds = Math.max(0, Math.floor(ageMs / 1000));
  if (seconds < 60) return `${seconds} 秒前`;
  const mins = Math.floor(seconds / 60);
  const remSec = seconds % 60;
  if (mins < 60) return `${mins} 分 ${remSec} 秒前`;
  const hours = Math.floor(mins / 60);
  return `${hours} 小时 ${mins % 60} 分前`;
}

export function formatSlotDuration(acquiredAt: string | null, endedAt: string | null): string {
  if (!acquiredAt || !endedAt) return '—';
  const start = Date.parse(acquiredAt);
  const end = Date.parse(endedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return '—';
  return `${((end - start) / 1000).toFixed(3)} 秒`;
}

export function formatTimelineEventLabel(detail: ComputeWorkerTelemetryEvent): string {
  if (detail.kind === 'execution') {
    return EXECUTION_EVENT_STATE_LABELS[detail.state];
  }
  if (detail.kind === 'phase') {
    return `阶段：${EXECUTION_PHASE_LABELS[detail.phase]} (${detail.phase})`;
  }
  if (detail.kind === 'hold') {
    const resourceLabel = COMPUTE_METRIC_LABELS[detail.resource];
    const actionLabel = detail.state === 'blocked' ? '阻断 (HOLD)' : '解除阻断';
    return `${resourceLabel} ${actionLabel} · ${detail.identity}`;
  }
  return `并发上限已生效 (${formatLimitsTriple(detail.limits)})`;
}

export function formatLimitRejectionReason(
  reason: ComputeWorkerLimitRejectionReason | null | undefined,
): string | null {
  if (!reason) return null;
  return CODE_LABELS[reason] ?? reason;
}

export function validateJobIdFilter(raw: string): {
  value: string | undefined;
  error: string | null;
} {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { value: undefined, error: null };
  }
  if (!JOB_UUID_V4_RE.test(trimmed)) {
    return {
      value: undefined,
      error: '任务 ID 须为有效的 36 位 UUID v4（例如 550e8400-e29b-41d4-a716-446655440000）',
    };
  }
  return { value: trimmed.toLowerCase(), error: null };
}

export interface ComputeLimitFormDraft {
  total: string;
  encode: string;
  probe: string;
}

export interface ComputeLimitValidationResult {
  valid: boolean;
  limits: ComputeWorkerLimits | null;
  fieldErrors: Partial<Record<ComputeWorkerMetricKey, string>>;
  pausesResources: ComputeWorkerMetricKey[];
}

export function limitsToFormDraft(limits: ComputeWorkerLimits): ComputeLimitFormDraft {
  return {
    total: String(limits.total),
    encode: String(limits.encode),
    probe: String(limits.probe),
  };
}

/**
 * Validates dynamic limit inputs strictly following backend `parseWorkerLimits`
 * and `WorkerControlStore.request` rules:
 * - each of total / encode / probe must be a non-negative safe integer (>= 0)
 * - each must not exceed its corresponding deployment hard limit (when provided)
 * - 0 / 0 / 0 and independent per-resource values (without forcing total >= encode + probe) are valid
 */
export function validateComputeLimitsDraft(
  draft: ComputeLimitFormDraft,
  hard?: ComputeWorkerLimits | null,
): ComputeLimitValidationResult {
  const fieldErrors: Partial<Record<ComputeWorkerMetricKey, string>> = {};
  const parsed: Partial<ComputeWorkerLimits> = {};

  for (const key of COMPUTE_METRIC_KEYS) {
    const label = COMPUTE_METRIC_LABELS[key];
    const raw = draft[key].trim();
    if (!raw) {
      fieldErrors[key] = `${label}上限不能为空`;
      continue;
    }
    if (!NON_NEGATIVE_INT_RE.test(raw)) {
      fieldErrors[key] = `${label}上限必须为非负整数`;
      continue;
    }
    const num = Number(raw);
    if (!Number.isSafeInteger(num) || num < 0) {
      fieldErrors[key] = `${label}上限必须为非负安全整数`;
      continue;
    }
    if (hard && num > hard[key]) {
      fieldErrors[key] = `${label}上限不能超过部署硬上限 ${hard[key]}`;
      continue;
    }
    parsed[key] = num;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      valid: false,
      limits: null,
      fieldErrors,
      pausesResources: [],
    };
  }

  const limits: ComputeWorkerLimits = {
    total: parsed.total ?? 0,
    encode: parsed.encode ?? 0,
    probe: parsed.probe ?? 0,
  };
  const pausesResources = COMPUTE_METRIC_KEYS.filter((key) => limits[key] === 0);

  return {
    valid: true,
    limits,
    fieldErrors: {},
    pausesResources,
  };
}

export interface ComputeChartPoint {
  index: number;
  at: string;
  timeMs: number;
  x: number;
  usage: number;
  applied: number;
  hard: number;
  usageY: number;
  appliedY: number;
  hardY: number;
  draining: boolean;
}

export interface ComputeChartSegment {
  points: ComputeChartPoint[];
  usagePath: string;
  appliedStepPath: string;
  hardPath: string;
}

export interface ComputeChartMissingRange {
  x: number;
  width: number;
  fromAt: string;
  toAt: string;
}

export interface ComputeChartDrainRange {
  x: number;
  width: number;
  at: string;
  usage: number;
  applied: number;
}

export interface ComputeChartDrainMarker {
  cx: number;
  cy: number;
  at: string;
  usage: number;
  applied: number;
}

export interface ComputeChartYTick {
  value: number;
  y: number;
}

export interface ComputeChartXTick {
  timeMs: number;
  x: number;
  label: string;
  anchor: 'start' | 'middle' | 'end';
}

export interface ComputeHistoryChartModel {
  empty: boolean;
  width: number;
  height: number;
  plotLeft: number;
  plotRight: number;
  plotTop: number;
  plotBottom: number;
  yMax: number;
  yTicks: ComputeChartYTick[];
  xTicks: ComputeChartXTick[];
  segments: ComputeChartSegment[];
  dots: ComputeChartPoint[];
  missingRanges: ComputeChartMissingRange[];
  drainRanges: ComputeChartDrainRange[];
  drainMarkers: ComputeChartDrainMarker[];
  hasGap: boolean;
  hasClockUncertain: boolean;
  hasDraining: boolean;
}

interface ComputeChartDimensions {
  width?: number;
  height?: number;
}

function roundCoord(value: number): string {
  return value.toFixed(2);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function buildStepPath(
  points: readonly ComputeChartPoint[],
  getY: (point: ComputeChartPoint) => number,
  plotLeft: number,
  plotRight: number,
): string {
  if (points.length === 0) return '';
  if (points.length === 1) {
    const pt = points[0]!;
    const y = roundCoord(getY(pt));
    const halfSpan = 6;
    const x1 = clamp(pt.x - halfSpan, plotLeft, plotRight);
    const x2 = clamp(pt.x + halfSpan, plotLeft, plotRight);
    return `M${roundCoord(x1)},${y} H${roundCoord(x2)}`;
  }
  const commands: string[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const pt = points[i]!;
    const x = roundCoord(pt.x);
    const y = roundCoord(getY(pt));
    if (i === 0) {
      commands.push(`M${x},${y}`);
    } else {
      commands.push(`H${x} V${y}`);
    }
  }
  return commands.join(' ');
}

function buildPolylinePath(
  points: readonly ComputeChartPoint[],
  getY: (point: ComputeChartPoint) => number,
): string {
  if (points.length === 0) return '';
  return points
    .map((pt, idx) => `${idx === 0 ? 'M' : 'L'}${roundCoord(pt.x)},${roundCoord(getY(pt))}`)
    .join(' ');
}

export function buildComputeHistoryChartModel(
  history: ComputeHistoryResponse | null | undefined,
  metric: ComputeWorkerMetricKey,
  dimensions: ComputeChartDimensions = {},
): ComputeHistoryChartModel {
  const width = Math.max(300, dimensions.width ?? 760);
  const height = Math.max(150, dimensions.height ?? 210);
  const plotLeft = 36;
  const plotRight = width - 16;
  const plotTop = 12;
  const plotBottom = height - 26;

  const emptyResult: ComputeHistoryChartModel = {
    empty: true,
    width,
    height,
    plotLeft,
    plotRight,
    plotTop,
    plotBottom,
    yMax: 1,
    yTicks: [],
    xTicks: [],
    segments: [],
    dots: [],
    missingRanges: [],
    drainRanges: [],
    drainMarkers: [],
    hasGap: false,
    hasClockUncertain: false,
    hasDraining: false,
  };

  if (!history || history.points.length === 0) {
    return emptyResult;
  }

  const timed = history.points
    .map((point) => ({ point, timeMs: Date.parse(point.at) }))
    .filter((item) => Number.isFinite(item.timeMs));

  if (timed.length === 0) {
    return emptyResult;
  }

  const parsedSince = Date.parse(history.since);
  const parsedUntil = Date.parse(history.until);
  const firstPointTime = timed[0]!.timeMs;
  const lastPointTime = timed[timed.length - 1]!.timeMs;

  let startMs = Number.isFinite(parsedSince) ? parsedSince : firstPointTime;
  let endMs = Number.isFinite(parsedUntil) ? parsedUntil : lastPointTime;
  if (endMs <= startMs) {
    startMs = firstPointTime - 30_000;
    endMs = lastPointTime + 30_000;
  }

  let yMax = 1;
  for (const { point } of timed) {
    const candidate = Math.max(point.hard[metric], point.usage[metric], point.applied[metric]);
    if (Number.isFinite(candidate) && candidate > yMax) {
      yMax = candidate;
    }
  }

  const mapX = (timeMs: number): number => {
    const ratio = (timeMs - startMs) / (endMs - startMs);
    return clamp(plotLeft + ratio * (plotRight - plotLeft), plotLeft, plotRight);
  };
  const mapY = (value: number): number => {
    const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
    return plotBottom - (safe / yMax) * (plotBottom - plotTop);
  };

  const yTickCount = Math.min(4, yMax);
  const seenYValues = new Set<number>();
  const yTicks: ComputeChartYTick[] = [];
  for (let i = 0; i <= yTickCount; i += 1) {
    const value = Math.round((i * yMax) / yTickCount);
    if (seenYValues.has(value)) continue;
    seenYValues.add(value);
    yTicks.push({ value, y: mapY(value) });
  }

  const xMarkCount = width < 500 ? 3 : 5;
  const xTicks: ComputeChartXTick[] = [];
  for (let i = 0; i < xMarkCount; i += 1) {
    const timeMs = startMs + ((endMs - startMs) * i) / (xMarkCount - 1);
    xTicks.push({
      timeMs,
      x: mapX(timeMs),
      label: chartAxisTimeFormatter.format(timeMs),
      anchor: i === 0 ? 'start' : i === xMarkCount - 1 ? 'end' : 'middle',
    });
  }

  const gapBefore: boolean[] = timed.map((item, idx) => {
    if (idx === 0) return false;
    const prev = timed[idx - 1]!;
    const timeDelta = item.timeMs - prev.timeMs;
    const bootChanged = Boolean(
      item.point.bootId && prev.point.bootId && item.point.bootId !== prev.point.bootId,
    );
    return timeDelta > HISTORY_GAP_THRESHOLD_MS || item.point.gap || bootChanged;
  });

  const chartPoints: ComputeChartPoint[] = timed.map(({ point, timeMs }, index) => {
    const usage = point.usage[metric];
    const applied = point.applied[metric];
    const hard = point.hard[metric];
    return {
      index,
      at: point.at,
      timeMs,
      x: mapX(timeMs),
      usage,
      applied,
      hard,
      usageY: mapY(usage),
      appliedY: mapY(applied),
      hardY: mapY(hard),
      draining: usage > applied,
    };
  });

  const missingRanges: ComputeChartMissingRange[] = [];
  for (let i = 1; i < chartPoints.length; i += 1) {
    if (!gapBefore[i]) continue;
    const prev = chartPoints[i - 1]!;
    const curr = chartPoints[i]!;
    missingRanges.push({
      x: prev.x,
      width: Math.max(2, curr.x - prev.x),
      fromAt: prev.at,
      toAt: curr.at,
    });
  }

  const rawSegments: ComputeChartPoint[][] = [];
  let activeSegment: ComputeChartPoint[] = [];
  for (let i = 0; i < chartPoints.length; i += 1) {
    const pt = chartPoints[i]!;
    if (i > 0 && gapBefore[i]) {
      if (activeSegment.length > 0) {
        rawSegments.push(activeSegment);
      }
      activeSegment = [pt];
    } else {
      activeSegment.push(pt);
    }
  }
  if (activeSegment.length > 0) {
    rawSegments.push(activeSegment);
  }

  const segments: ComputeChartSegment[] = rawSegments.map((pts) => ({
    points: pts,
    usagePath: buildPolylinePath(pts, (pt) => pt.usageY),
    appliedStepPath: buildStepPath(pts, (pt) => pt.appliedY, plotLeft, plotRight),
    hardPath: buildStepPath(pts, (pt) => pt.hardY, plotLeft, plotRight),
  }));

  const dots: ComputeChartPoint[] = [];
  for (let i = 0; i < chartPoints.length; i += 1) {
    const adjacentToGap = Boolean(gapBefore[i]) || Boolean(gapBefore[i + 1]);
    if (chartPoints.length <= 12 || adjacentToGap) {
      dots.push(chartPoints[i]!);
    }
  }

  const drainRanges: ComputeChartDrainRange[] = [];
  const drainMarkers: ComputeChartDrainMarker[] = [];
  for (let i = 0; i < chartPoints.length; i += 1) {
    const pt = chartPoints[i]!;
    if (!pt.draining) continue;
    const nextPoint = chartPoints[i + 1];
    const untilMs = Math.min(
      nextPoint ? nextPoint.timeMs : endMs,
      pt.timeMs + DRAIN_SAMPLE_WINDOW_MS,
    );
    const xEnd = mapX(untilMs);
    drainRanges.push({
      x: pt.x,
      width: Math.max(3, xEnd - pt.x),
      at: pt.at,
      usage: pt.usage,
      applied: pt.applied,
    });
    drainMarkers.push({
      cx: pt.x,
      cy: pt.usageY,
      at: pt.at,
      usage: pt.usage,
      applied: pt.applied,
    });
  }

  const hasGap = timed.some((item, idx) => item.point.gap || Boolean(gapBefore[idx]));
  const hasClockUncertain = timed.some((item) => item.point.clockUncertain);
  const hasDraining = drainMarkers.length > 0;

  return {
    empty: false,
    width,
    height,
    plotLeft,
    plotRight,
    plotTop,
    plotBottom,
    yMax,
    yTicks,
    xTicks,
    segments,
    dots,
    missingRanges,
    drainRanges,
    drainMarkers,
    hasGap,
    hasClockUncertain,
    hasDraining,
  };
}
