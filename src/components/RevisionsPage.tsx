import { ChevronDown, ChevronRight, History, RotateCcw, Search } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '../api';
import type { AdminAuditLog, RouteRevisionRecord } from '../types';

const ACTION_BADGES: Record<string, { label: string; style: string }> = {
  create: { label: '新建路由', style: 'bg-emerald-100 text-emerald-800' },
  update: { label: '参数变更', style: 'bg-indigo-100 text-indigo-800' },
  enable: { label: '启用路由', style: 'bg-emerald-100 text-emerald-800' },
  disable: { label: '停用路由', style: 'bg-amber-100 text-amber-800' },
  delete: { label: '删除路由', style: 'bg-rose-100 text-rose-800' },
  rollback: { label: '版本回滚', style: 'bg-violet-100 text-violet-800' },
  'cli-import': { label: 'CLI 导入', style: 'bg-slate-200 text-slate-700' },
};

export function RevisionsPage() {
  const [tab, setTab] = useState<'routes' | 'audits'>('routes');
  const [filterModelId, setFilterModelId] = useState('');
  const [routeRevisions, setRouteRevisions] = useState<RouteRevisionRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rollingBackId, setRollingBackId] = useState<string | null>(null);

  const loadRevisions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.listRevisions(filterModelId.trim() || undefined, 80);
      setRouteRevisions(res.routeRevisions);
      setAuditLogs(res.auditLogs);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载变更历史失败');
    } finally {
      setLoading(false);
    }
  }, [filterModelId]);

  useEffect(() => {
    void loadRevisions();
  }, [loadRevisions]);

  const handleRollback = async (rev: RouteRevisionRecord) => {
    if (!rev.after_route) return;
    if (
      !window.confirm(
        `确认将模型 ${rev.raw_model_id} (${rev.operation}) 的配置回滚并重新发布为 v${rev.declaration_version} 的快照内容吗？`,
      )
    ) {
      return;
    }
    setRollingBackId(rev.id);
    setError(null);
    setNotice(null);
    try {
      const res = await adminApi.rollbackRoute(
        rev.id,
        `从后台一键回滚至历史版本 v${rev.declaration_version}`,
      );
      setNotice(
        res.unchanged
          ? `${rev.raw_model_id} 当前线上配置与目标版本一致，无需重复发布`
          : `已成功将 ${rev.raw_model_id} 恢复并发布为新版本 v${res.declarationVersion}`,
      );
      await loadRevisions();
    } catch (err) {
      setError(err instanceof Error ? err.message : '回滚失败');
    } finally {
      setRollingBackId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">变更审计记录与路由一键回滚</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            完整追溯模型、快捷模板、路由与管理员账号的每一次变更；回滚会将有效历史快照重新发布为最新
            `declaration_version`
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={filterModelId}
              onChange={(e) => setFilterModelId(e.target.value)}
              placeholder="按精确目标 ID 过滤…"
              className="pl-8 pr-3 py-1.5 text-xs font-mono bg-white rounded-lg border border-slate-200 outline-none"
            />
          </div>

          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setTab('routes')}
              className={`px-3 py-1.5 rounded-md font-medium cursor-pointer ${
                tab === 'routes' ? 'bg-indigo-600 text-white' : 'text-slate-600'
              }`}
            >
              路由修订历史 ({routeRevisions.length})
            </button>
            <button
              type="button"
              onClick={() => setTab('audits')}
              className={`px-3 py-1.5 rounded-md font-medium cursor-pointer ${
                tab === 'audits' ? 'bg-indigo-600 text-white' : 'text-slate-600'
              }`}
            >
              模型 / 模板 / 账号审计 ({auditLogs.length})
            </button>
          </div>
        </div>
      </div>

      {notice && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-xs text-emerald-800">
          {notice}
        </div>
      )}
      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-2.5 text-xs text-rose-700">
          {error}
        </div>
      )}

      {tab === 'routes' ? (
        <div className="space-y-3">
          {routeRevisions.length === 0 ? (
            <div className="rounded-xl bg-white border border-slate-200 py-12 text-center text-xs text-slate-400">
              {loading ? '正在加载路由修订记录…' : '暂无路由修订记录'}
            </div>
          ) : (
            routeRevisions.map((rev) => {
              const badge = ACTION_BADGES[rev.action] ?? {
                label: rev.action,
                style: 'bg-slate-100 text-slate-700',
              };
              const isExpanded = expandedId === rev.id;
              return (
                <div
                  key={rev.id}
                  className="rounded-xl bg-white border border-slate-200 shadow-2xs overflow-hidden"
                >
                  <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : rev.id)}
                        className="p-1 rounded hover:bg-slate-100 text-slate-500 cursor-pointer"
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-semibold text-slate-900">
                            {rev.raw_model_id}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-slate-100 font-mono text-[11px] text-slate-700">
                            {rev.operation} · v{rev.declaration_version}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-medium ${badge.style}`}
                          >
                            {badge.label}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          操作人：
                          <span className="font-medium text-slate-700">{rev.actor_name}</span> (
                          {rev.actor_type}) · {new Date(rev.created_at).toLocaleString('zh-CN')}
                          {rev.summary && (
                            <span className="ml-2 text-slate-700">· 说明：{rev.summary}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : rev.id)}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600 hover:bg-slate-50 cursor-pointer"
                      >
                        {isExpanded ? '收起快照差异' : '查看前后差异'}
                      </button>
                      {rev.after_route ? (
                        <button
                          type="button"
                          disabled={rollingBackId === rev.id}
                          onClick={() => handleRollback(rev)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-medium cursor-pointer"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          {rollingBackId === rev.id ? '发布中…' : '用此快照重新发布'}
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-400 px-2">已删除记录</span>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="px-4 pb-4 pt-2 border-t border-slate-100 bg-slate-50/50 grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
                      <div>
                        <div className="font-medium text-slate-500 mb-1">
                          变更前 (`before_route`)
                        </div>
                        <pre className="p-3 rounded-lg bg-white border border-slate-200 overflow-auto max-h-72 text-slate-600">
                          {rev.before_route
                            ? JSON.stringify(rev.before_route, null, 2)
                            : '（无，首次创建）'}
                        </pre>
                      </div>
                      <div>
                        <div className="font-medium text-indigo-700 mb-1">
                          变更后快照 (`after_route` · v{rev.declaration_version})
                        </div>
                        <pre className="p-3 rounded-lg bg-white border border-indigo-200 overflow-auto max-h-72 text-slate-900">
                          {rev.after_route
                            ? JSON.stringify(rev.after_route, null, 2)
                            : '（路由已删除，可从上方或下方历史版本恢复）'}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      ) : (
        <div className="rounded-xl bg-white border border-slate-200 shadow-2xs overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                <th className="py-3 px-4">时间</th>
                <th className="py-3 px-4">管理员</th>
                <th className="py-3 px-4">动作</th>
                <th className="py-3 px-4">对象</th>
                <th className="py-3 px-4">摘要与状态变化</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {auditLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-slate-400">
                    暂无管理与系统操作审计
                  </td>
                </tr>
              ) : (
                auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString('zh-CN')}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-900">{log.actorName}</td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 font-mono text-[11px] text-slate-700">
                        <History className="h-3 w-3" /> {log.action}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-700">{log.targetId ?? '—'}</td>
                    <td className="py-3 px-4 text-slate-600">
                      <div>{log.summary ?? '—'}</div>
                      {log.afterState && (
                        <code className="block mt-1 text-[11px] text-slate-500 break-all">
                          {JSON.stringify(log.afterState)}
                        </code>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
