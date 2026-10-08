-- metric_sample: 单台邮件服务器的聚合指标快照；保留7天，无邮件内容和身份凭据。
CREATE TABLE IF NOT EXISTS metric_sample (
    id TEXT NOT NULL DEFAULT '' PRIMARY KEY, -- 应用生成UUID；每次采样唯一标识。
    sampled_time INTEGER NOT NULL DEFAULT 0, -- UTC Unix秒；实际成功采集时间，用于范围查询。
    metrics_json TEXT NOT NULL DEFAULT '{}' -- JSON对象；白名单指标名到有限数值的映射，单位由API契约定义。
);
CREATE INDEX IF NOT EXISTS idx__sampled_time ON metric_sample (sampled_time);

-- mail_history: 邮箱邮件元数据快照，独立于邮件正文库；保留90天，删除原邮件不删除记录。
CREATE TABLE IF NOT EXISTS mail_history (
    id TEXT NOT NULL DEFAULT '' PRIMARY KEY, -- 应用生成确定性UUID，保证重复采集幂等。
    account_id TEXT NOT NULL DEFAULT '', -- 外部Stalwart账户ID，无跨系统外键。
    email_id TEXT NOT NULL DEFAULT '', -- 外部JMAP邮件ID，作为采集去重键。
    direction TEXT NOT NULL DEFAULT 'received', -- received/sent；按邮箱文件夹角色分类。
    message_time INTEGER NOT NULL DEFAULT 0, -- 服务器receivedAt映射为UTC Unix秒。
    first_seen_time INTEGER NOT NULL DEFAULT 0, -- 首次采集时间。
    updated_time INTEGER NOT NULL DEFAULT 0, -- 最近成功采集时间。
    metadata_json TEXT NOT NULL DEFAULT '{}' -- 地址、主题、文件夹、大小等；无正文及凭据。
);
CREATE UNIQUE INDEX IF NOT EXISTS uk__account_id__email_id ON mail_history(account_id, email_id);
CREATE INDEX IF NOT EXISTS idx__direction__message_time ON mail_history(direction, message_time);
CREATE INDEX IF NOT EXISTS idx__account_id__message_time ON mail_history(account_id, message_time);
-- mail_sync_state: 每个邮箱的原生Email/changes游标；只在该批次成功持久化后前进。
CREATE TABLE IF NOT EXISTS mail_sync_state (
    id TEXT NOT NULL DEFAULT '' PRIMARY KEY, -- 原生账户ID；技术游标表的外部ID例外。
    state TEXT NOT NULL DEFAULT '', -- 不解析、不修改原生JMAP状态令牌。
    updated_time INTEGER NOT NULL DEFAULT 0 -- 游标成功写入的UTC Unix秒。
);
