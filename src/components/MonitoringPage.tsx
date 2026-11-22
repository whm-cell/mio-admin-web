import {
  Activity,
  AlertTriangle,
  Database,
  HardDrive,
  Radio,
  RefreshCw,
  ServerCrash,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '../api';
import type { MonitoringData, MonitoringWindow } from '../types';

const WINDOWS: { value: MonitoringWindow; label: string }[] = [
  { value: '24h', label: '近 24 小时' },
  { value: '7d', label: '近 7 天' },
  { value: '30d', label: '近 30 天' },
  { value: 'all', label: '全部历史' },
];

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KiB', 'MiB', 'GiB'];
  let idx = 0;
  let val = bytes;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx += 1;
  }
  return `${val.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function formatDurationSeconds(sec: number | null): string {
  if (sec === null || !Number.isFinite(sec)) return '—';
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m ${Math.floor(sec % 60)}s`;
}

export function MonitoringPage() {
  const [windowRange, setWindowRange] = useState<MonitoringWindow>('7d');
  const [data, setData] = useState<MonitoringData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMonitoring = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await adminApi.getMonitoring(windowRange));
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载运行监控失败');
    } finally {
      setLoading(false);
    }
  }, [windowRange]);

  useEffect(() => {
    void loadMonitoring();
  }, [loadMonitoring]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            全栈运行监控（业务三类失败分桶 + RabbitMQ & Redis 完整档）
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            由独立最小权限只读监控身份采集 RabbitMQ 队列/死信与 Redis
            内存/时钟/OPS，结合跨库脱敏业务指标实时呈现
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs">
            {WINDOWS.map((w) => (
              <button
                key={w.value}
                type="button"
                onClick={() => setWindowRange(w.value)}
                className={`px-3 py-1.5 rounded-md font-medium transition cursor-pointer ${
                  windowRange === w.value
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void loadMonitoring()}
            className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs text-slate-700 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> 刷新
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-3.5 text-xs text-rose-700">
          {error}
        </div>
      )}

      {data && (
        <>
          {/* Infrastructure Row: RabbitMQ Full Tier + Redis Full Tier */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            {/* RabbitMQ Full-Tier Panel */}
            <div className="rounded-xl bg-white border border-slate-200 p-5 shadow-2xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Radio className="h-4 w-4 text-indigo-600" />
                  <h3 className="text-sm font-semibold text-slate-900">
                    RabbitMQ 消息队列监控（完整档）
                  </h3>
                </div>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium ${
                    data.rabbitmq.status === 'up'
                      ? data.rabbitmq.hasAlarms || data.rabbitmq.dlqMessages > 0
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-emerald-100 text-emerald-800'
                      : data.rabbitmq.status === 'down'
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {data.rabbitmq.status === 'up'
                    ? `在线 v${data.rabbitmq.rabbitmqVersion ?? '?'} · ${data.rabbitmq.latencyMs ?? 0}ms`
                    : data.rabbitmq.status === 'down'
                      ? `异常 (${data.rabbitmq.errorCode})`
                      : '未配置 MIO_ADMIN_RABBITMQ_MONITOR_URL'}
                </span>
              </div>

              {data.rabbitmq.status === 'up' ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                    <div className="rounded-lg bg-slate-50 border border-slate-100 p-2.5">
                      <div className="text-slate-500">Vhost / 连接 / 通道</div>
                      <div className="font-mono font-semibold text-slate-900 mt-0.5">
                        {data.rabbitmq.vhost} · {data.rabbitmq.objectTotals?.connections ?? 0} /{' '}
                        {data.rabbitmq.objectTotals?.channels ?? 0}
                      </div>
                    </div>
                    <div className="rounded-lg bg-slate-50 border border-slate-100 p-2.5">
                      <div className="text-slate-500">Ready / Unacked</div>
                      <div className="font-mono font-semibold text-indigo-700 mt-0.5">
                        {data.rabbitmq.queueTotals?.messagesReady ?? 0} /{' '}
                        {data.rabbitmq.queueTotals?.messagesUnacknowledged ?? 0}
                      </div>
                    </div>
                    <div
                      className={`rounded-lg border p-2.5 ${
                        data.rabbitmq.dlqMessages > 0
                          ? 'bg-rose-50 border-rose-200'
                          : 'bg-slate-50 border-slate-100'
                      }`}
                    >
                      <div className="text-slate-500">死信队列 (`.dlq`)</div>
                      <div
                        className={`font-mono font-semibold mt-0.5 ${
                          data.rabbitmq.dlqMessages > 0 ? 'text-rose-700' : 'text-emerald-700'
                        }`}
                      >
                        {data.rabbitmq.dlqMessages} 条死信
                      </div>
                    </div>
                    <div className="rounded-lg bg-slate-50 border border-slate-100 p-2.5">
                      <div className="text-slate-500">速率 (Pub / Ack /s)</div>
                      <div className="font-mono font-semibold text-slate-900 mt-0.5">
                        {data.rabbitmq.rates?.publishPerSec ?? 0} /{' '}
                        {data.rabbitmq.rates?.ackPerSec ?? 0}
                      </div>
                    </div>
                  </div>

                  {/* Node Health & Alarms */}
                  {data.rabbitmq.nodes.map((node) => (
                    <div
                      key={node.name}
                      className="rounded-lg bg-slate-50/80 border border-slate-200/80 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px]"
                    >
                      <span className="font-mono text-slate-700">
                        节点 {node.name}（运行{' '}
                        {formatDurationSeconds(Math.floor(node.uptimeMs / 1000))}）
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded ${
                            node.memAlarm
                              ? 'bg-rose-100 text-rose-800 font-semibold'
                              : 'bg-emerald-50 text-emerald-700'
                          }`}
                        >
                          内存 {formatBytes(node.memUsedBytes)} / {formatBytes(node.memLimitBytes)}
                          {node.memAlarm ? ' (告警!)' : ''}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded ${
                            node.diskFreeAlarm
                              ? 'bg-rose-100 text-rose-800 font-semibold'
                              : 'bg-emerald-50 text-emerald-700'
                          }`}
                        >
                          磁盘可用 {formatBytes(node.diskFreeBytes)}
                          {node.diskFreeAlarm ? ' (低盘告警!)' : ''}
                        </span>
                        <span className="text-slate-500">
                          FD {node.fdUsed}/{node.fdTotal}
                        </span>
                      </div>
                    </div>
                  ))}

                  {/* Compute Outbox & Jobs Correlation */}
                  <div className="rounded-lg bg-indigo-50/50 border border-indigo-100 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <span className="font-medium text-indigo-950">
                      PG 计算事务 Outbox / Inbox 对账（
                      {data.compute.enabled ? '已启用' : '未迁移计算表'}）
                    </span>
                    <span className="font-mono text-indigo-800">
                      待发 Outbox={data.compute.outbox.pending} · 租约中=
                      {data.compute.outbox.leased} · 已处理 Inbox={data.compute.inboxProcessed} ·
                      任务总计={data.compute.jobs.total}
                    </span>
                  </div>

                  {/* Queue Breakdown Table */}
                  {data.rabbitmq.queues.length > 0 ? (
                    <div className="overflow-x-auto border border-slate-200 rounded-lg">
                      <table className="w-full text-left text-[11px]">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                            <th className="py-2 px-3">队列名</th>
                            <th className="py-2 px-3">类型</th>
                            <th className="py-2 px-3">Ready</th>
                            <th className="py-2 px-3">Unacked</th>
                            <th className="py-2 px-3">消费者</th>
                            <th className="py-2 px-3">内存</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {data.rabbitmq.queues.map((q) => (
                            <tr
                              key={q.name}
                              className={q.isDlq && q.messages > 0 ? 'bg-rose-50/60' : ''}
                            >
                              <td className="py-2 px-3 font-mono font-medium text-slate-900">
                                {q.name}
                                {q.isDlq && (
                                  <span className="ml-1.5 px-1.5 py-0.5 rounded bg-slate-200 text-[10px] text-slate-700">
                                    DLQ
                                  </span>
                                )}
                              </td>
                              <td className="py-2 px-3 font-mono text-slate-500">{q.type}</td>
                              <td className="py-2 px-3 font-mono font-semibold text-slate-800">
                                {q.messagesReady}
                              </td>
                              <td className="py-2 px-3 font-mono text-indigo-700">
                                {q.messagesUnacknowledged}
                              </td>
                              <td className="py-2 px-3 font-mono text-slate-600">{q.consumers}</td>
                              <td className="py-2 px-3 font-mono text-slate-500">
                                {formatBytes(q.memoryBytes)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400">
                      当前 `{data.rabbitmq.vhost}` vhost 尚未声明业务队列（可运行 `pnpm
                      broker:init:dev` 声明拓扑）
                    </div>
                  )}
                </>
              ) : (
                <div className="text-xs text-slate-500 leading-relaxed">
                  {data.rabbitmq.status === 'unconfigured'
                    ? '运行 `pnpm monitor:init:dev` 可自动生成只读监控账号 `mio-dev-monitor` 并开启完整档队列看板。'
                    : `无法连接 RabbitMQ 管理接口（错误码：${data.rabbitmq.errorCode}）。`}
                </div>
              )}
            </div>

            {/* Redis Full-Tier Panel */}
            <div className="rounded-xl bg-white border border-slate-200 p-5 shadow-2xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-emerald-600" />
                  <h3 className="text-sm font-semibold text-slate-900">
                    Redis 实例监控（完整档 · 零键值 ACL 隔离）
                  </h3>
                </div>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium ${
                    data.redis.status === 'up'
                      ? data.redis.memory?.oomRisk || data.redis.clockHealthy === false
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-emerald-100 text-emerald-800'
                      : data.redis.status === 'down'
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {data.redis.status === 'up'
                    ? `在线 v${data.redis.redisVersion ?? '?'} · PING ${data.redis.latencyMs ?? 0}ms`
                    : data.redis.status === 'down'
                      ? `异常 (${data.redis.errorCode})`
                      : '未配置 MIO_ADMIN_REDIS_MONITOR_URL'}
                </span>
              </div>

              {data.redis.status === 'up' && data.redis.memory ? (
                <>
                  {/* Memory Watermark Progress Bar */}
                  <div className="rounded-lg bg-slate-50 border border-slate-200/80 p-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-700">
                        内存水位（策略:{' '}
                        <code className="font-mono">{data.redis.memory.policy}</code>）
                      </span>
                      <span className="font-mono font-semibold text-slate-900">
                        {data.redis.memory.usedHuman} / {data.redis.memory.maxHuman}（峰值{' '}
                        {data.redis.memory.peakHuman}）
                      </span>
                    </div>
                    <div className="h-2.5 w-full rounded-full bg-slate-200 overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          data.redis.memory.oomRisk
                            ? 'bg-rose-600'
                            : (data.redis.memory.usageRatio ?? 0) >= 0.65
                              ? 'bg-amber-500'
                              : 'bg-emerald-600'
                        }`}
                        style={{
                          width: `${Math.min(100, Math.max(2, Math.round((data.redis.memory.usageRatio ?? 0) * 100)))}%`,
                        }}
                      />
                    </div>
                    {data.redis.memory.oomRisk && (
                      <div className="text-[11px] text-rose-700 font-medium">
                        预警：当前 `noeviction` 内存水位超过 85%，继续增长将导致认证限流触发 503 OOM
                        保护！
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                    <div className="rounded-lg bg-slate-50 border border-slate-100 p-2.5">
                      <div className="text-slate-500">活跃键总数 (`DBSIZE`)</div>
                      <div className="font-mono text-base font-semibold text-slate-900 mt-0.5">
                        {data.redis.dbsize ?? 0}
                      </div>
                    </div>
                    <div
                      className={`rounded-lg border p-2.5 ${
                        data.redis.clockHealthy === false
                          ? 'bg-rose-50 border-rose-200'
                          : 'bg-slate-50 border-slate-100'
                      }`}
                    >
                      <div className="text-slate-500">时钟偏差 (&lt;2000ms)</div>
                      <div
                        className={`font-mono text-base font-semibold mt-0.5 ${
                          data.redis.clockHealthy === false ? 'text-rose-700' : 'text-emerald-700'
                        }`}
                      >
                        {data.redis.clockDriftMs ?? 0} ms
                      </div>
                    </div>
                    <div className="rounded-lg bg-slate-50 border border-slate-100 p-2.5">
                      <div className="text-slate-500">实时吞吐 (`OPS/s`)</div>
                      <div className="font-mono text-base font-semibold text-indigo-700 mt-0.5">
                        {data.redis.stats?.instantaneousOpsPerSec ?? 0}
                      </div>
                    </div>
                    <div className="rounded-lg bg-slate-50 border border-slate-100 p-2.5">
                      <div className="text-slate-500">客户端 (连接/拒连)</div>
                      <div className="font-mono text-base font-semibold text-slate-900 mt-0.5">
                        {data.redis.clients?.connected ?? 0} /{' '}
                        {data.redis.clients?.rejectedConnections ?? 0}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-[11px]">
                    <div className="rounded-lg bg-slate-50/80 border border-slate-200/70 px-3 py-2 flex items-center justify-between">
                      <span className="text-slate-500">AOF 持久化 / 最近写入状态</span>
                      <span className="font-mono font-medium text-slate-800">
                        {data.redis.persistence?.aofEnabled ? '已开启' : '关闭'} ·{' '}
                        {data.redis.persistence?.aofLastWriteStatus ?? '—'}
                      </span>
                    </div>
                    <div className="rounded-lg bg-slate-50/80 border border-slate-200/70 px-3 py-2 flex items-center justify-between">
                      <span className="text-slate-500">累计命令 / 键命中 / 驱逐数</span>
                      <span className="font-mono font-medium text-slate-800">
                        {data.redis.stats?.totalCommandsProcessed ?? 0} /{' '}
                        {data.redis.stats?.keyspaceHits ?? 0} / {data.redis.stats?.evictedKeys ?? 0}
                      </span>
                    </div>
                    <div className="rounded-lg bg-slate-50/80 border border-slate-200/70 px-3 py-2 flex items-center justify-between">
                      <span className="text-slate-500">内存碎片率 (`fragmentation`)</span>
                      <span className="font-mono font-medium text-slate-800">
                        {data.redis.memory.fragmentationRatio ?? '—'}
                      </span>
                    </div>
                    <div className="rounded-lg bg-slate-50/80 border border-slate-200/70 px-3 py-2 flex items-center justify-between">
                      <span className="text-slate-500">实例连续运行时长</span>
                      <span className="font-mono font-medium text-slate-800">
                        {formatDurationSeconds(data.redis.uptimeSeconds)}
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-xs text-slate-500 leading-relaxed">
                  {data.redis.status === 'unconfigured'
                    ? '运行 `pnpm monitor:init:dev` 可自动创建 `resetkeys` 零键值访问权限的 `mio_monitor` 账号并开启完整档 Redis 监控。'
                    : `无法采集 Redis 监控指标（错误码：${data.redis.errorCode}）。该探针与认证主连接物理隔离，不影响线上登录。`}
                </div>
              )}
            </div>
          </div>

          {/* Provider Credential Overview */}
          <div className="rounded-xl bg-white border border-slate-200 p-4 shadow-2xs">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
              用户供应商凭据池概况（脱敏统计）
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
              <div>
                <div className="text-slate-500">已配置账号总数</div>
                <div className="text-xl font-semibold text-slate-900 mt-0.5">
                  {data.providers.totalAccounts}
                </div>
              </div>
              <div>
                <div className="text-slate-500">启用状态</div>
                <div className="text-xl font-semibold text-indigo-700 mt-0.5">
                  {data.providers.enabledAccounts}
                </div>
              </div>
              <div>
                <div className="text-slate-500">凭据校验有效 (`valid`)</div>
                <div className="text-xl font-semibold text-emerald-700 mt-0.5">
                  {data.providers.validAccounts}
                </div>
              </div>
              <div>
                <div className="text-slate-500">凭据被上游拒绝 (`rejected`)</div>
                <div className="text-xl font-semibold text-rose-700 mt-0.5">
                  {data.providers.rejectedAccounts}
                </div>
              </div>
              <div>
                <div className="text-slate-500">待首次刷新 (`unchecked`)</div>
                <div className="text-xl font-semibold text-amber-700 mt-0.5">
                  {data.providers.uncheckedAccounts}
                </div>
              </div>
            </div>
          </div>

          {/* Image Generation Three-Bucket Breakdown */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <Activity className="h-4 w-4 text-indigo-600" />
                AI 生图任务监控（{data.images.enabled ? '媒体库已连接' : '媒体库未启用'}）
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="rounded-xl bg-white border border-slate-200 p-4">
                <div className="text-xs text-slate-500">总任务数</div>
                <div className="text-2xl font-semibold text-slate-900 mt-1">
                  {data.images.totals.total}
                </div>
              </div>
              <div className="rounded-xl bg-white border border-slate-200 p-4">
                <div className="text-xs text-slate-500">成功落库 (`completed`)</div>
                <div className="text-2xl font-semibold text-emerald-700 mt-1">
                  {data.images.totals.completed}
                </div>
              </div>
              <div className="rounded-xl bg-white border border-slate-200 p-4">
                <div className="text-xs text-slate-500">在途处理 (`inFlight`)</div>
                <div className="text-2xl font-semibold text-indigo-700 mt-1">
                  {data.images.totals.inFlight}
                </div>
              </div>
              <div className="rounded-xl bg-amber-50/60 border border-amber-200 p-4">
                <div className="text-xs font-medium text-amber-800 flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" /> ① 准入/处理器拒绝
                </div>
                <div className="text-2xl font-semibold text-amber-900 mt-1">
                  {data.images.totals.rejected}
                </div>
                <div className="text-[11px] text-amber-700 mt-0.5">需核对路由参数或请求输入</div>
              </div>
              <div className="rounded-xl bg-rose-50/60 border border-rose-200 p-4">
                <div className="text-xs font-medium text-rose-800 flex items-center gap-1">
                  <ServerCrash className="h-3.5 w-3.5" /> ② 上游生成/轮询失败
                </div>
                <div className="text-2xl font-semibold text-rose-900 mt-1">
                  {data.images.totals.upstreamFailed}
                </div>
                <div className="text-[11px] text-rose-700 mt-0.5">OneLink 受理后报错或超时</div>
              </div>
              <div className="rounded-xl bg-purple-50/60 border border-purple-200 p-4">
                <div className="text-xs font-medium text-purple-800 flex items-center gap-1">
                  <HardDrive className="h-3.5 w-3.5" /> ③ 上游成功但存储失败
                </div>
                <div className="text-2xl font-semibold text-purple-900 mt-1">
                  {data.images.totals.storageFailed}
                </div>
                <div className="text-[11px] text-purple-700 mt-0.5">需排查 COS 或资产物化链路</div>
              </div>
            </div>

            {data.images.byModel.length > 0 && (
              <div className="rounded-xl bg-white border border-slate-200 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/70 text-xs font-semibold text-slate-700">
                  按生图模型与协议驱动分布
                </div>
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-500">
                      <th className="py-2.5 px-4">模型 ID</th>
                      <th className="py-2.5 px-4">驱动</th>
                      <th className="py-2.5 px-4">总数</th>
                      <th className="py-2.5 px-4">已完成</th>
                      <th className="py-2.5 px-4">在途</th>
                      <th className="py-2.5 px-4">准入拒绝</th>
                      <th className="py-2.5 px-4">上游失败</th>
                      <th className="py-2.5 px-4">存储失败</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.images.byModel.map((row) => (
                      <tr key={`${row.modelId}:${row.driver}`}>
                        <td className="py-2.5 px-4 font-mono font-medium text-slate-900">
                          {row.modelId}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-slate-600">{row.driver}</td>
                        <td className="py-2.5 px-4">{row.total}</td>
                        <td className="py-2.5 px-4 text-emerald-700 font-medium">
                          {row.completed}
                        </td>
                        <td className="py-2.5 px-4 text-indigo-700">{row.inFlight}</td>
                        <td className="py-2.5 px-4 text-amber-700">{row.rejected}</td>
                        <td className="py-2.5 px-4 text-rose-700">{row.upstreamFailed}</td>
                        <td className="py-2.5 px-4 text-purple-700">{row.storageFailed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {data.images.recentJobs.length > 0 && (
              <div className="rounded-xl bg-white border border-slate-200 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/70 text-xs font-semibold text-slate-700">
                  最近生图任务诊断明细（脱敏）
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-500">
                        <th className="py-2.5 px-4">时间</th>
                        <th className="py-2.5 px-4">任务 ID</th>
                        <th className="py-2.5 px-4">模型 / 驱动</th>
                        <th className="py-2.5 px-4">状态 / 执行阶段</th>
                        <th className="py-2.5 px-4">轮询次数 / 产出</th>
                        <th className="py-2.5 px-4">原因码 (`error_code`)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.images.recentJobs.map((job) => (
                        <tr key={job.id}>
                          <td className="py-2.5 px-4 text-slate-500 whitespace-nowrap">
                            {new Date(job.createdAt).toLocaleString('zh-CN')}
                          </td>
                          <td className="py-2.5 px-4 font-mono text-[11px] text-slate-600">
                            {job.id.slice(0, 8)}…
                          </td>
                          <td className="py-2.5 px-4">
                            <div className="font-mono font-medium text-slate-900">
                              {job.modelId}
                            </div>
                            <div className="font-mono text-[11px] text-slate-500">{job.driver}</div>
                          </td>
                          <td className="py-2.5 px-4">
                            <span
                              className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                                job.state === 'completed'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : job.storageFailed || job.state === 'materialization_failed'
                                    ? 'bg-purple-100 text-purple-800'
                                    : job.state === 'rejected'
                                      ? 'bg-amber-100 text-amber-800'
                                      : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {job.state}
                            </span>
                            {job.phase && (
                              <span className="ml-1.5 text-[11px] text-slate-500">
                                ({job.phase})
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-slate-600">
                            轮询 {job.queryAttempt} 次 · 产出 {job.outputCount} 张
                          </td>
                          <td className="py-2.5 px-4 font-mono text-rose-700">
                            {job.errorCode ?? '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Conversation Requests Monitoring */}
          <div className="rounded-xl bg-white border border-slate-200 p-4 space-y-3">
            <div className="text-sm font-semibold text-slate-900">
              对话服务监控（总计 {data.conversations.totals.total} 轮 · 完成{' '}
              {data.conversations.totals.completed} · 失败 {data.conversations.totals.failed} · 取消{' '}
              {data.conversations.totals.cancelled}）
            </div>
            {data.conversations.byModel.length > 0 ? (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-500">
                    <th className="py-2 px-3">对话模型 ID</th>
                    <th className="py-2 px-3">协议</th>
                    <th className="py-2 px-3">总请求</th>
                    <th className="py-2 px-3">成功</th>
                    <th className="py-2 px-3">失败/未知</th>
                    <th className="py-2 px-3">用户取消</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.conversations.byModel.map((row) => (
                    <tr key={`${row.modelId}:${row.protocol}`}>
                      <td className="py-2 px-3 font-mono font-medium text-slate-900">
                        {row.modelId}
                      </td>
                      <td className="py-2 px-3 font-mono text-slate-600">{row.protocol}</td>
                      <td className="py-2 px-3">{row.total}</td>
                      <td className="py-2 px-3 text-emerald-700">{row.completed}</td>
                      <td className="py-2 px-3 text-rose-700">{row.failed}</td>
                      <td className="py-2 px-3 text-slate-500">{row.cancelled}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-xs text-slate-400">所选时间窗口内暂无对话调用记录</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
