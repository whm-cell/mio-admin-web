import { Lock, ShieldCheck, User } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { adminApi } from '../api';
import { clearSavedCredentials, readSavedCredentials, saveCredentials } from '../savedCredentials';
import type { AdminAccount } from '../types';

interface LoginPageProps {
  onAuthenticated: (admin: AdminAccount) => void;
}

export function LoginPage({ onAuthenticated }: LoginPageProps) {
  const initialSaved = readSavedCredentials();
  const [username, setUsername] = useState(initialSaved?.username ?? '');
  const [password, setPassword] = useState(initialSaved?.password ?? '');
  const [rememberCredentials, setRememberCredentials] = useState(Boolean(initialSaved));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    const trimmedUser = username.trim();
    try {
      const res = await adminApi.login(trimmedUser, password);
      if (rememberCredentials) {
        saveCredentials(trimmedUser, password);
      } else {
        clearSavedCredentials();
      }
      onAuthenticated(res.admin);
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败，请检查后端服务状态');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-11 w-11 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-900 tracking-tight">
                Mio 管理控制台
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                动态模型目录 · 协议快捷模板 · 业务与中间件监控
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                管理员用户名
              </label>
              <div className="relative">
                <User className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="请输入管理员用户名"
                  className="w-full pl-10 pr-3.5 py-2.5 text-sm rounded-lg border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">登录密码</label>
              <div className="relative">
                <Lock className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="请输入管理员密码"
                  className="w-full pl-10 pr-3.5 py-2.5 text-sm rounded-lg border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-0.5">
              <label className="inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberCredentials}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setRememberCredentials(checked);
                    if (!checked) clearSavedCredentials();
                  }}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span>记住账号与密码（保存在当前浏览器）</span>
              </label>
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-lg bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-xs text-rose-700"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium shadow-xs transition cursor-pointer"
            >
              {submitting ? '正在验证身份…' : '进入管理后台'}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-100 text-xs text-slate-500 leading-relaxed">
            管理员会话独立于普通创作者账号（HttpOnly Cookie
            隔离）。登录后可在「管理员账号」页随时修改用户名与密码。
          </div>
        </div>
      </div>
    </div>
  );
}
