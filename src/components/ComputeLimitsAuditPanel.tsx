import type { ComputeLimitChangeRecord } from '../types';
import {
  LIMIT_STATUS_META,
  formatComputeDateTime,
  formatLimitRejectionReason,
  formatLimitsTriple,
} from './computeFormat';

interface ComputeLimitsTableProps {
  changes: ComputeLimitChangeRecord[];
  loading: boolean;
  onSelectWorker?: (instanceId: string) => void;
  emptyText?: string;
}

export function ComputeLimitsTable({
  changes,
  loading,
  onSelectWorker,
  emptyText = '尚无调限审计记录。',
}: ComputeLimitsTableProps) {
  if (loading && changes.length === 0) {
    return <div className="p-6 text-center text-xs text-slate-500">正在加载调限记录…</div>;
  }
  if (changes.length === 0) {
    return <div className="p-6 text-center text-xs text-slate-500">{emptyText}</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-slate-100 text-slate-500">
            <th className="py-2.5 px-4">修订</th>
            <th className="py-2.5 px-4">Worker 实例</th>
            <th className="py-2.5 px-4">操作管理员</th>
            <th className="py-2.5 px-4">修改前 → 提交值（总/编/探）</th>
            <th className="py-2.5 px-4">确认上限</th>
            <th className="py-2.5 px-4">状态 / 原因</th>
            <th className="py-2.5 px-4">请求 / 确认时间</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {changes.map((entry) => {
            const statusMeta = LIMIT_STATUS_META[entry.status];
            const reasonText = formatLimitRejectionReason(entry.reason);
            return (
              <tr key={entry.commandId} className="hover:bg-slate-50/70">
                <td className="py-2.5 px-4 font-mono font-semibold text-slate-900 whitespace-nowrap">
                  #{entry.revision}
                </td>
                <td className="py-2.5 px-4 font-mono whitespace-nowrap">
                  {onSelectWorker ? (
                    <button
                      type="button"
                      onClick={() => onSelectWorker(entry.instanceId)}
                      className="text-indigo-600 hover:underline cursor-pointer"
                    >
                      {entry.instanceId}
                    </button>
                  ) : (
                    <span className="text-slate-800">{entry.instanceId}</span>
                  )}
                </td>
                <td className="py-2.5 px-4 font-mono text-slate-700">{entry.requestedBy}</td>
                <td className="py-2.5 px-4 font-mono text-slate-800 whitespace-nowrap">
                  {formatLimitsTriple(entry.previousLimits)} →{' '}
                  <span className="font-semibold text-indigo-700">
                    {formatLimitsTriple(entry.requestedLimits)}
                  </span>
                </td>
                <td className="py-2.5 px-4 font-mono text-slate-600 whitespace-nowrap">
                  {formatLimitsTriple(entry.appliedLimits)}
                </td>
                <td className="py-2.5 px-4">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${statusMeta.badgeClass}`}
                  >
                    {statusMeta.label}
                  </span>
                  {reasonText && (
                    <div className="text-[11px] text-rose-700 mt-1">
                      {reasonText}（<code className="font-mono">{entry.reason}</code>）
                    </div>
                  )}
                </td>
                <td className="py-2.5 px-4 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                  <div>请求 {formatComputeDateTime(entry.requestedAt)}</div>
                  <div>确认 {formatComputeDateTime(entry.confirmedAt)}</div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface ComputeLimitsAuditPanelProps {
  instanceIds: string[];
  filterInstanceId: string;
  onFilterChange: (next: string) => void;
  changes: ComputeLimitChangeRecord[];
  loading: boolean;
  onOpenWorker: (instanceId: string) => void;
}

export function ComputeLimitsAuditPanel({
  instanceIds,
  filterInstanceId,
  onFilterChange,
  changes,
  loading,
  onOpenWorker,
}: ComputeLimitsAuditPanelProps) {
  return (
    <section className="rounded-xl bg-white border border-slate-200 shadow-2xs overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold text-slate-700">
            动态调限审计记录（{changes.length} 条）
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            上限按 总槽 / 编码 / 探测 排列，记录提交与 Worker 确认回执
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label
            htmlFor="audit-instance-filter"
            className="text-xs text-slate-500 whitespace-nowrap"
          >
            按实例筛选
          </label>
          <select
            id="audit-instance-filter"
            value={filterInstanceId}
            onChange={(e) => onFilterChange(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-800 outline-none focus:border-indigo-500"
          >
            <option value="">全部实例</option>
            {instanceIds.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </div>
      </div>
      <ComputeLimitsTable changes={changes} loading={loading} onSelectWorker={onOpenWorker} />
    </section>
  );
}
