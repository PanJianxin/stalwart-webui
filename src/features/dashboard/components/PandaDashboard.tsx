import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { getAccountId, jmapRequest } from '@/services/jmap/client';
import { useAccountStore } from '@/stores/accountStore';

const metrics = [
  { type: 'x:Account', label: '账户 / Accounts', permission: 'sysAccount', path: 'x:Account/User' },
  { type: 'x:Domain', label: '域名 / Domains', permission: 'sysDomain', path: 'x:Domain' },
  {
    type: 'x:QueuedMessage',
    label: '待投递邮件 / Queued mail',
    permission: 'sysQueuedMessage',
    path: 'x:QueuedMessage',
  },
  { type: 'x:Task', label: '任务 / Tasks', permission: 'sysTask', path: 'x:Task' },
  {
    type: 'x:NetworkListener',
    label: '监听器 / Listeners',
    permission: 'sysNetworkListener',
    path: 'x:NetworkListener',
  },
];
export function PandaDashboard({ section }: { dashboardId: string; section: string }) {
  const navigate = useNavigate();
  const permissions = useAccountStore((s) => s.permissions);
  const edition = useAccountStore((s) => s.edition);
  const [values, setValues] = useState<Record<string, number | string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [updated, setUpdated] = useState<Date>();
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError('');
      const allowed = metrics.filter((m) => permissions.includes(`${m.permission}Get`));
      try {
        const responses = await jmapRequest(
          allowed.map((m) => [
            `${m.type}/query`,
            { accountId: getAccountId(m.type), limit: 1, calculateTotal: true },
            m.type,
          ]),
          signal,
        );
        if (signal?.aborted) return;
        const next: Record<string, number | string> = {};
        for (const [method, result, id] of responses) {
          next[id] =
            method === 'error'
              ? `不可用: ${String(result.type)}`
              : typeof result.total === 'number'
                ? result.total
                : '无统计数据';
        }
        setValues(next);
        setUpdated(new Date());
      } catch (e) {
        if (!signal?.aborted) setError(e instanceof Error ? e.message : '读取失败');
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [permissions],
  );
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void refresh(controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [refresh]);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Panda Mail Dashboard</h1>
        <Button variant="outline" disabled={loading} onClick={() => void refresh()}>
          {loading ? '读取中…' : '刷新 / Refresh'}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        版本：{edition} · 基础运行概览，通过管理 API 实时读取。账户统计包含管理员和组；任务统计包含证书续期等任务。
      </p>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
        {metrics
          .filter((m) => permissions.includes(`${m.permission}Get`))
          .map((m) => (
            <button
              key={m.type}
              className="rounded-lg border p-5 text-left hover:bg-accent"
              onClick={() => navigate(`/${m.type === 'x:NetworkListener' ? 'Settings' : section}/${m.path}`)}
            >
              <div className="text-sm text-muted-foreground">{m.label}</div>
              <div className="mt-3 text-2xl font-semibold">{values[m.type] ?? '—'}</div>
            </button>
          ))}
      </div>
      <p className="text-sm text-muted-foreground">
        {updated ? `最后读取：${updated.toLocaleString()}` : '尚未读取'}。本页提供当前数量，不含历史流量、CPU
        或内存监控。
      </p>
    </div>
  );
}
