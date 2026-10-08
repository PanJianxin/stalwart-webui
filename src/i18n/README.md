# 中文管理界面

此安装默认使用简体中文；邮箱账户的 locale 不改变后台显示语言。固定按钮与提示在 zh.json，服务端公开 schema 的显示短语在 schema-zh.json，高频人工校正术语在 schema-zh-overrides.json。初稿采用本地离线翻译模型，常用导航、账户、密码、配额及错误提示已人工修订。

仅翻译 label/title/description/placeholder 等显示元数据与导航显示名称。对象 ID、字段名、枚举传输值、默认值、Management/Settings/Account 路由名称及用户输入保持原值。新版本新增短语若未收录，会保留原文，便于逐步补充；技术名称及外部服务名保留英文。第三方 OAuth 登录页和服务器返回的未知诊断文本不属于本前端的翻译资源。

修改后运行 npm test、npm run build。插值变量必须与 en.json 一致。schemaChinese.test.ts 验证插值与传输值边界，pandaSchema.test.ts 验证租户隐藏与原 schema 不被修改。
