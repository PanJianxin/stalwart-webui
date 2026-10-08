import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '@/services/api';
import { Button } from '@/components/ui/button';
type Address = { name: string; email: string };
type Record = {
  id: string;
  direction: string;
  subject: string;
  accountAddress: string;
  from: Address[];
  to: Address[];
  cc: Address[];
  messageTime: number;
  firstSeenTime: number;
  sizeBytes: number;
  messageIds: string[];
  folders: { name: string }[];
  status: string;
};
type Result = { items: Record[]; total: number; lastSyncTime: number | null; syncError: string | null };
const address = (items: Address[]) => items.map((x) => (x.name ? `${x.name} <${x.email}>` : x.email)).join(', ') || '—';
export function MailHistory({ id, section }: { id?: string; section: string }) {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const en = i18n.language.startsWith('en');
  const t = (zh: string, english: string) => (en ? english : zh);
  const [result, setResult] = useState<Result>();
  const [detail, setDetail] = useState<Record>();
  const [direction, setDirection] = useState('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const root = `/${section}/CustomComponent/MailHistory`;
  const date = (value: number) => new Date(value * 1000).toLocaleString(en ? 'en-US' : 'zh-CN');
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) {
        setLoading(true);
        setError(false);
        setDetail(undefined);
      }
    });
    const path = id
      ? `/api/panda/history/${encodeURIComponent(id)}`
      : `/api/panda/history?${new URLSearchParams({ direction, search: query, page: String(page) })}`;
    apiFetch(path)
      .then(async (r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data) => {
        if (active) {
          if (id) setDetail(data);
          else setResult(data);
        }
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, direction, query, page, refresh]);
  const status = (r: Record) =>
    r.status === 'sentCopy' ? t('已保存发送副本', 'Sent copy saved') : t('已存入邮箱', 'Stored in mailbox');
  return (
    <main className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{t('收发历史', 'Mail history')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              '邮件元数据记录 · 每 30 秒采集 · 保留 90 天',
              'Mail metadata · collected every 30 seconds · retained for 90 days',
            )}
          </p>
        </div>
        <Button variant="outline" onClick={() => setRefresh((x) => x + 1)}>
          {t('刷新', 'Refresh')}
        </Button>
      </div>
      <div className="rounded-xl border bg-muted/30 p-4 text-sm leading-6">
        {t(
          '收件记录表示邮件已进入本地邮箱；发送记录表示已发送文件夹中的副本，不代表对方服务器已接收。不采集正文。首次采集会补录最近 90 天仍在邮箱中的邮件，采集后删除邮件不会删除历史。',
          'Received records confirm local mailbox storage. Sent records are copies in Sent, not confirmation from the destination server. Bodies are not collected. Initial collection imports existing mail from the last 90 days; deleting captured mail preserves its history.',
        )}
      </div>
      {id && (
        <Button variant="outline" onClick={() => navigate(root)}>
          {t('返回列表', 'Back to list')}
        </Button>
      )}
      {!id && (
        <form
          className="flex flex-wrap gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(search);
            setPage(1);
          }}
        >
          <select
            className="rounded-md border bg-background px-3 py-2"
            value={direction}
            onChange={(e) => {
              setDirection(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">{t('全部记录', 'All records')}</option>
            <option value="received">{t('收件', 'Received')}</option>
            <option value="sent">{t('发送副本', 'Sent copies')}</option>
          </select>
          <input
            className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2"
            aria-label={t('搜索历史', 'Search history')}
            placeholder={t('搜索主题、发件人、收件人或邮箱', 'Search subject, sender, recipient or mailbox')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button type="submit">{t('搜索', 'Search')}</Button>
        </form>
      )}
      {error ? (
        <p role="alert" className="text-destructive">
          {t(
            '无法读取历史，请确认管理员权限后重试。',
            'Unable to read history. Check administrator permissions and retry.',
          )}
        </p>
      ) : loading ? (
        <p>{t('加载中…', 'Loading…')}</p>
      ) : id ? (
        detail && (
          <section className="rounded-xl border bg-card p-5">
            <h2 className="mb-6 break-words text-lg font-semibold">
              {detail.subject || t('（无主题）', '(No subject)')}
            </h2>
            <dl className="grid gap-4 text-sm sm:grid-cols-[130px_1fr]">
              {[
                [
                  t('记录类型', 'Type'),
                  detail.direction === 'sent' ? t('发送副本', 'Sent copy') : t('收件', 'Received'),
                ],
                [t('所属邮箱', 'Mailbox'), detail.accountAddress],
                [t('发件人', 'From'), address(detail.from)],
                [t('收件人', 'To'), address(detail.to)],
                [t('抄送', 'Cc'), address(detail.cc)],
                [t('邮件时间', 'Mail time'), date(detail.messageTime)],
                [t('首次采集', 'First captured'), date(detail.firstSeenTime)],
                [t('记录状态', 'Status'), status(detail)],
                [t('邮件大小', 'Size'), `${detail.sizeBytes.toLocaleString()} B`],
                [t('采集时文件夹', 'Folders at capture'), detail.folders.map((x) => x.name).join(', ')],
                ['Message-ID', detail.messageIds.join(', ') || '—'],
              ].map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="min-w-0 break-all">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )
      ) : (
        <>
          {result?.syncError && (
            <p role="alert" className="text-amber-600">
              {t(
                '采集暂时失败，以下为已保存的记录。',
                'Collection temporarily failed; saved records remain available.',
              )}
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            {t('共', 'Total')} {result?.total ?? 0} {t('条记录', 'records')} · {t('最近采集', 'Last collection')}:{' '}
            {result?.lastSyncTime ? date(result.lastSyncTime) : t('等待首次采集', 'Awaiting first collection')}
          </p>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead className="bg-muted/40">
                <tr>
                  {[
                    t('时间', 'Time'),
                    t('类型', 'Type'),
                    t('所属邮箱', 'Mailbox'),
                    t('发件人 → 收件人', 'From → To'),
                    t('主题', 'Subject'),
                    t('状态', 'Status'),
                  ].map((x) => (
                    <th key={x} className="p-3 font-medium">
                      {x}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result?.items.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-muted/30">
                    <td className="whitespace-nowrap p-3">{date(r.messageTime)}</td>
                    <td className="p-3">{r.direction === 'sent' ? t('发送', 'Sent') : t('收件', 'Received')}</td>
                    <td className="max-w-48 break-all p-3">{r.accountAddress}</td>
                    <td className="max-w-72 break-all p-3">
                      {address(r.from)}
                      <br />
                      <span className="text-muted-foreground">→ {address(r.to)}</span>
                    </td>
                    <td className="max-w-80 break-words p-3">
                      <button
                        className="text-left text-primary underline underline-offset-4"
                        onClick={() => navigate(`${root}/${r.id}`)}
                      >
                        {r.subject || t('（无主题）', '(No subject)')}
                      </button>
                    </td>
                    <td className="p-3">{status(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!result?.items.length && (
              <p className="p-8 text-center text-muted-foreground">{t('暂无符合条件的记录', 'No matching records')}</p>
            )}
          </div>
          <div className="flex items-center justify-end gap-3">
            <Button variant="outline" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              {t('上一页', 'Previous')}
            </Button>
            <span>{page}</span>
            <Button
              variant="outline"
              disabled={page * 50 >= (result?.total ?? 0)}
              onClick={() => setPage((p) => p + 1)}
            >
              {t('下一页', 'Next')}
            </Button>
          </div>
        </>
      )}
    </main>
  );
}
