import {
  Activity,
  Blocks,
  History,
  Layers,
  LogOut,
  ShieldCheck,
  SlidersHorizontal,
  UserCog,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { adminApi } from './api';
import { AccountSettingsPage } from './components/AccountSettingsPage';
import { GlobalSettingsPage } from './components/GlobalSettingsPage';
import { LoginPage } from './components/LoginPage';
import { ModelCatalogPage } from './components/ModelCatalogPage';
import { MonitoringPage } from './components/MonitoringPage';
import { RevisionsPage } from './components/RevisionsPage';
import { TemplatesPage } from './components/TemplatesPage';
import type { AdminAccount } from './types';

type NavKey = 'catalog' | 'templates' | 'monitoring' | 'revisions' | 'settings' | 'account';

const NAV_ITEMS: { key: NavKey; label: string; subtitle: string; icon: typeof Layers }[] = [
  {
    key: 'catalog',
    label: '模型目录与参数配置',
    subtitle: 'OneLink 导入、平台白名单与完整 CRUD',
    icon: Layers,
  },
  {
    key: 'templates',
    label: '快捷配置模板',
    subtitle: '数据库动态原厂协议模板增删改查',
    icon: Blocks,
  },
  {
    key: 'monitoring',
    label: '运行与中间件监控',
    subtitle: '生图/对话 + RabbitMQ & Redis 完整档',
    icon: Activity,
  },
  {
    key: 'revisions',
    label: '变更记录与回滚',
    subtitle: '路由版本差异对比与全链路操作审计',
    icon: History,
  },
  {
    key: 'settings',
    label: '全局配置',
    subtitle: '邮箱登录开关与手机验证码策略',
    icon: SlidersHorizontal,
  },
  {
    key: 'account',
    label: '管理员账号',
    subtitle: '修改用户名、密码与记住登录管理',
    icon: UserCog,
  },
];

export default function App() {
  const [admin, setAdmin] = useState<AdminAccount | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [activeNav, setActiveNav] = useState<NavKey>('catalog');

  useEffect(() => {
    adminApi
      .me()
      .then((res) => setAdmin(res.admin))
      .catch(() => {
        setAdmin(null);
      })
      .finally(() => setCheckingSession(false));
  }, []);

  const handleLogout = async () => {
    await adminApi.logout().catch(() => {});
    setAdmin(null);
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-xs text-slate-500">
        正在核验管理员会话…
      </div>
    );
  }

  if (!admin) {
    return <LoginPage onAuthenticated={(next) => setAdmin(next)} />;
  }

  const currentNav = NAV_ITEMS.find((n) => n.key === activeNav) ?? NAV_ITEMS[0]!;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      <aside className="w-full lg:w-64 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col justify-between shrink-0">
        <div className="p-4 space-y-5">
          <div className="flex items-center gap-2.5 px-2 pt-1">
            <div className="h-9 w-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-2xs">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900">Mio Admin</div>
              <div className="text-[11px] text-slate-500">动态治理与全栈监控</div>
            </div>
          </div>

          <nav className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = item.key === activeNav;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActiveNav(item.key)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl flex items-start gap-3 transition cursor-pointer ${
                    active
                      ? 'bg-indigo-50 text-indigo-900 border border-indigo-200/70'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent'
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 mt-0.5 shrink-0 ${
                      active ? 'text-indigo-600' : 'text-slate-400'
                    }`}
                  />
                  <div>
                    <div className="text-xs font-semibold">{item.label}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{item.subtitle}</div>
                  </div>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-slate-100 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs font-mono font-semibold text-slate-900 truncate">
              {admin.username}
            </div>
            <div className="text-[11px] text-slate-500">超级管理员会话</div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
            title="退出登录"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 flex flex-col">
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">{currentNav.label}</h1>
            <p className="text-xs text-slate-500 mt-0.5">{currentNav.subtitle}</p>
          </div>
          <div className="text-xs text-slate-500 font-mono">API: /api/v1/admin</div>
        </header>

        <div className="p-6 max-w-[1440px] w-full mx-auto">
          {activeNav === 'catalog' && <ModelCatalogPage />}
          {activeNav === 'templates' && <TemplatesPage />}
          {activeNav === 'monitoring' && <MonitoringPage />}
          {activeNav === 'revisions' && <RevisionsPage />}
          {activeNav === 'settings' && <GlobalSettingsPage />}
          {activeNav === 'account' && (
            <AccountSettingsPage admin={admin} onAdminUpdated={(next) => setAdmin(next)} />
          )}
        </div>
      </main>
    </div>
  );
}
