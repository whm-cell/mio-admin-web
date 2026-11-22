import { CheckCircle2, KeyRound, Shield, Trash2, UserCheck } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { adminApi } from '../api';
import {
  clearSavedCredentials,
  readSavedCredentials,
  syncSavedCredentialsAfterUpdate,
} from '../savedCredentials';
import type { AdminAccount } from '../types';

interface AccountSettingsPageProps {
  admin: AdminAccount;
  onAdminUpdated: (admin: AdminAccount) => void;
}

export function AccountSettingsPage({ admin, onAdminUpdated }: AccountSettingsPageProps) {
  const [username, setUsername] = useState(admin.username);
  const [savingUsername, setSavingUsername] = useState(false);
  const [usernameMsg, setUsernameMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [hasRemembered, setHasRemembered] = useState(() => Boolean(readSavedCredentials()));

  const handleUsernameSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setUsernameMsg(null);
    const trimmed = username.trim();
    if (!/^[A-Za-z0-9_.-]{3,64}$/.test(trimmed)) {
      setUsernameMsg({
        type: 'err',
        text: '用户名需为 3~64 位字母、数字、下划线、点或连字符',
      });
      return;
    }
    setSavingUsername(true);
    try {
      const res = await adminApi.updateAccount({ username: trimmed });
      syncSavedCredentialsAfterUpdate({ username: res.admin.username });
      onAdminUpdated(res.admin);
      setUsernameMsg({ type: 'ok', text: `管理员用户名已更新为 ${res.admin.username}` });
    } catch (err) {
      setUsernameMsg({
        type: 'err',
        text: err instanceof Error ? err.message : '修改用户名失败',
      });
    } finally {
      setSavingUsername(false);
    }
  };

  const handlePasswordSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setPasswordMsg(null);
    if (!currentPassword) {
      setPasswordMsg({ type: 'err', text: '请提供当前原始密码' });
      return;
    }
    if (newPassword.length < 8 || newPassword.length > 128) {
      setPasswordMsg({ type: 'err', text: '新密码长度需在 8~128 位之间' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: 'err', text: '两次输入的新密码不一致' });
      return;
    }
    setSavingPassword(true);
    try {
      const res = await adminApi.updateAccount({
        currentPassword,
        newPassword,
      });
      syncSavedCredentialsAfterUpdate({ newPassword });
      onAdminUpdated(res.admin);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordMsg({
        type: 'ok',
        text: '密码修改成功，当前会话继续有效（若开启了浏览器记住密码已同步更新），其余历史会话已自动吊销',
      });
    } catch (err) {
      setPasswordMsg({
        type: 'err',
        text: err instanceof Error ? err.message : '修改密码失败',
      });
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div className="rounded-xl bg-white border border-slate-200 p-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3.5">
          <div className="h-11 w-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-semibold text-slate-900">
                {admin.username}
              </span>
              {admin.isSuperAdmin && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-indigo-100 text-indigo-800">
                  超级管理员
                </span>
              )}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              创建时间：{new Date(admin.createdAt).toLocaleString('zh-CN')} · 最近更新：
              {new Date(admin.updatedAt).toLocaleString('zh-CN')}
            </div>
          </div>
        </div>

        {hasRemembered && (
          <button
            type="button"
            onClick={() => {
              clearSavedCredentials();
              setHasRemembered(false);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600 hover:text-rose-600 hover:border-rose-200 cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5" /> 清除本机记住的账号密码
          </button>
        )}
      </div>

      <form
        onSubmit={handleUsernameSubmit}
        className="rounded-xl bg-white border border-slate-200 p-5 space-y-4"
      >
        <div className="flex items-center gap-2">
          <UserCheck className="h-4 w-4 text-indigo-600" />
          <h3 className="text-sm font-semibold text-slate-900">修改管理员用户名</h3>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            新用户名（3~64 位字母、数字、`_`、`.`、`-`）
          </label>
          <input
            type="text"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full max-w-md px-3.5 py-2 text-xs font-mono rounded-lg border border-slate-300 focus:border-indigo-500 outline-none"
          />
        </div>
        {usernameMsg && (
          <div
            className={`rounded-lg px-3.5 py-2 text-xs flex items-center gap-1.5 ${
              usernameMsg.type === 'ok'
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border border-rose-200 text-rose-700'
            }`}
          >
            {usernameMsg.type === 'ok' && <CheckCircle2 className="h-3.5 w-3.5" />}
            {usernameMsg.text}
          </div>
        )}
        <div>
          <button
            type="submit"
            disabled={savingUsername || username.trim() === admin.username}
            className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-medium cursor-pointer"
          >
            {savingUsername ? '保存中…' : '保存新用户名'}
          </button>
        </div>
      </form>

      <form
        onSubmit={handlePasswordSubmit}
        className="rounded-xl bg-white border border-slate-200 p-5 space-y-4"
      >
        <div>
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-indigo-600" />
            <h3 className="text-sm font-semibold text-slate-900">修改登录密码（需校验原始密码）</h3>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            验证当前原始密码通过后更新 scrypt 哈希，并自动撤销该账号在其他设备上的登录态。
          </p>
        </div>

        <div className="space-y-3 max-w-md">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">当前原始密码 *</label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="输入当前正在使用的密码"
              className="w-full px-3.5 py-2 text-xs rounded-lg border border-slate-300 focus:border-indigo-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              新密码（8~128 位）*
            </label>
            <input
              type="password"
              required
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="输入新密码"
              className="w-full px-3.5 py-2 text-xs rounded-lg border border-slate-300 focus:border-indigo-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">确认新密码 *</label>
            <input
              type="password"
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="再次输入新密码"
              className="w-full px-3.5 py-2 text-xs rounded-lg border border-slate-300 focus:border-indigo-500 outline-none"
            />
          </div>
        </div>

        {passwordMsg && (
          <div
            className={`rounded-lg px-3.5 py-2 text-xs flex items-center gap-1.5 ${
              passwordMsg.type === 'ok'
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border border-rose-200 text-rose-700'
            }`}
          >
            {passwordMsg.type === 'ok' && <CheckCircle2 className="h-3.5 w-3.5" />}
            {passwordMsg.text}
          </div>
        )}

        <div>
          <button
            type="submit"
            disabled={savingPassword}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-medium cursor-pointer"
          >
            {savingPassword ? '校验并修改中…' : '验证原密码并更新'}
          </button>
        </div>
      </form>
    </div>
  );
}
