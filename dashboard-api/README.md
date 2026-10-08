# 邮件指标采集 API

使用 Stalwart 社区版 Prometheus 导出，不修改服务器许可判定。仅在 Compose 内网采集。

GET `/api/panda/dashboard?hours=1|24|168`：复用管理后台 Authorization，经 Stalwart `/api/account` 验证 `sysMetricsGet` 权限；返回进程内存、连接、事件计数和最近 7 天采样。无邮件正文、收发地址或持久化凭据。未授权返回 401，权限不足返回 403。

采样每 60 秒。失败不写零值；超过两次周期未采样显示过期。计数器重置和采样断档交给前端展示缺口，不伪造历史数据。

## 存储 ADR / 检查清单

本服务新建 SQLite 3 单进程指标库，独立于邮件数据库。首次启动幂等建表；无旧表迁移。`metric_sample` 只属于本邮件服务器，不复制账户、租户等业务实体。保留 7 天，自动清理是指标生命周期的一部分。数据库随 `dashboard/data` 备份；可删除容器而不删除历史库。

适用规则：DBN-01/02/03/06/07，DBF-04/05/06，SQL-01/02。表列小写 snake_case、绑定参数；应用生成 UUID 字符串 ID（DBF-00 对 legacy BIGINT 的 SQLite 例外）；时间为 UTC Unix 秒。SQLite 不支持 COMMENT ON，业务注释放在 schema.sql。非业务监控数据，不引入 Java/tenant/soft-delete 基类。API 与前端字段 camelCase，时间字段 `sampleTime/generatedTime/collectionStartTime`；外部 Prometheus 原名仅在适配器保留。

运行测试：`python3 -m unittest discover -s dashboard-api -p 'test_*.py'`。
