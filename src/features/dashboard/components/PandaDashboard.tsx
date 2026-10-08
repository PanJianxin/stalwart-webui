import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, ArrowUpRight, Clock3, HardDrive, Mail, RefreshCw, ShieldCheck, Users } from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/services/api';
import { getAccountId, jmapRequest } from '@/services/jmap/client';
import { useAccountStore } from '@/stores/accountStore';
import type { JmapMethodCall } from '@/types/jmap';
import { chartSamples, type MetricHistory } from '../pandaMetrics';

interface Account {
  id: string;
  name: string;
  emailAddress: string;
  usedDiskQuota: number;
  '@type': string;
}
interface Certificate {
  id: string;
  notValidAfter: string;
  subjectAlternativeNames: Record<string, boolean>;
}
interface Listener {
  id: string;
  name: string;
  protocol: string;
  bind: Record<string, boolean>;
  useTls: boolean;
}
interface Overview {
  counts: Record<string, number>;
  accounts: Account[];
  certificates: Certificate[];
  listeners: Listener[];
}
const EMPTY: Overview = { counts: {}, accounts: [], certificates: [], listeners: [] };
const COLORS = ['#2563eb', '#f59e0b', '#14b8a6', '#8b5cf6', '#64748b'];
const number = (value?: number) => (value == null ? '—' : value.toLocaleString('zh-CN'));
const bytes = (value?: number) =>
  value == null ? '—' : value >= 1048576 ? `${(value / 1048576).toFixed(1)} MB` : `${(value / 1024).toFixed(1)} KB`;
const tooltipStyle = {
  borderRadius: 12,
  border: '1px solid var(--border)',
  background: 'var(--card)',
  color: 'var(--foreground)',
  fontSize: 12,
};

function ChartPanel({ title, detail, children }: { title: string; detail: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-5 shadow-sm">
      <h2 className="font-semibold">{title}</h2>
      <p className="mt-1 mb-5 text-xs leading-5 text-muted-foreground">{detail}</p>
      {children}
    </section>
  );
}
function EmptyChart({ text = '暂无可用数据' }: { text?: string }) {
  return (
    <div className="flex h-56 items-center justify-center rounded-xl bg-muted/30 text-sm text-muted-foreground">
      {text}
    </div>
  );
}

export function PandaDashboard({ section }: { dashboardId: string; section: string }) {
  const navigate = useNavigate();
  const permissions = useAccountStore((s) => s.permissions);
  const [overview, setOverview] = useState<Overview>(EMPTY);
  const [history, setHistory] = useState<MetricHistory>();
  const [hours, setHours] = useState(24);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [updatedTime, setUpdatedTime] = useState<Date>();
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError('');
      const calls: JmapMethodCall[] = [];
      const accountId = getAccountId('x:Account');
      const countTypes = ['Account', 'Domain', 'QueuedMessage', 'Task', 'NetworkListener'];
      for (const type of countTypes)
        if (permissions.includes(`sys${type}Get`)) {
          calls.push([`x:${type}/query`, { accountId, limit: 1, calculateTotal: true }, type]);
        }
      if (permissions.includes('sysAccountGet')) {
        calls.push(['x:Account/query', { accountId, limit: 100 }, 'accountIds']);
        calls.push([
          'x:Account/get',
          {
            accountId,
            '#ids': { resultOf: 'accountIds', name: 'x:Account/query', path: '/ids' },
            properties: ['id', '@type', 'name', 'emailAddress', 'usedDiskQuota'],
          },
          'accounts',
        ]);
      }
      if (permissions.includes('sysCertificateGet'))
        calls.push([
          'x:Certificate/get',
          { accountId, ids: null, properties: ['id', 'notValidAfter', 'subjectAlternativeNames'] },
          'certificates',
        ]);
      if (permissions.includes('sysNetworkListenerGet'))
        calls.push([
          'x:NetworkListener/get',
          { accountId, ids: null, properties: ['id', 'name', 'protocol', 'bind', 'useTls'] },
          'listeners',
        ]);
      try {
        const results = await Promise.allSettled([
          jmapRequest(calls, signal),
          apiFetch(`/api/panda/dashboard?hours=${hours}`, { signal }).then((r) => r.json() as Promise<MetricHistory>),
        ]);
        if (signal?.aborted) return;
        const failures: string[] = [];
        if (results[0].status === 'fulfilled') {
          const next: Overview = { counts: {}, accounts: [], certificates: [], listeners: [] };
          for (const [method, result, id] of results[0].value) {
            if (method === 'error') {
              failures.push('部分管理数据暂不可用');
              continue;
            }
            if (typeof result.total === 'number') next.counts[id] = result.total;
            if (id === 'accounts') next.accounts = (result.list ?? []) as Account[];
            if (id === 'certificates') next.certificates = (result.list ?? []) as Certificate[];
            if (id === 'listeners') next.listeners = (result.list ?? []) as Listener[];
          }
          setOverview(next);
        } else failures.push('管理数据读取失败');
        if (results[1].status === 'fulfilled') setHistory(results[1].value);
        else {
          setHistory(undefined);
          failures.push('监控历史读取失败，请检查采集服务或账户权限');
        }
        setError([...new Set(failures)].join('；'));
        setUpdatedTime(new Date());
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [permissions, hours],
  );
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void refresh(controller.signal), 0);
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh(controller.signal);
    }, 60000);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      controller.abort();
    };
  }, [refresh]);
  const points = useMemo(() => (history ? chartSamples(history) : []), [history]);
  const latest = history?.samples.at(-1);
  const stale = !latest || (updatedTime?.getTime() ?? 0) / 1000 - latest.sampleTime > 150;
  const mailDistribution = latest
    ? [
        { name: '正常邮件', value: latest.hamTotal },
        { name: '垃圾邮件', value: latest.spamTotal },
      ].filter((v) => v.value > 0)
    : [];
  const connections = latest
    ? [
        { name: '网页 / JMAP', value: latest.httpConnections },
        { name: 'SMTP 收件', value: latest.smtpConnections },
        { name: 'SMTP 投递', value: latest.deliveryConnections },
        { name: 'IMAP', value: latest.imapConnections },
        { name: 'POP3', value: latest.pop3Connections },
        { name: 'Sieve', value: latest.sieveConnections },
      ].filter((v) => v.value != null)
    : [];
  const usage = overview.accounts
    .filter((a) => a['@type'] === 'User')
    .sort((a, b) => b.usedDiskQuota - a.usedDiskQuota)
    .slice(0, 8)
    .map((a) => ({ name: a.name, value: Math.round(((a.usedDiskQuota ?? 0) / 1024) * 10) / 10 }));
  const minCertificateDays = overview.certificates.length
    ? Math.min(
        ...overview.certificates.map((c) =>
          Math.floor((new Date(c.notValidAfter).getTime() - (updatedTime?.getTime() ?? 0)) / 86400000),
        ),
      )
    : undefined;
  const cards = [
    {
      label: '邮件账户',
      value: number(overview.counts.Account),
      detail: `${number(overview.counts.Domain)} 个域名 · 含管理员与组`,
      icon: Users,
      path: `/${section}/x:Account/User`,
      color: 'text-blue-600 bg-blue-500/10',
    },
    {
      label: '待投递邮件',
      value: number(overview.counts.QueuedMessage),
      detail: overview.counts.QueuedMessage === 0 ? '当前没有积压' : '查看队列与重试状态',
      icon: Mail,
      path: `/${section}/x:QueuedMessage`,
      color: 'text-teal-600 bg-teal-500/10',
    },
    {
      label: '邮件进程内存',
      value: bytes(latest?.memoryBytes),
      detail: 'Stalwart 进程实际占用',
      icon: HardDrive,
      color: 'text-violet-600 bg-violet-500/10',
    },
    {
      label: '证书有效期',
      value: minCertificateDays == null ? '—' : `${minCertificateDays} 天`,
      detail: '最早到期的邮件服务证书',
      icon: ShieldCheck,
      path: '/Settings/x:Certificate',
      color: 'text-amber-600 bg-amber-500/10',
    },
  ];
  return (
    <div className="space-y-5 pb-6">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-blue-500/15 bg-gradient-to-r from-blue-500/10 via-blue-500/5 to-transparent p-6">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-blue-600">
            <Activity size={14} /> PANDA MAIL
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">邮件运行总览</h1>
          <p className="mt-2 text-sm text-muted-foreground">邮件处理、服务连接、存储与证书状态</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${stale ? 'text-amber-600' : 'text-teal-600'}`}
          >
            <span className={`h-2 w-2 rounded-full ${stale ? 'bg-amber-500' : 'bg-teal-500'}`} />
            {stale ? '等待采样或数据过期' : '监控采样正常'}
          </span>
          <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            {loading ? '更新中' : '刷新'}
          </Button>
        </div>
      </header>
      {(error || history?.collectorError) && (
        <div role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700">
          {error || history?.collectorError}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <button
            key={card.label}
            disabled={!card.path}
            onClick={() => card.path && navigate(card.path)}
            className="rounded-2xl border bg-card p-5 text-left shadow-sm transition-colors enabled:hover:border-blue-500/40"
          >
            <div className="flex items-center justify-between">
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${card.color}`}>
                <card.icon size={18} />
              </span>
              {card.path && <ArrowUpRight size={14} className="text-muted-foreground" />}
            </div>
            <p className="mt-4 text-sm text-muted-foreground">{card.label}</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight">{card.value}</p>
            <p className="mt-2 text-xs text-muted-foreground">{card.detail}</p>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock3 size={14} />
          每分钟采样 · 自动刷新 · 保留 7 天
        </div>
        <div className="flex rounded-lg border bg-card p-1">
          {[
            { value: 1, label: '近 1 小时' },
            { value: 24, label: '近 24 小时' },
            { value: 168, label: '近 7 天' },
          ].map((p) => (
            <button
              key={p.value}
              onClick={() => setHours(p.value)}
              aria-pressed={hours === p.value}
              className={`rounded-md px-3 py-1.5 text-xs transition-colors ${hours === p.value ? 'bg-blue-600 text-white' : 'text-muted-foreground hover:bg-muted'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <ChartPanel
          title="邮件处理趋势"
          detail="每个采样间隔内进入邮箱的正常、垃圾邮件，以及完成的投递次数。重启或采样断档处不连接。"
        >
          {points.length >= 2 ? (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={points} margin={{ left: -20, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="time" tick={{ fontSize: 11 }} minTickGap={35} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Area
                  type="linear"
                  dataKey="ham"
                  name="正常邮件"
                  stroke={COLORS[0]}
                  fill={COLORS[0]}
                  fillOpacity={0.1}
                  isAnimationActive={false}
                  connectNulls={false}
                />
                <Area
                  type="linear"
                  dataKey="spam"
                  name="垃圾邮件"
                  stroke={COLORS[1]}
                  fill={COLORS[1]}
                  fillOpacity={0.1}
                  isAnimationActive={false}
                  connectNulls={false}
                />
                <Area
                  type="linear"
                  dataKey="delivered"
                  name="完成投递"
                  stroke={COLORS[2]}
                  fill={COLORS[2]}
                  fillOpacity={0.1}
                  isAnimationActive={false}
                  connectNulls={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart text="正在积累历史数据，至少需要两次采样" />
          )}
        </ChartPanel>
        <ChartPanel title="入箱邮件分类" detail="当前 Stalwart 进程启动以来的入箱累计，不代表今天收件量。">
          {mailDistribution.length ? (
            <>
              <ResponsiveContainer width="100%" height={205}>
                <PieChart>
                  <Pie
                    data={mailDistribution}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={3}
                    isAnimationActive={false}
                  >
                    {mailDistribution.map((item) => (
                      <Cell key={item.name} fill={item.name === '垃圾邮件' ? COLORS[1] : COLORS[0]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <p className="text-center text-xs text-muted-foreground">
                累计入箱 {number(latest ? latest.hamTotal + latest.spamTotal : undefined)} 封
              </p>
            </>
          ) : (
            <EmptyChart text="当前进程尚未记录入箱邮件" />
          )}
        </ChartPanel>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartPanel title="服务连接分布" detail="最近一次采样的活动连接数。采集与管理后台访问也计入 HTTP 连接。">
          {connections.length ? (
            <ResponsiveContainer width="100%" height={235}>
              <BarChart data={connections} margin={{ left: -20, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar
                  dataKey="value"
                  name="活动连接"
                  radius={[5, 5, 0, 0]}
                  fill={COLORS[0]}
                  maxBarSize={38}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart />
          )}
        </ChartPanel>
        <ChartPanel title="进程内存趋势" detail="Stalwart 进程内存，单位 MB；不包含系统或其他容器的占用。">
          {points.length ? (
            <ResponsiveContainer width="100%" height={235}>
              <AreaChart data={points} margin={{ left: -5, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="time" tick={{ fontSize: 11 }} minTickGap={35} />
                <YAxis tick={{ fontSize: 11 }} domain={[0, 'auto']} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area
                  dataKey="memoryMiB"
                  name="进程内存 MB"
                  stroke={COLORS[3]}
                  fill={COLORS[3]}
                  fillOpacity={0.12}
                  dot={points.length < 3}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart />
          )}
        </ChartPanel>
        <ChartPanel title="邮箱存储占用" detail="当前读取的最多 100 个账户中，占用最大的 8 个用户邮箱，单位 KB。">
          {usage.length ? (
            <ResponsiveContainer width="100%" height={235}>
              <BarChart data={usage} layout="vertical" margin={{ left: 0, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={75} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar
                  dataKey="value"
                  name="已用存储 KB"
                  fill={COLORS[2]}
                  radius={[0, 5, 5, 0]}
                  maxBarSize={28}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart />
          )}
        </ChartPanel>
        <ChartPanel
          title="登录安全趋势"
          detail="每个采样间隔内的认证失败次数，包括客户端登录；采集间断和计数器重置显示缺口。"
        >
          {points.length >= 2 ? (
            <ResponsiveContainer width="100%" height={235}>
              <BarChart data={points} margin={{ left: -20, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="time" tick={{ fontSize: 11 }} minTickGap={35} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar
                  dataKey="authFailed"
                  name="认证失败"
                  fill="#f97316"
                  radius={[3, 3, 0, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart text="正在积累登录事件历史" />
          )}
        </ChartPanel>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartPanel title="证书到期提醒" detail="邮件服务使用的 TLS 证书；网站反向代理证书由 Caddy 独立管理。">
          <div className="space-y-3">
            {overview.certificates.length ? (
              overview.certificates.map((c) => {
                const days = Math.floor(
                  (new Date(c.notValidAfter).getTime() - (updatedTime?.getTime() ?? 0)) / 86400000,
                );
                return (
                  <button
                    key={c.id}
                    onClick={() => navigate('/Settings/x:Certificate')}
                    className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/35 p-3 text-left text-sm"
                  >
                    <div>
                      <p className="font-medium">{Object.keys(c.subjectAlternativeNames ?? {}).join('、')}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {new Date(c.notValidAfter).toLocaleDateString('zh-CN')} 到期
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs ${days <= 30 ? 'bg-amber-500/10 text-amber-700' : 'bg-teal-500/10 text-teal-700'}`}
                    >
                      {days < 0 ? '已过期' : `剩余 ${days} 天`}
                    </span>
                  </button>
                );
              })
            ) : (
              <p className="text-sm text-muted-foreground">暂无可读取证书</p>
            )}
          </div>
        </ChartPanel>
        <ChartPanel title="服务监听配置" detail="服务器内部配置，不代表公网防火墙已放行。">
          <div className="grid gap-2 sm:grid-cols-2">
            {overview.listeners.map((l) => (
              <div
                key={l.id}
                className="grid grid-cols-[minmax(0,1fr)_4rem_5rem] items-center gap-2 rounded-xl bg-muted/35 px-3 py-2 text-xs"
              >
                <span className="min-w-0 break-words font-medium">
                  {l.protocol === 'http' ? 'HTTP' : l.protocol.toUpperCase()}
                </span>
                <span className="text-center tabular-nums text-muted-foreground">
                  {Object.keys(l.bind ?? {})
                    .map((v) => v.split(':').at(-1))
                    .join('、')}
                </span>
                <span
                  className={`text-right whitespace-nowrap ${l.useTls ? 'text-teal-600' : 'text-muted-foreground'}`}
                >
                  {l.useTls ? '支持 TLS' : '内部明文'}
                </span>
              </div>
            ))}
          </div>
        </ChartPanel>
      </div>
      <footer className="text-xs leading-6 text-muted-foreground">
        {updatedTime ? `页面更新：${updatedTime.toLocaleString('zh-CN')}` : '页面尚未更新'} ·{' '}
        {history?.collectionStartTime
          ? `历史采集开始：${new Date(history.collectionStartTime * 1000).toLocaleString('zh-CN')}`
          : '历史尚未开始采集'}
        。图表只显示实际采样，不补造过去的数据。
      </footer>
    </div>
  );
}
