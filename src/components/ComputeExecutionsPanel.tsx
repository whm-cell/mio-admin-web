import { AlertTriangle, Clock, Filter, ListTree, RotateCcw, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type {
  ComputeExecutionDetailResponse,
  ComputeWorkerExecutionState,
  ComputeWorkerExecutionView,
} from '../types';
import {
  COMPUTE_METRIC_LABELS,
  EXECUTION_STATE_META,
  formatComputeClockTime,
  formatComputeDateTime,
  formatSlotDuration,
  formatTimelineEventLabel,
  validateJobIdFilter,
} from './computeFormat';

export interface ComputeExecutionFilterValues {
  instanceId: string;
  jobId: string;
  state: ComputeWorkerExecutionState | '';
}

interface ComputeExecutionsPanelProps {
  instances: string[];
  executions: ComputeWorkerExecutionView[];
  loading: boolean;
  filters: ComputeExecutionFilterValues;
  onApplyFilters: (next: ComputeExecutionFilterValues) => void;
  selectedExecutionId: string | null;
  selectedExecution: ComputeExecutionDetailResponse | null;
  loadingDetail: boolean;
  detailError: string | null;
  onSelectExecution: (executionId: string | null) => void;
  onSelectWorker?: (instanceId: string) => void;
}

const EXECUTION_STATES: readonly ComputeWorkerExecutionState[] = [
  'queued',
  'active',
  'released',
  'cancelled',
  'unknown',
];

const EVENT_KIND_BADGE: Record<string, { label: string; className: string }> = {
  execution: { label: '占槽', className: 'bg-indigo-100 text-indigo-800' },
  phase: { label: '阶段', className: 'bg-sky-100 text-sky-800' },
  hold: { label: 'HOLD', className: 'bg-amber-100 text-amber-800' },
  limits: { label: '调限', className: 'bg-emerald-100 text-emerald-800' },
};

interface ExecutionDetailCardProps {
  executionId: string;
  detail: ComputeExecutionDetailResponse | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onSelectWorker?: (instanceId: string) => void;
}

function ExecutionDetailCard({
  executionId,
  detail,
  loading,
  error,
  onClose,
  onSelectWorker,
}: ExecutionDetailCardProps) {
  const sortedTimeline = useMemo(() => {
    if (!detail) return [];
    return [...detail.timeline].sort((a, b) => a.sequence - b.sequence);
  }, [detail]);

  return (
    <section className="rounded-xl bg-white border border-indigo-200 p-5 shadow-2xs space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2 min-w-0">
          <ListTree className="h-4 w-4 text-indigo-600 shrink-0" />
          <h4 className="text-sm font-semibold text-slate-900">执行占槽详情与时间线</h4>
          <span className="font-mono text-[11px] text-slate-500 truncate">{executionId}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 text-xs text-slate-600 hover:bg-slate-50 cursor-pointer"
        >
          <X className="h-3.5 w-3.5" /> 收起详情
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && !detail ? (
        <div className="py-6 text-center text-xs text-slate-500">正在加载执行时间线…</div>
      ) : detail ? (
        <>
          {(detail.uncertain || detail.state === 'unknown') && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3.5 py-2.5 text-xs text-amber-900 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold">检测到未知缺口 / 占槽状态不确定</div>
                <p className="mt-0.5 text-amber-800">
                  {detail.state === 'unknown'
                    ? '该执行可能受到 Worker 遥测缺失、实例重启或心跳超过 15 秒过期影响，当前占槽状态待确认。'
                    : '该执行已释放，但未观察到对应的取得槽位记录（可能发生在遥测缺失区间内）。'}
                </p>
              </div>
            </div>
          )}

          <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
              <dt className="text-slate-500">任务 ID (jobId)</dt>
              <dd className="font-mono text-slate-900 mt-1 break-all">{detail.jobId}</dd>
            </div>
            <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
              <dt className="text-slate-500">Attempt / Inspection</dt>
              <dd className="font-mono text-slate-800 mt-1 break-all">
                {detail.attemptId ?? detail.inspectionId ?? '—'}
              </dd>
            </div>
            <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
              <dt className="text-slate-500">Worker 实例 / Boot</dt>
              <dd className="mt-1 space-y-0.5">
                {onSelectWorker ? (
                  <button
                    type="button"
                    onClick={() => onSelectWorker(detail.instanceId)}
                    className="font-mono font-medium text-indigo-600 hover:underline cursor-pointer"
                  >
                    {detail.instanceId}
                  </button>
                ) : (
                  <div className="font-mono font-medium text-slate-900">{detail.instanceId}</div>
                )}
                <div className="font-mono text-[11px] text-slate-500 truncate">{detail.bootId}</div>
              </dd>
            </div>
            <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
              <dt className="text-slate-500">资源请求 / 当前占用</dt>
              <dd className="mt-1 font-medium text-slate-900">
                {COMPUTE_METRIC_LABELS[detail.resource]} · {detail.slots} 槽（当前：
                {detail.state === 'unknown'
                  ? '待确认'
                  : detail.state === 'active'
                    ? `${detail.slots} 槽`
                    : '0 槽'}
                ）
              </dd>
            </div>
            <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
              <dt className="text-slate-500">占槽状态</dt>
              <dd className="mt-1 flex items-center gap-1.5">
                <span
                  className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                    EXECUTION_STATE_META[detail.state].badgeClass
                  }`}
                >
                  {EXECUTION_STATE_META[detail.state].label}
                </span>
                <span className="font-mono text-[11px] text-slate-500">{detail.protocol}</span>
              </dd>
            </div>
            <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
              <dt className="text-slate-500">业务状态 / 阶段</dt>
              <dd className="mt-1 font-mono text-slate-800">
                {detail.businessState ?? '—'}
                {detail.businessStage ? ` / ${detail.businessStage}` : ''}
              </dd>
            </div>
            <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
              <dt className="text-slate-500">占槽开始 → 结束</dt>
              <dd className="mt-1 font-mono text-slate-800">
                {formatComputeClockTime(detail.acquiredAt)} →{' '}
                {formatComputeClockTime(detail.endedAt)}
              </dd>
            </div>
            <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
              <dt className="text-slate-500">占槽时长 / 入队时间</dt>
              <dd className="mt-1 font-mono text-slate-800">
                {formatSlotDuration(detail.acquiredAt, detail.endedAt)}
                <div className="text-[11px] text-slate-500">
                  入队：{formatComputeClockTime(detail.queuedAt)}
                </div>
              </dd>
            </div>
          </dl>

          <div className="space-y-2">
            <h5 className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-slate-500" />
              占槽与阶段事件时间线（按 sequence 排序，共 {sortedTimeline.length} 条）
            </h5>
            {sortedTimeline.length === 0 ? (
              <div className="rounded-lg bg-slate-50 border border-slate-100 p-3.5 text-xs text-slate-500">
                该执行暂无保留的事件时间线记录。
              </div>
            ) : (
              <ol className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                {sortedTimeline.map((item) => {
                  const badge = EVENT_KIND_BADGE[item.detail.kind] ?? {
                    label: item.detail.kind,
                    className: 'bg-slate-100 text-slate-700',
                  };
                  return (
                    <li
                      key={`${item.sequence}-${item.at}`}
                      className="px-3.5 py-2.5 bg-white flex flex-wrap items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[11px] text-slate-400">
                          #{item.sequence}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-medium ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                        <span className="font-medium text-slate-900">
                          {formatTimelineEventLabel(item.detail)}
                        </span>
                      </div>
                      <div className="font-mono text-[11px] text-slate-500">
                        事件 {formatComputeDateTime(item.at)} · A 接收{' '}
                        {formatComputeClockTime(item.receivedAt)}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}

interface ExecutionsTableSectionProps {
  executions: ComputeWorkerExecutionView[];
  loading: boolean;
  selectedExecutionId: string | null;
  onSelectExecution: (executionId: string | null) => void;
  onSelectWorker?: (instanceId: string) => void;
}

function ExecutionsTableSection({
  executions,
  loading,
  selectedExecutionId,
  onSelectExecution,
  onSelectWorker,
}: ExecutionsTableSectionProps) {
  return (
    <section className="rounded-xl bg-white border border-slate-200 shadow-2xs overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-700">
          最近任务占槽记录（{executions.length} 条）
        </span>
        <span className="text-[11px] text-slate-500">点击任意行展开该次执行的占槽事件时间线</span>
      </div>

      {loading && executions.length === 0 ? (
        <div className="p-8 text-center text-xs text-slate-500">正在加载任务占槽记录…</div>
      ) : executions.length === 0 ? (
        <div className="p-8 text-center text-xs text-slate-500">尚无符合条件的任务占槽记录。</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-slate-500">
                <th className="py-2.5 px-4">任务 ID</th>
                <th className="py-2.5 px-4">Worker 实例</th>
                <th className="py-2.5 px-4">资源 / 协议</th>
                <th className="py-2.5 px-4">占槽状态</th>
                <th className="py-2.5 px-4">业务状态</th>
                <th className="py-2.5 px-4">最后观测</th>
                <th className="py-2.5 px-4 text-right">时间线</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {executions.map((row) => {
                const isSelected = selectedExecutionId === row.executionId;
                const stateMeta = EXECUTION_STATE_META[row.state];
                return (
                  <tr
                    key={row.executionId}
                    onClick={() => onSelectExecution(isSelected ? null : row.executionId)}
                    className={`transition cursor-pointer ${
                      isSelected ? 'bg-indigo-50/70' : 'hover:bg-slate-50/80'
                    }`}
                  >
                    <td className="py-2.5 px-4">
                      <div className="font-mono font-medium text-slate-900 break-all">
                        {row.jobId}
                      </div>
                      <div className="font-mono text-[10px] text-slate-400">
                        exec {row.executionId.slice(0, 8)}…
                      </div>
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-700 whitespace-nowrap">
                      {onSelectWorker ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectWorker(row.instanceId);
                          }}
                          className="text-indigo-600 hover:underline cursor-pointer"
                        >
                          {row.instanceId}
                        </button>
                      ) : (
                        row.instanceId
                      )}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <span className="font-medium text-slate-800">
                        {COMPUTE_METRIC_LABELS[row.resource]}
                      </span>
                      <span className="text-slate-400 mx-1">·</span>
                      <span className="font-mono text-[11px] text-slate-500">{row.protocol}</span>
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${stateMeta.badgeClass}`}
                      >
                        {stateMeta.label}
                      </span>
                      {row.uncertain && row.state !== 'unknown' && (
                        <span className="ml-1.5 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-medium">
                          缺口
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                      {row.businessState ?? '—'}
                      {row.businessStage ? ` (${row.businessStage})` : ''}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-500 whitespace-nowrap">
                      {formatComputeDateTime(row.lastAt)}
                    </td>
                    <td className="py-2.5 px-4 text-right whitespace-nowrap">
                      <span className="text-indigo-600 font-medium">
                        {isSelected ? '已展开' : '查看'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function ComputeExecutionsPanel({
  instances,
  executions,
  loading,
  filters,
  onApplyFilters,
  selectedExecutionId,
  selectedExecution,
  loadingDetail,
  detailError,
  onSelectExecution,
  onSelectWorker,
}: ComputeExecutionsPanelProps) {
  const [instanceInput, setInstanceInput] = useState(filters.instanceId);
  const [stateInput, setStateInput] = useState<ComputeWorkerExecutionState | ''>(filters.state);
  const [jobIdInput, setJobIdInput] = useState(filters.jobId);
  const [jobIdError, setJobIdError] = useState<string | null>(null);

  const hasActiveFilters = Boolean(filters.instanceId || filters.jobId || filters.state);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const checked = validateJobIdFilter(jobIdInput);
    if (checked.error) {
      setJobIdError(checked.error);
      return;
    }
    setJobIdError(null);
    onApplyFilters({
      instanceId: instanceInput,
      jobId: checked.value ?? '',
      state: stateInput,
    });
  };

  const handleReset = () => {
    setInstanceInput('');
    setStateInput('');
    setJobIdInput('');
    setJobIdError(null);
    onApplyFilters({ instanceId: '', jobId: '', state: '' });
  };

  return (
    <div className="space-y-4">
      <form
        onSubmit={handleSubmit}
        className="rounded-xl bg-white border border-slate-200 p-4 shadow-2xs space-y-3"
      >
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
          <Filter className="h-3.5 w-3.5 text-indigo-600" />
          <span>筛选任务占槽记录</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-3 space-y-1">
            <label
              htmlFor="exec-filter-instance"
              className="block text-[11px] font-medium text-slate-600"
            >
              Worker 实例
            </label>
            <select
              id="exec-filter-instance"
              value={instanceInput}
              onChange={(e) => setInstanceInput(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs text-slate-800 outline-none focus:border-indigo-500"
            >
              <option value="">全部实例</option>
              {instances.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2 space-y-1">
            <label
              htmlFor="exec-filter-state"
              className="block text-[11px] font-medium text-slate-600"
            >
              占槽状态
            </label>
            <select
              id="exec-filter-state"
              value={stateInput}
              onChange={(e) => setStateInput(e.target.value as ComputeWorkerExecutionState | '')}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs text-slate-800 outline-none focus:border-indigo-500"
            >
              <option value="">全部状态</option>
              {EXECUTION_STATES.map((st) => (
                <option key={st} value={st}>
                  {EXECUTION_STATE_META[st].label}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-5 space-y-1">
            <label
              htmlFor="exec-filter-job"
              className="block text-[11px] font-medium text-slate-600"
            >
              任务 UUID (jobId)
            </label>
            <input
              id="exec-filter-job"
              type="text"
              value={jobIdInput}
              onChange={(e) => {
                setJobIdInput(e.target.value);
                if (jobIdError) setJobIdError(null);
              }}
              placeholder="输入 36 位任务 UUID，留空查询全部"
              className={`w-full px-3 py-2 rounded-lg border text-xs font-mono outline-none ${
                jobIdError
                  ? 'border-rose-400 focus:border-rose-500 bg-rose-50/30'
                  : 'border-slate-300 focus:border-indigo-500 bg-white'
              }`}
            />
          </div>

          <div className="md:col-span-2 flex items-center gap-2">
            <button
              type="submit"
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium cursor-pointer"
            >
              <Search className="h-3.5 w-3.5" />
              查询
            </button>
            {(hasActiveFilters || instanceInput || stateInput || jobIdInput) && (
              <button
                type="button"
                onClick={handleReset}
                title="重置筛选"
                className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {jobIdError && <p className="text-xs text-rose-600">{jobIdError}</p>}
      </form>

      {selectedExecutionId && (
        <ExecutionDetailCard
          executionId={selectedExecutionId}
          detail={selectedExecution}
          loading={loadingDetail}
          error={detailError}
          onClose={() => onSelectExecution(null)}
          onSelectWorker={onSelectWorker}
        />
      )}

      <ExecutionsTableSection
        executions={executions}
        loading={loading}
        selectedExecutionId={selectedExecutionId}
        onSelectExecution={onSelectExecution}
        onSelectWorker={onSelectWorker}
      />
    </div>
  );
}
