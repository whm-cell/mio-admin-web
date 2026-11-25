import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Cpu,
  ExternalLink,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldAlert,
  SlidersHorizontal,
} from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { ApiClientError, adminApi } from '../api';
import type { ComputeWorkerLimits, ComputeWorkerMetricKey, ComputeWorkerView } from '../types';
import {
  COMPUTE_METRIC_KEYS,
  COMPUTE_METRIC_LABELS,
  LIMIT_STATUS_META,
  WORKER_STATUS_META,
  formatAgeMs,
  formatComputeClockTime,
  formatComputeDateTime,
  formatLimitRejectionReason,
  formatLimitsTriple,
  limitsToFormDraft,
  validateComputeLimitsDraft,
} from './computeFormat';
import type { ComputeLimitFormDraft } from './computeFormat';

interface ComputeWorkerDetailPanelProps {
  worker: ComputeWorkerView;
  onRefresh: () => Promise<void> | void;
  onSelectExecution?: (executionId: string) => void;
  onUnauthorized?: (message: string) => void;
}

interface LimitSubmissionState {
  commandId: string;
  revision: number;
  limits: ComputeWorkerLimits;
}

interface LimitDraftState {
  basedOnRevision: number;
  values: ComputeLimitFormDraft;
}

interface LimitStatusFeedbackProps {
  desired: ComputeWorkerView['desired'];
  activeSubmission: LimitSubmissionState | null;
}

function LimitStatusFeedback({ desired, activeSubmission }: LimitStatusFeedbackProps) {
  if (activeSubmission) {
    const matchedDesired =
      desired &&
      desired.revision === activeSubmission.revision &&
      (desired.commandId === null || desired.commandId === activeSubmission.commandId);

    if (matchedDesired && desired.status === 'applied') {
      return (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-800 flex items-start gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
          <div>
            <div className="font-medium">
              修订 #{activeSubmission.revision} 已生效，Worker 已确认
            </div>
            <div className="text-[11px] text-emerald-700 mt-0.5">
              目标上限 {formatLimitsTriple(desired.limits)} · 确认时间{' '}
              {formatComputeDateTime(desired.confirmedAt)}
            </div>
          </div>
        </div>
      );
    }

    if (matchedDesired && desired.status === 'rejected') {
      return (
        <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-800 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-rose-600 mt-0.5 shrink-0" />
          <div>
            <div className="font-medium">修订 #{activeSubmission.revision} 已被 Worker 拒绝</div>
            <div className="text-[11px] text-rose-700 mt-0.5">
              {formatLimitRejectionReason(desired.reason) ?? '请查看调限审计明细'}
            </div>
          </div>
        </div>
      );
    }

    if (!desired || desired.revision <= activeSubmission.revision) {
      return (
        <div className="rounded-lg bg-indigo-50 border border-indigo-200 px-3 py-2 text-xs text-indigo-900 flex items-start gap-2">
          <Clock className="h-4 w-4 text-indigo-600 mt-0.5 shrink-0" />
          <div>
            <div className="font-medium">
              修订 #{activeSubmission.revision} 已提交（待 Worker 确认生效）
            </div>
            <div className="text-[11px] text-indigo-700 mt-0.5">
              提交值 {formatLimitsTriple(activeSubmission.limits)} · 状态：待生效 (pending)
            </div>
          </div>
        </div>
      );
    }
  }

  if (desired && desired.status) {
    const meta = LIMIT_STATUS_META[desired.status];
    const reasonText = formatLimitRejectionReason(desired.reason);
    return (
      <div
        className={`rounded-lg border px-3 py-2 text-xs space-y-1 ${
          desired.status === 'rejected'
            ? 'bg-rose-50 border-rose-200 text-rose-800'
            : desired.status === 'applied'
              ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
              : 'bg-amber-50 border-amber-200 text-amber-900'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-medium font-mono">
            最近期望修订 #{desired.revision} · {formatLimitsTriple(desired.limits)}
          </span>
          <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${meta.badgeClass}`}>
            {meta.label}
          </span>
        </div>
        {reasonText && <div className="text-[11px]">{reasonText}</div>}
        <div className="text-[11px] opacity-80">
          请求时间 {formatComputeDateTime(desired.requestedAt)}
          {desired.confirmedAt ? ` · 确认时间 ${formatComputeDateTime(desired.confirmedAt)}` : ''}
        </div>
      </div>
    );
  }

  return null;
}

interface WorkerLimitFieldsProps {
  hard: ComputeWorkerLimits | null;
  displayedValues: ComputeLimitFormDraft;
  fieldErrors: Partial<Record<ComputeWorkerMetricKey, string>>;
  pausesResources: ComputeWorkerMetricKey[];
  isZeroAll: boolean;
  disabled: boolean;
  onFieldChange: (key: ComputeWorkerMetricKey, nextValue: string) => void;
}

function WorkerLimitFields({
  hard,
  displayedValues,
  fieldErrors,
  pausesResources,
  isZeroAll,
  disabled,
  onFieldChange,
}: WorkerLimitFieldsProps) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {COMPUTE_METRIC_KEYS.map((key) => {
          const hardMax = hard?.[key];
          const fieldError = fieldErrors[key];
          return (
            <div key={key} className="space-y-1">
              <label
                htmlFor={`worker-limit-${key}`}
                className="flex items-center justify-between text-xs font-medium text-slate-700"
              >
                <span>{COMPUTE_METRIC_LABELS[key]}上限</span>
                {hardMax !== undefined && (
                  <span className="text-[11px] font-mono text-slate-400">0–{hardMax}</span>
                )}
              </label>
              <input
                id={`worker-limit-${key}`}
                type="number"
                min={0}
                max={hardMax}
                step={1}
                inputMode="numeric"
                disabled={disabled}
                value={displayedValues[key]}
                onChange={(e) => onFieldChange(key, e.target.value)}
                className={`w-full px-3 py-2 rounded-lg border text-xs font-mono outline-none disabled:bg-slate-100 disabled:text-slate-400 ${
                  fieldError
                    ? 'border-rose-400 focus:border-rose-500 bg-rose-50/30'
                    : 'border-slate-300 focus:border-indigo-500 bg-white'
                }`}
              />
              {fieldError && <p className="text-[11px] text-rose-600">{fieldError}</p>}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-slate-500 leading-relaxed">
        设为 <code className="font-mono text-slate-700">0</code> 可暂停对应资源的新任务准入（
        <code className="font-mono text-slate-700">0 / 0 / 0</code>{' '}
        表示暂停全部新任务）。已运行的任务将继续完成，不会被强行中断。
      </p>

      {pausesResources.length > 0 && (
        <div className="rounded-lg bg-amber-50/80 border border-amber-200 px-3 py-2 text-xs text-amber-900">
          {isZeroAll
            ? '暂停确认提示：即将提交 0 / 0 / 0 暂停接收全部新任务，已运行任务将继续完成。'
            : `暂停提示：已将 ${pausesResources.map((k) => COMPUTE_METRIC_LABELS[k]).join('、')} 设为 0，对应新任务将暂停准入，已运行任务将继续完成。`}
        </div>
      )}
    </>
  );
}

interface WorkerLimitsFormProps {
  worker: ComputeWorkerView;
  onRefresh: () => Promise<void> | void;
  onUnauthorized?: (message: string) => void;
}

function WorkerLimitsForm({ worker, onRefresh, onUnauthorized }: WorkerLimitsFormProps) {
  const [draft, setDraft] = useState<LimitDraftState | null>(null);
  const [submission, setSubmission] = useState<LimitSubmissionState | null>(null);
  const [saving, setSaving] = useState(false);
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const snapshot = worker.snapshot;
  const desired = worker.desired;

  const latestRevision = Math.max(
    snapshot?.limits.revision ?? 0,
    desired?.revision ?? 0,
    submission?.revision ?? 0,
  );

  const serverBaselineLimits: ComputeWorkerLimits | null = snapshot
    ? submission && submission.revision > (desired?.revision ?? 0)
      ? submission.limits
      : (desired?.limits ?? snapshot.limits.applied)
    : null;

  const displayedValues: ComputeLimitFormDraft = draft
    ? draft.values
    : serverBaselineLimits
      ? limitsToFormDraft(serverBaselineLimits)
      : { total: '', encode: '', probe: '' };

  const expectedRevision = draft ? draft.basedOnRevision : latestRevision;
  const isDirty = draft !== null;
  const validation = snapshot
    ? validateComputeLimitsDraft(displayedValues, snapshot.limits.hard)
    : null;

  const handleFieldChange = (key: ComputeWorkerMetricKey, nextValue: string) => {
    if (!serverBaselineLimits) return;
    setConflictError(null);
    setSubmitError(null);
    setDraft((prev) => {
      if (prev) {
        return {
          ...prev,
          values: { ...prev.values, [key]: nextValue },
        };
      }
      return {
        basedOnRevision: latestRevision,
        values: { ...limitsToFormDraft(serverBaselineLimits), [key]: nextValue },
      };
    });
  };

  const handleCancelEdit = () => {
    setDraft(null);
    setConflictError(null);
    setSubmitError(null);
  };

  const handleResolveConflict = () => {
    setDraft(null);
    setConflictError(null);
    setSubmitError(null);
    void onRefresh();
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!snapshot || saving || !validation || !validation.valid || !validation.limits) {
      return;
    }

    setSaving(true);
    setConflictError(null);
    setSubmitError(null);
    try {
      const accepted = await adminApi.updateComputeWorkerLimits(worker.instanceId, {
        expectedRevision,
        total: validation.limits.total,
        encode: validation.limits.encode,
        probe: validation.limits.probe,
      });
      setSubmission({
        commandId: accepted.commandId,
        revision: accepted.revision,
        limits: accepted.limits,
      });
      setDraft(null);
      await onRefresh();
    } catch (err) {
      if (
        err instanceof ApiClientError &&
        (err.status === 401 || err.code === 'ADMIN_UNAUTHORIZED')
      ) {
        onUnauthorized?.(err.message);
        setSubmitError(err.message);
      } else if (err instanceof ApiClientError && err.code === 'WORKER_REVISION_CONFLICT') {
        setConflictError(err.message);
      } else {
        setSubmitError(err instanceof Error ? err.message : '提交调限失败，请查看调限审计');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl bg-white border border-slate-200 p-5 shadow-2xs space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-indigo-600" />
            <span>动态并发调限</span>
          </h4>
          <p className="text-xs text-slate-500 mt-0.5 font-mono">
            {snapshot
              ? `当前修订 #${latestRevision} · 编辑基于 #${expectedRevision}`
              : '收到首次心跳快照后可调整并发上限'}
          </p>
        </div>
        {snapshot && (
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-slate-100 text-slate-700">
            硬上限 {formatLimitsTriple(snapshot.limits.hard)}
          </span>
        )}
      </div>

      {isDirty && latestRevision > expectedRevision && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <span>
            后台轮询检测到服务端修订已更新至 #{latestRevision}（当前编辑基于 #{expectedRevision}
            ）；已保留你的未保存输入，可先点击「取消修改」同步最新配置。
          </span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <WorkerLimitFields
          hard={snapshot?.limits.hard ?? null}
          displayedValues={displayedValues}
          fieldErrors={validation?.fieldErrors ?? {}}
          pausesResources={validation?.valid ? validation.pausesResources : []}
          isZeroAll={Boolean(
            validation?.valid &&
            validation.limits?.total === 0 &&
            validation.limits?.encode === 0 &&
            validation.limits?.probe === 0,
          )}
          disabled={!snapshot || saving}
          onFieldChange={handleFieldChange}
        />

        {conflictError && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 p-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-2 text-xs text-rose-800">
              <ShieldAlert className="h-4 w-4 text-rose-600 mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold">配置修订冲突（409 WORKER_REVISION_CONFLICT）</div>
                <p className="mt-0.5">{conflictError}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleResolveConflict}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-medium cursor-pointer shrink-0"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              刷新最新配置重填
            </button>
          </div>
        )}

        {submitError && (
          <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{submitError}</span>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="text-[11px] text-slate-500">
            {isDirty
              ? '存在未保存修改（自动轮询不会覆盖当前输入）'
              : snapshot
                ? '当前输入与最新服务端基线一致'
                : '等待实例首次遥测快照'}
          </div>
          <div className="flex items-center gap-2">
            {isDirty && (
              <button
                type="button"
                disabled={saving}
                onClick={handleCancelEdit}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                取消修改
              </button>
            )}
            <button
              type="submit"
              disabled={!snapshot || !isDirty || !validation?.valid || saving}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-medium cursor-pointer"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? '提交中…' : '保存上限'}
            </button>
          </div>
        </div>
      </form>

      <LimitStatusFeedback desired={desired} activeSubmission={submission} />
    </section>
  );
}

interface WorkerActiveExecutionsCardProps {
  worker: ComputeWorkerView;
  onSelectExecution?: (executionId: string) => void;
}

function WorkerActiveExecutionsCard({
  worker,
  onSelectExecution,
}: WorkerActiveExecutionsCardProps) {
  const snapshot = worker.snapshot;

  return (
    <section className="rounded-xl bg-white border border-slate-200 p-5 shadow-2xs space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-slate-900">
          当前活动执行（{snapshot ? snapshot.active.length : 0}）
        </h4>
        {snapshot && (
          <span className="text-[11px] text-slate-500 font-mono">
            占用 {snapshot.usage.total} 槽（编码 {snapshot.usage.encode} · 探测{' '}
            {snapshot.usage.probe}）
          </span>
        )}
      </div>

      {!snapshot ? (
        <div className="rounded-lg bg-slate-50 border border-slate-100 p-4 text-xs text-slate-500">
          收到心跳快照后将显示当前活动执行列表。
        </div>
      ) : (
        <>
          {worker.status !== 'online' && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
              当前实例状态为「{WORKER_STATUS_META[worker.status].label}
              」，以下占用信息来自最近一次快照，待恢复在线心跳后确认。
            </div>
          )}

          {snapshot.active.length === 0 ? (
            <div className="rounded-lg bg-slate-50 border border-slate-100 p-4 text-xs text-slate-500">
              当前无正在占槽的执行任务。
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                    <th className="py-2 px-3">任务 ID</th>
                    <th className="py-2 px-3">资源 / 槽位</th>
                    <th className="py-2 px-3">协议</th>
                    <th className="py-2 px-3">取得槽位时间</th>
                    <th className="py-2 px-3 text-right">时间线</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {snapshot.active.map((exec) => (
                    <tr key={exec.executionId} className="hover:bg-slate-50/70">
                      <td className="py-2 px-3 font-mono text-slate-900 break-all">{exec.jobId}</td>
                      <td className="py-2 px-3 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-medium text-[11px]">
                          {COMPUTE_METRIC_LABELS[exec.resource]} · {exec.slots} 槽
                        </span>
                      </td>
                      <td className="py-2 px-3 font-mono text-slate-600">{exec.protocol}</td>
                      <td className="py-2 px-3 font-mono text-slate-500 whitespace-nowrap">
                        {formatComputeClockTime(exec.acquiredAt)}
                      </td>
                      <td className="py-2 px-3 text-right whitespace-nowrap">
                        {onSelectExecution ? (
                          <button
                            type="button"
                            onClick={() => onSelectExecution(exec.executionId)}
                            className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-medium cursor-pointer"
                          >
                            详情 <ExternalLink className="h-3 w-3" />
                          </button>
                        ) : (
                          <span className="font-mono text-[11px] text-slate-400">
                            {exec.executionId.slice(0, 8)}…
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}

export function ComputeWorkerDetailPanel({
  worker,
  onRefresh,
  onSelectExecution,
  onUnauthorized,
}: ComputeWorkerDetailPanelProps) {
  const statusMeta = WORKER_STATUS_META[worker.status];
  const snapshot = worker.snapshot;

  const heldEntries = snapshot
    ? (['encode', 'probe'] as const)
        .map((key) => ({ key, items: snapshot.holds[key] }))
        .filter((item) => item.items.length > 0)
    : [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* Left: Status, Warnings & Capacity Table */}
        <section className="xl:col-span-7 rounded-xl bg-white border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Cpu className="h-4 w-4 text-indigo-600 shrink-0" />
                <h3 className="text-base font-semibold font-mono text-slate-900 break-all">
                  {worker.instanceId}
                </h3>
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${statusMeta.badgeClass}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${statusMeta.dotClass}`} />
                  {statusMeta.label}
                </span>
                {worker.draining && (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-orange-100 text-orange-800 border border-orange-200">
                    排空中
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-500 mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                <span>
                  Boot ID: <code className="font-mono text-slate-700">{worker.bootId ?? '—'}</code>
                </span>
                <span>最近观测：{formatComputeDateTime(worker.observedAt)}</span>
                <span>A 侧接收：{formatComputeDateTime(worker.receivedAt)}</span>
                <span>新鲜度：{formatAgeMs(worker.ageMs)}</span>
              </div>
            </div>
          </div>

          {(worker.draining || worker.clockUncertain || worker.gap || heldEntries.length > 0) && (
            <div className="space-y-2">
              {worker.draining && (
                <div className="rounded-lg bg-orange-50 border border-orange-200 px-3 py-2 text-xs text-orange-900 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-600 mt-0.5 shrink-0" />
                  <span>
                    当前处于超限排空中：存量运行任务将继续执行，占用降至已生效上限以内后才会接收新任务。
                  </span>
                </div>
              )}
              {worker.clockUncertain && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <span>观测时间与 A 侧接收时间相差超过 15 秒，存在传输延迟或节点时钟偏差。</span>
                </div>
              )}
              {worker.gap && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <span>
                    Worker 已报告 {worker.gap.count} 条遥测缺失（序段 #{worker.gap.first.sequence}–#
                    {worker.gap.last.sequence}）。
                  </span>
                </div>
              )}
              {heldEntries.map((entry) => (
                <div
                  key={entry.key}
                  className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900 flex items-start gap-2"
                >
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <span className="break-all">
                    {COMPUTE_METRIC_LABELS[entry.key]}资源存在 HOLD 阻断（{entry.items.length}{' '}
                    项）：
                    <code className="font-mono">{entry.items.join('、')}</code>
                  </span>
                </div>
              ))}
            </div>
          )}

          {snapshot ? (
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                    <th className="py-2 px-3">资源类别</th>
                    <th className="py-2 px-3">实际占用</th>
                    <th className="py-2 px-3">已生效上限</th>
                    <th className="py-2 px-3">部署硬上限</th>
                    <th className="py-2 px-3">待槽数</th>
                    <th className="py-2 px-3">HOLD 阻断</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {COMPUTE_METRIC_KEYS.map((key) => {
                    const isOver = snapshot.usage[key] > snapshot.limits.applied[key];
                    const holdCount =
                      key === 'total'
                        ? snapshot.holds.encode.length + snapshot.holds.probe.length
                        : snapshot.holds[key].length;
                    return (
                      <tr key={key} className={isOver ? 'bg-orange-50/50' : ''}>
                        <td className="py-2.5 px-3 font-sans font-medium text-slate-900">
                          {COMPUTE_METRIC_LABELS[key]}
                        </td>
                        <td
                          className={`py-2.5 px-3 font-semibold ${
                            isOver ? 'text-orange-700' : 'text-indigo-700'
                          }`}
                        >
                          {snapshot.usage[key]}
                          {isOver && (
                            <span className="ml-1.5 font-sans text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-800">
                              排空
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-slate-800">
                          {snapshot.limits.applied[key]}
                        </td>
                        <td className="py-2.5 px-3 text-slate-500">{snapshot.limits.hard[key]}</td>
                        <td className="py-2.5 px-3 text-slate-700">{snapshot.waiting[key]}</td>
                        <td
                          className={`py-2.5 px-3 ${
                            holdCount > 0 ? 'text-amber-700 font-semibold' : 'text-slate-400'
                          }`}
                        >
                          {holdCount}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-lg bg-slate-50 border border-slate-100 p-4 text-xs text-slate-500">
              尚无此实例的容量与占用记录（状态：{statusMeta.label}）。收到首次心跳后将自动展示。
            </div>
          )}
        </section>

        {/* Right: Dynamic Limits Editor */}
        <div className="xl:col-span-5">
          <WorkerLimitsForm
            key={worker.instanceId}
            worker={worker}
            onRefresh={onRefresh}
            onUnauthorized={onUnauthorized}
          />
        </div>
      </div>

      <WorkerActiveExecutionsCard worker={worker} onSelectExecution={onSelectExecution} />
    </div>
  );
}
