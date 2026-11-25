import { useMemo } from 'react';
import type { ComputeHistoryResponse, ComputeSummaryResponse, ComputeWorkerView } from '../types';
import { ComputeHistoryChart } from './ComputeHistoryChart';
import { LIMIT_STATUS_META, WORKER_STATUS_META, formatComputeDateTime } from './computeFormat';

interface ComputeOverviewPanelProps {
  summary: ComputeSummaryResponse | null;
  workers: ComputeWorkerView[];
  history: ComputeHistoryResponse | null;
  loading: boolean;
  onOpenWorker: (instanceId: string) => void;
}

export function ComputeOverviewPanel({
  summary,
  workers,
  history,
  loading,
  onOpenWorker,
}: ComputeOverviewPanelProps) {
  const topPeak = useMemo(() => {
    if (!summary || summary.peaks.length === 0) return null;
    return summary.peaks.reduce((best, item) => (item.peak > best.peak ? item : best));
  }, [summary]);

  return (
    <div className="space-y-5">
      {summary ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3.5">
          <div className="rounded-xl bg-indigo-600 text-white p-4 shadow-2xs">
            <div className="text-xs text-indigo-100">在线并发（占用 / 生效上限）</div>
            <div className="text-2xl font-semibold font-mono mt-1.5">
              {summary.instances.online > 0
                ? `${summary.aggregate.usage.total} / ${summary.aggregate.applied.total}`
                : '—'}
            </div>
            <div className="text-[11px] text-indigo-100/90 mt-1.5 font-mono">
              硬上限 {summary.aggregate.hard.total} · 编码 {summary.aggregate.usage.encode}/
              {summary.aggregate.applied.encode} · 探测 {summary.aggregate.usage.probe}/
              {summary.aggregate.applied.probe}
            </div>
          </div>

          <div className="rounded-xl bg-white border border-slate-200 p-4 shadow-2xs">
            <div className="text-xs text-slate-500">Worker 实例状态</div>
            <div className="text-2xl font-semibold font-mono text-emerald-700 mt-1.5">
              {summary.instances.online}{' '}
              <span className="text-xs font-sans font-normal text-slate-500">在线</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1.5">
              过期 {summary.instances.stale} · 离线 {summary.instances.offline} · 待心跳{' '}
              {summary.instances.unseen}
            </div>
          </div>

          <div className="rounded-xl bg-white border border-slate-200 p-4 shadow-2xs">
            <div className="text-xs text-slate-500">B 侧待槽与 HOLD 阻断</div>
            <div className="text-2xl font-semibold font-mono text-slate-900 mt-1.5">
              {summary.aggregate.waiting.total}
            </div>
            <div className="text-[11px] text-slate-500 mt-1.5">
              编码待槽 {summary.aggregate.waiting.encode} · 探测待槽{' '}
              {summary.aggregate.waiting.probe} · HOLD {summary.aggregate.heldResources} 类
            </div>
          </div>

          <div className="rounded-xl bg-white border border-slate-200 p-4 shadow-2xs">
            <div className="text-xs text-slate-500">A 侧待发队列 (Outbox)</div>
            <div className="text-2xl font-semibold font-mono text-indigo-700 mt-1.5">
              {summary.outbox.total}
            </div>
            <div className="text-[11px] text-slate-500 mt-1.5">
              转码待发 {summary.outbox.transcode} · 媒体待发 {summary.outbox.media}
            </div>
          </div>

          <div className="rounded-xl bg-white border border-slate-200 p-4 shadow-2xs">
            <div className="text-xs text-slate-500">最近 1 小时单实例峰值</div>
            <div className="text-2xl font-semibold font-mono text-slate-900 mt-1.5">
              {topPeak ? topPeak.peak : '—'}
            </div>
            <div className="text-[11px] text-slate-500 mt-1.5 truncate">
              {topPeak
                ? `峰值实例 ${topPeak.instanceId}（共 ${summary.peaks.length} 个活跃实例）`
                : '近 1 小时无占槽事件'}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl bg-white border border-slate-200 p-8 text-center text-xs text-slate-500">
          {loading ? '正在汇总计算 Worker 实时状态…' : '暂无汇总指标。'}
        </div>
      )}

      <ComputeHistoryChart
        title="集群近 1 小时汇总并发曲线"
        history={history}
        loading={loading}
        isAggregate
      />

      <section className="rounded-xl bg-white border border-slate-200 shadow-2xs overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-slate-700">
            Worker 实例速览（{workers.length} 个已声明实例）
          </span>
          <span className="text-[11px] text-slate-500">点击实例行进入详情与动态调限</span>
        </div>

        {workers.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">尚未配置 Worker 实例。</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-500">
                  <th className="py-2.5 px-4">Worker 实例</th>
                  <th className="py-2.5 px-4">状态</th>
                  <th className="py-2.5 px-4">总槽（实际 / 生效 / 硬上限）</th>
                  <th className="py-2.5 px-4">编码 / 探测占用</th>
                  <th className="py-2.5 px-4">待槽</th>
                  <th className="py-2.5 px-4">调限期望</th>
                  <th className="py-2.5 px-4">最近观测</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {workers.map((worker) => {
                  const statusMeta = WORKER_STATUS_META[worker.status];
                  const snapshot = worker.snapshot;
                  return (
                    <tr
                      key={worker.instanceId}
                      onClick={() => onOpenWorker(worker.instanceId)}
                      className="hover:bg-indigo-50/50 transition cursor-pointer"
                    >
                      <td className="py-2.5 px-4 font-mono font-semibold text-indigo-700">
                        {worker.instanceId}
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border ${statusMeta.badgeClass}`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${statusMeta.dotClass}`} />
                          {statusMeta.label}
                        </span>
                        {worker.draining && (
                          <span className="ml-1.5 px-1.5 py-0.5 rounded bg-orange-100 text-orange-800 text-[10px] font-medium">
                            排空中
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-slate-800">
                        {snapshot
                          ? `${snapshot.usage.total} / ${snapshot.limits.applied.total} / ${snapshot.limits.hard.total}`
                          : '—'}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-slate-600">
                        {snapshot
                          ? `${snapshot.usage.encode}/${snapshot.limits.applied.encode} · ${snapshot.usage.probe}/${snapshot.limits.applied.probe}`
                          : '—'}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-slate-700">
                        {snapshot ? snapshot.waiting.total : '—'}
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        {worker.desired && worker.desired.status ? (
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                              LIMIT_STATUS_META[worker.desired.status].badgeClass
                            }`}
                          >
                            #{worker.desired.revision}{' '}
                            {LIMIT_STATUS_META[worker.desired.status].label}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-slate-500 whitespace-nowrap">
                        {formatComputeDateTime(worker.observedAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
