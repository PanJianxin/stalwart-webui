# 邮件指标采集 API

使用 Stalwart 社区版 Prometheus 导出，不修改服务器许可判定。仅在 Compose 内网采集。

GET `/api/panda/dashboard?hours=1|24|168`：复用管理后台 Authorization，经 Stalwart `/api/account` 验证 `sysMetricsGet` 权限；返回进程内存、连接、事件计数和最近 7 天采样。无邮件正文、收发地址或持久化凭据。未授权返回 401，权限不足返回 403。

采样每 60 秒。失败不写零值；超过两次周期未采样显示过期。计数器重置和采样断档交给前端展示缺口，不伪造历史数据。

## 存储 ADR / 检查清单

本服务新建 SQLite 3 单进程指标库，独立于邮件数据库。首次启动幂等建表；无旧表迁移。`metric_sample` 只属于本邮件服务器，不复制账户、租户等业务实体。保留 7 天，自动清理是指标生命周期的一部分。数据库随 `dashboard/data` 备份；可删除容器而不删除历史库。

适用规则：DBN-01/02/03/06/07，DBF-04/05/06，SQL-01/02。表列小写 snake_case、绑定参数；应用生成 UUID 字符串 ID（DBF-00 对 legacy BIGINT 的 SQLite 例外）；时间为 UTC Unix 秒。SQLite 不支持 COMMENT ON，业务注释放在 schema.sql。非业务监控数据，不引入 Java/tenant/soft-delete 基类。API 与前端字段 camelCase，时间字段 `sampleTime/generatedTime/collectionStartTime`；外部 Prometheus 原名仅在适配器保留。

运行测试：`python3 -m unittest discover -s dashboard-api -p 'test_*.py'`。

## 独立收发历史（2026-10-08）

新增 `/api/panda/history?direction=all|received|sent&search=&page=1` 与 `/api/panda/history/{id}`。复用管理登录，并同时验证 `impersonate`、`sysAccountGet`，普通用户不能跨邮箱查看。查询采用绑定参数，每页 50 条。返回时间、邮箱所有者、主题、From/To/Cc、Message-ID、大小和采集时文件夹；不采集正文及附件。

后台通过社区版管理/JMAP 跨账户读取元数据，每 30 秒同步 Email/changes。初次补录最近 90 天现存邮件，草稿跳过；采集后删除邮件保留历史。收件仅证明本地已存储；发送记录是 Sent 文件夹副本，不证明外部 SMTP 成功，不覆盖没有保存副本的提交、SMTP 拒收或采集前删除的邮件。历史保留 90 天。

存储 ADR 补充：`mail_history` 是独立元数据审计快照，会持久化邮件地址与主题，访问范围仅服务器管理员。`mail_sync_state` 存外部 JMAP 账户 ID 和不透明游标，属于技术同步表，使用上游 ID 作主键的例外；不会把用户邮箱账户复制为可编辑业务实体。新增表与索引为幂等、加法迁移，现有指标保持。UUID5 ID 稳定去重；API camelCase；UTC 秒；schema.sql 注释覆盖每列。已适用既有 DBN/DBF/SQL 清单。90 天保留以邮件时间计算，不是永久档案。

采集凭据由已有 `ws run --project panda-mail --environment prod` 安全注入的密码在内存经 SSH stdin 加密投递，不写明文。服务器加密镜像位于 `/root/Workspaces/.workspace/secrets/profiles/personal-mail-history/STALWART_ADMIN_PASSWORD.age`；服务器专用 age 身份位于控制平面之外 `/root/.config/panda-workspace/age/identity.txt`，0600。两个文件只读挂入 `/run/history/`，容器只在进程内解密，不记录错误详情或认证头。密码轮换后需重新加密同步并重建采集容器。数据库与 age 身份须分别受控备份；不能把数据库开放给普通用户。
