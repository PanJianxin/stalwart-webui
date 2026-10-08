-- metric_sample: 单台邮件服务器的聚合指标快照；保留7天，无邮件内容和身份凭据。
CREATE TABLE IF NOT EXISTS metric_sample (
    id TEXT NOT NULL DEFAULT '' PRIMARY KEY, -- 应用生成UUID；每次采样唯一标识。
    sampled_time INTEGER NOT NULL DEFAULT 0, -- UTC Unix秒；实际成功采集时间，用于范围查询。
    metrics_json TEXT NOT NULL DEFAULT '{}' -- JSON对象；白名单指标名到有限数值的映射，单位由API契约定义。
);
CREATE INDEX IF NOT EXISTS idx__sampled_time ON metric_sample (sampled_time);
