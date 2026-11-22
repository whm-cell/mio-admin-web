import { Blocks, Copy, Edit3, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { adminApi } from '../api';
import type { RouteTemplateItem } from '../types';

function buildStarterRouteJson(operation: 'image.generate' | 'chat', driver: string): string {
  if (operation === 'chat') {
    const isAnthropic = driver === 'anthropic-messages';
    return JSON.stringify(
      {
        providerType: 'onelink',
        operation: 'chat',
        vendor: isAnthropic ? 'anthropic' : 'openai',
        driver,
        classification: 'chat',
        submitPath: isAnthropic ? '/v1/messages' : '/v1/chat/completions',
        sourceKind: 'protocol-reference',
        source: 'Admin Dynamic Template',
        sourceVersion: new Date().toISOString().slice(0, 10),
        enabled: true,
        capabilityMetadata: {
          maxOutputTokens: 4096,
          inputModalities: ['text'],
        },
      },
      null,
      2,
    );
  }
  return JSON.stringify(
    {
      providerType: 'onelink',
      operation: 'image.generate',
      vendor: 'openai',
      driver,
      classification: 'image',
      submitPath: '/v1/images/generations',
      sourceKind: 'protocol-reference',
      source: 'Admin Dynamic Template',
      sourceVersion: new Date().toISOString().slice(0, 10),
      enabled: true,
      paramSpec: {
        supportedOperations: ['generate'],
        requiresAsync: false,
        maxN: 4,
        allowExplicitN: true,
        allowedSizes: ['1024x1024'],
        allowCustomDimensions: false,
        maxReferenceImages: 0,
        allowGenerateReferences: false,
        allowMaskPng: false,
        allowOutpaintGeometry: false,
        allowedQualities: [],
        allowedBackgrounds: [],
        allowedModerations: [],
        allowedOutputFormats: ['png'],
        allowOutputCompression: false,
        allowUserField: false,
        allowedAspectRatios: [],
        allowWatermarkOverride: false,
        async: null,
      },
      requestDefaults: {},
      outputSpec: { fixedOutputFormat: null },
    },
    null,
    2,
  );
}

function splitCsvTokens(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function TemplatesPage() {
  const [templates, setTemplates] = useState<RouteTemplateItem[]>([]);
  const [drivers, setDrivers] = useState<{ chat: string[]; image: string[] }>({
    chat: [],
    image: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [templateKey, setTemplateKey] = useState('');
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [sortOrder, setSortOrder] = useState(100);
  const [sizesCsv, setSizesCsv] = useState('');
  const [ratiosCsv, setRatiosCsv] = useState('');
  const [formatsCsv, setFormatsCsv] = useState('');
  const [routeJsonText, setRouteJsonText] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.listTemplates();
      setTemplates(res.items);
      setDrivers(res.drivers);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载快捷配置模板失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  const openCreateModal = (source?: RouteTemplateItem) => {
    setFormError(null);
    if (source) {
      setEditingId(null);
      setTemplateKey(`${source.templateKey}-copy`);
      setLabel(`${source.label} (副本)`);
      setDescription(source.description);
      setSortOrder(source.sortOrder + 5);
      setSizesCsv((source.uiHints.recommendedSizes ?? []).join(', '));
      setRatiosCsv((source.uiHints.recommendedAspectRatios ?? []).join(', '));
      setFormatsCsv((source.uiHints.recommendedOutputFormats ?? []).join(', '));
      setRouteJsonText(JSON.stringify(source.routeTemplate, null, 2));
    } else {
      const firstImgDriver = drivers.image[0] ?? 'openai-images';
      setEditingId(null);
      setTemplateKey('');
      setLabel('');
      setDescription('');
      setSortOrder(100);
      setSizesCsv('');
      setRatiosCsv('');
      setFormatsCsv('');
      setRouteJsonText(buildStarterRouteJson('image.generate', firstImgDriver));
    }
    setModalOpen(true);
  };

  const openEditModal = (tpl: RouteTemplateItem) => {
    setFormError(null);
    setEditingId(tpl.id);
    setTemplateKey(tpl.templateKey);
    setLabel(tpl.label);
    setDescription(tpl.description);
    setSortOrder(tpl.sortOrder);
    setSizesCsv((tpl.uiHints.recommendedSizes ?? []).join(', '));
    setRatiosCsv((tpl.uiHints.recommendedAspectRatios ?? []).join(', '));
    setFormatsCsv((tpl.uiHints.recommendedOutputFormats ?? []).join(', '));
    setRouteJsonText(JSON.stringify(tpl.routeTemplate, null, 2));
    setModalOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    let parsedRoute: Record<string, unknown>;
    try {
      const val = JSON.parse(routeJsonText) as unknown;
      if (!val || typeof val !== 'object' || Array.isArray(val)) {
        throw new Error('路由模板必须为 JSON 对象');
      }
      parsedRoute = val as Record<string, unknown>;
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '路由 JSON 解析失败');
      return;
    }

    setSaving(true);
    try {
      const uiHints = {
        recommendedSizes: splitCsvTokens(sizesCsv),
        recommendedAspectRatios: splitCsvTokens(ratiosCsv),
        recommendedOutputFormats: splitCsvTokens(formatsCsv),
      };
      if (editingId) {
        await adminApi.updateTemplate({
          id: editingId,
          templateKey: templateKey.trim(),
          label: label.trim(),
          description: description.trim(),
          sortOrder: Number(sortOrder),
          routeTemplate: parsedRoute,
          uiHints,
        });
        setNotice(`已更新快捷配置模板「${label.trim()}」`);
      } else {
        await adminApi.createTemplate({
          templateKey: templateKey.trim(),
          label: label.trim(),
          description: description.trim(),
          sortOrder: Number(sortOrder),
          routeTemplate: parsedRoute,
          uiHints,
        });
        setNotice(`已新建快捷配置模板「${label.trim()}」`);
      }
      setModalOpen(false);
      await loadTemplates();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '保存模板失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (tpl: RouteTemplateItem) => {
    if (
      !window.confirm(
        `确认删除快捷配置模板「${tpl.label} (${tpl.templateKey})」吗？删除后不会影响已发布的线上模型路由，且后续数据库迁移不会自动恢复该模板。`,
      )
    ) {
      return;
    }
    setError(null);
    setNotice(null);
    try {
      await adminApi.deleteTemplate(tpl.id);
      setNotice(`已删除快捷配置模板「${tpl.label}」`);
      await loadTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除模板失败');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            原厂协议快捷配置模板（数据库全动态存储）
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            所有协议预设与推荐尺寸/比例选项均保存在 `mio_admin_route_templates`
            表中（源码零写死），仅新库首次迁移写入初始种子，支持随时增删改查。
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadTemplates()}
            className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs text-slate-700 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> 刷新
          </button>
          <button
            type="button"
            onClick={() => openCreateModal()}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium shadow-2xs cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" /> 新建快捷模板
          </button>
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {templates.length === 0 ? (
          <div className="col-span-full rounded-xl bg-white border border-slate-200 py-12 text-center text-xs text-slate-400">
            {loading
              ? '正在加载协议模板…'
              : '当前数据库暂无快捷配置模板，点击右上角「新建快捷模板」创建'}
          </div>
        ) : (
          templates.map((tpl) => (
            <div
              key={tpl.id}
              className="rounded-xl bg-white border border-slate-200 p-4 shadow-2xs flex flex-col justify-between gap-3"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <Blocks className="h-4 w-4 text-indigo-600 shrink-0" />
                      <span className="text-sm font-semibold text-slate-900">{tpl.label}</span>
                    </div>
                    <div className="font-mono text-[11px] text-slate-500 mt-0.5">
                      key: {tpl.templateKey} · 排序: {tpl.sortOrder}
                    </div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-mono font-medium ${
                      tpl.operation === 'image.generate'
                        ? 'bg-indigo-50 text-indigo-700'
                        : 'bg-emerald-50 text-emerald-700'
                    }`}
                  >
                    {tpl.operation}
                  </span>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">
                  {tpl.description || '（无描述）'}
                </p>

                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  <span className="px-2 py-0.5 rounded bg-slate-100 font-mono text-slate-700">
                    vendor={tpl.vendor}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-slate-100 font-mono text-slate-700">
                    driver={tpl.driver}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-slate-100 font-mono text-slate-600">
                    {String(tpl.routeTemplate.submitPath ?? '')}
                  </span>
                </div>

                {((tpl.uiHints.recommendedSizes?.length ?? 0) > 0 ||
                  (tpl.uiHints.recommendedAspectRatios?.length ?? 0) > 0) && (
                  <div className="text-[11px] text-slate-500 pt-1 space-y-0.5">
                    {(tpl.uiHints.recommendedSizes?.length ?? 0) > 0 && (
                      <div>推荐尺寸：{tpl.uiHints.recommendedSizes!.join(', ')}</div>
                    )}
                    {(tpl.uiHints.recommendedAspectRatios?.length ?? 0) > 0 && (
                      <div>推荐比例：{tpl.uiHints.recommendedAspectRatios!.join(', ')}</div>
                    )}
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                <span>
                  最近维护：{tpl.updatedBy ?? '—'} ·{' '}
                  {new Date(tpl.updatedAt).toLocaleString('zh-CN')}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => openCreateModal(tpl)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    <Copy className="h-3 w-3" /> 复制
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditModal(tpl)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 text-indigo-700 hover:bg-indigo-50 cursor-pointer"
                  >
                    <Edit3 className="h-3 w-3" /> 编辑
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(tpl)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 text-rose-600 hover:bg-rose-50 cursor-pointer"
                  >
                    <Trash2 className="h-3 w-3" /> 删除
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-6 overflow-y-auto">
          <form
            onSubmit={handleSubmit}
            className="w-full max-w-3xl rounded-2xl bg-white border border-slate-200 shadow-2xl p-6 space-y-4 my-auto"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">
                {editingId ? '编辑快捷配置模板' : '新建快捷配置模板'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {formError && (
              <div className="rounded-lg bg-rose-50 border border-rose-200 px-3.5 py-2 text-xs text-rose-700">
                {formError}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  模板唯一键 (`templateKey`) *
                </label>
                <input
                  type="text"
                  required
                  value={templateKey}
                  onChange={(e) => setTemplateKey(e.target.value)}
                  placeholder="如 seedream-pro-sync"
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  展示名称 (`label`) *
                </label>
                <input
                  type="text"
                  required
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="如 火山方舟高分同步模板"
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  排序权重 (`sortOrder`)
                </label>
                <input
                  type="number"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(Number(e.target.value))}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300"
                />
              </div>
            </div>

            <div className="text-xs">
              <label className="block font-medium text-slate-700 mb-1">适用场景说明</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="简要说明该协议模板适用的上游模型系列与参数特征"
                className="w-full px-3 py-1.5 rounded-lg border border-slate-300"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  UI 快捷尺寸选项（逗号分隔）
                </label>
                <input
                  type="text"
                  value={sizesCsv}
                  onChange={(e) => setSizesCsv(e.target.value)}
                  placeholder="1024x1024, 2K, 4K"
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  UI 快捷比例选项（逗号分隔）
                </label>
                <input
                  type="text"
                  value={ratiosCsv}
                  onChange={(e) => setRatiosCsv(e.target.value)}
                  placeholder="1:1, 16:9, 9:16"
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  UI 快捷输出格式（逗号分隔）
                </label>
                <input
                  type="text"
                  value={formatsCsv}
                  onChange={(e) => setFormatsCsv(e.target.value)}
                  placeholder="jpeg, png, webp"
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 font-mono"
                />
              </div>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="font-medium text-slate-700">
                  协议路由模板 JSON（不含 `rawModelId`，保存时经服务端严格校验）*
                </label>
                <div className="flex items-center gap-1.5 text-[11px]">
                  <span className="text-slate-400">快速切换骨架：</span>
                  {drivers.image.map((drv) => (
                    <button
                      key={drv}
                      type="button"
                      onClick={() => setRouteJsonText(buildStarterRouteJson('image.generate', drv))}
                      className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 font-mono text-slate-700 cursor-pointer"
                    >
                      {drv}
                    </button>
                  ))}
                  {drivers.chat.map((drv) => (
                    <button
                      key={drv}
                      type="button"
                      onClick={() => setRouteJsonText(buildStarterRouteJson('chat', drv))}
                      className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 font-mono text-slate-700 cursor-pointer"
                    >
                      {drv}
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                rows={14}
                required
                value={routeJsonText}
                onChange={(e) => setRouteJsonText(e.target.value)}
                className="w-full font-mono text-xs p-3.5 rounded-xl bg-slate-950 text-slate-100 border border-slate-800 outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-700 cursor-pointer"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-medium cursor-pointer"
              >
                {saving ? '正在校验并保存…' : '保存模板'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
