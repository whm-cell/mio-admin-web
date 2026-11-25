import { Activity, AlertTriangle } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ComputeHistoryResponse, ComputeWorkerMetricKey } from '../types';
import {
  COMPUTE_METRIC_KEYS,
  COMPUTE_METRIC_LABELS,
  buildComputeHistoryChartModel,
  formatComputeClockTime,
} from './computeFormat';
import type { ComputeHistoryChartModel } from './computeFormat';

interface ComputeHistoryChartProps {
  title: string;
  subtitle?: string;
  history: ComputeHistoryResponse | null;
  loading?: boolean;
  isAggregate?: boolean;
}

interface ComputeHistorySvgProps {
  model: ComputeHistoryChartModel;
  activeMetric: ComputeWorkerMetricKey;
}

function ComputeHistorySvg({ model, activeMetric }: ComputeHistorySvgProps) {
  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${model.width} ${model.height}`}
        role="img"
        aria-label={`${COMPUTE_METRIC_LABELS[activeMetric]}实际占用、已生效上限与部署硬上限曲线。采样缺口处曲线断开。`}
        className="w-full min-w-[320px] h-auto block select-none"
      >
        {model.yTicks.map((tick) => (
          <g key={`y-${tick.value}`}>
            <line
              x1={model.plotLeft}
              x2={model.plotRight}
              y1={tick.y}
              y2={tick.y}
              stroke="#e2e8f0"
              strokeWidth={1}
            />
            <text
              x={model.plotLeft - 8}
              y={tick.y + 4}
              textAnchor="end"
              fill="#64748b"
              fontSize={11}
              className="font-mono"
            >
              {tick.value}
            </text>
          </g>
        ))}

        {model.xTicks.map((tick, idx) => (
          <text
            key={`x-${idx}`}
            x={tick.x}
            y={model.height - 6}
            textAnchor={tick.anchor}
            fill="#64748b"
            fontSize={11}
            className="font-mono"
          >
            {tick.label}
          </text>
        ))}

        {model.missingRanges.map((range, idx) => (
          <rect
            key={`gap-${idx}`}
            x={range.x}
            y={model.plotTop}
            width={range.width}
            height={model.plotBottom - model.plotTop}
            fill="#e2e8f0"
            fillOpacity={0.65}
          >
            <title>
              采样缺口：{formatComputeClockTime(range.fromAt)} –{' '}
              {formatComputeClockTime(range.toAt)}
            </title>
          </rect>
        ))}

        {model.drainRanges.map((range, idx) => (
          <rect
            key={`drain-range-${idx}`}
            x={range.x}
            y={model.plotTop}
            width={range.width}
            height={model.plotBottom - model.plotTop}
            fill="#fdba74"
            fillOpacity={0.5}
          >
            <title>
              超限排空（{formatComputeClockTime(range.at)}）：占用 {range.usage} &gt; 生效上限{' '}
              {range.applied}
            </title>
          </rect>
        ))}

        {model.segments.map((segment, idx) => (
          <g key={`seg-${idx}`}>
            <path
              d={segment.hardPath}
              fill="none"
              stroke="#64748b"
              strokeWidth={1.75}
              strokeDasharray="3 4"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={segment.appliedStepPath}
              fill="none"
              stroke="#0284c7"
              strokeWidth={2}
              strokeDasharray="6 3"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={segment.usagePath}
              fill="none"
              stroke="#4f46e5"
              strokeWidth={2.25}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        ))}

        {model.dots.map((pt) => (
          <circle
            key={`dot-${pt.index}`}
            cx={pt.x}
            cy={pt.usageY}
            r={3}
            fill="#4f46e5"
            stroke="#ffffff"
            strokeWidth={1}
          >
            <title>
              {formatComputeClockTime(pt.at)} · 占用 {pt.usage} / 生效 {pt.applied} / 硬上限{' '}
              {pt.hard}
            </title>
          </circle>
        ))}

        {model.drainMarkers.map((marker, idx) => (
          <circle
            key={`drain-dot-${idx}`}
            cx={marker.cx}
            cy={marker.cy}
            r={3.5}
            fill="#ea580c"
            stroke="#ffffff"
            strokeWidth={1.25}
          >
            <title>
              超限排空（{formatComputeClockTime(marker.at)}）：占用 {marker.usage} &gt; 生效上限{' '}
              {marker.applied}
            </title>
          </circle>
        ))}
      </svg>
    </div>
  );
}

export function ComputeHistoryChart({
  title,
  subtitle = '实际占用、已生效上限阶梯线与部署硬上限（间隔超过 15 秒自动断开）',
  history,
  loading = false,
  isAggregate = false,
}: ComputeHistoryChartProps) {
  const [activeMetric, setActiveMetric] = useState<ComputeWorkerMetricKey>('total');

  const model = useMemo(
    () => buildComputeHistoryChartModel(history, activeMetric),
    [history, activeMetric],
  );

  const qualityNotes = useMemo(() => {
    if (model.empty) return [];
    const notes: string[] = [];
    if (isAggregate) {
      notes.push('汇总口径使用各实例 15 秒内的最近样本。');
    }
    if (model.hasGap) {
      notes.push('浅灰阴影区间表示采样缺测（间隔 > 15 秒、遥测缺失或实例重启），曲线已自动断开。');
    }
    if (model.hasClockUncertain) {
      notes.push('部分样本观测时间与服务端接收时间相差超过 15 秒（存在传输延迟或时钟偏差）。');
    }
    if (model.hasDraining) {
      notes.push('橙色阴影与圆点标记采样时实际占用高于已生效上限（排空中）。');
    }
    return notes;
  }, [isAggregate, model.empty, model.hasClockUncertain, model.hasDraining, model.hasGap]);

  return (
    <section className="rounded-xl bg-white border border-slate-200 p-5 shadow-2xs space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <Activity className="h-4 w-4 text-indigo-600 shrink-0" />
            <span>{title}</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
        </div>

        <div
          role="radiogroup"
          aria-label="并发曲线资源类别"
          className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs"
        >
          {COMPUTE_METRIC_KEYS.map((key) => {
            const selected = activeMetric === key;
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setActiveMetric(key)}
                className={`px-3 py-1.5 rounded-md font-medium transition cursor-pointer ${
                  selected
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {COMPUTE_METRIC_LABELS[key]}
              </button>
            );
          })}
        </div>
      </div>

      {loading && !history ? (
        <div className="rounded-lg bg-slate-50 border border-slate-100 py-12 text-center text-xs text-slate-500">
          正在加载并发历史采样…
        </div>
      ) : model.empty ? (
        <div className="rounded-lg bg-slate-50 border border-slate-100 py-10 text-center text-xs text-slate-500">
          当前时间范围内暂无并发采样记录。
        </div>
      ) : (
        <ComputeHistorySvg model={model} activeMetric={activeMetric} />
      )}

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-600 pt-1">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-4 border-t-2 border-indigo-600" />
          实际占用
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-4 border-t-2 border-dashed border-sky-600" />
          已生效上限（阶梯）
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-4 border-t-2 border-dotted border-slate-500" />
          部署硬上限
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-xs bg-slate-200 border border-slate-300" />
          采样缺测区间
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-xs bg-orange-300/80 border border-orange-400" />
          超限排空区间
        </span>
      </div>

      {qualityNotes.length > 0 && (
        <div
          className={`rounded-lg px-3 py-2 text-[11px] flex items-start gap-2 ${
            model.hasClockUncertain || model.hasDraining || model.hasGap
              ? 'bg-amber-50/70 border border-amber-200/80 text-amber-900'
              : 'bg-slate-50 border border-slate-200/70 text-slate-600'
          }`}
        >
          {(model.hasClockUncertain || model.hasDraining || model.hasGap) && (
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
          )}
          <div className="leading-relaxed">{qualityNotes.join(' ')}</div>
        </div>
      )}
    </section>
  );
}
