# Vigil 服务端 API 文档

采集服务基于 Fastify，默认端口 `3001`。除白名单接口外，所有 `/api` 接口均需鉴权。

---

## 1. 鉴权

| 项目 | 说明 |
| --- | --- |
| 方式 | `Authorization: Bearer <token>`（在请求头携带） |
| 获取 | `POST /api/auth/login` 成功后返回 `data.token` |
| 白名单（无需登录） | `/api/health`、`/api/report`、`/api/auth/login`、`/api/auth/register` |

登录响应示例：

```json
{ "ok": true, "data": { "token": "<jwt>", "user": { "id": "...", "username": "admin", "name": "Admin", "role": "admin" } } }
```

---

## 2. 上报与还原（公开）

### `POST /api/report`
SDK 上报入口，支持单条对象或 `{ "events": [...] }` 批量。

请求体（单条错误示例）：

```json
{
  "kind": "error",
  "appId": "demo-shop",
  "fingerprint": "a1b2c3",
  "message": "Cannot read properties of undefined",
  "level": "error",
  "errorKind": "js",
  "stack": "TypeError: ...\n    at onClick (https://cdn.example.com/assets/index.js:1:23456)",
  "release": "1.0.0",
  "environment": "production",
  "sessionId": "s_xxx",
  "url": "https://example.com/checkout",
  "breadcrumbs": []
}
```

响应：`{ "ok": true, "accepted": 1 }`；空 body 返回 `400`。

### `POST /api/sourcemap`（需登录）
上传 Source Map。表单字段：`appId`、`release`、`fileName`、`content`（.map 文本）。

### `GET /api/sourcemap/:appId`
列出该项目已上传的 Source Map 清单。

### `POST /api/sourcemap/restore`
传入压缩堆栈，返回还原到源码位置的堆栈。

```json
// 请求
{ "appId": "demo-shop", "release": "1.0.0", "stack": "at onClick (https://cdn.example.com/assets/index.js:1:23456)" }
// 响应
{ "ok": true, "data": "at onClick (src/views/Order.tsx:42:13)" }
```

---

## 3. 数据查询（需登录）

### `GET /api/overview`
看板概览。查询参数：`appId`（默认 `demo-shop`）、`range`（`1h` | `24h` | `7d` | `30d`，默认 `24h`）。
返回 `summary`（错误数 / 未解决 Issue 数 / 影响用户数 / PV）、`trend`（时间桶趋势）、
`perf`（Web Vitals 分位数）、`topIssues`、`browsers`（维度分布）。

### `GET /api/issues`
Issue 列表。常见查询参数：`appId`、`status`（`unresolved` | `resolved` | `ignored`）。

### `GET /api/issues/:id`
单个 Issue 详情（含聚合后的堆栈、面包屑、影响用户、事件样本）。

### `PATCH /api/issues/:id`
更新 Issue 状态。Body：`{ "status": "resolved" | "ignored" }`。

### `GET /api/projects` / `POST /api/projects`
项目列表 / 创建项目。

### 告警规则
- `GET /api/alerts/:appId`：列出告警规则
- `POST /api/alerts`：创建规则（body：`appId`、`type`(new_issue|error_spike|perf_degrade)、`threshold`、`webhook`）
- `DELETE /api/alerts/:id`：删除规则

### AI 诊断
- `POST /api/ai/diagnose`：触发或获取某 Issue 的 AI 根因诊断（body：`issueId`）
- `GET /api/ai/status`：查看 AI 服务可用状态

---

## 4. 认证与用户管理（管理员）

| 接口 | 方法 | 权限 | 说明 |
| --- | --- | --- | --- |
| `/api/auth/login` | POST | 公开 | 登录获取 token |
| `/api/auth/register` | POST | 公开（首位自定管理员） | 注册账号；系统已有用户后仅管理员可创建 |
| `/api/auth/me` | GET | 登录 | 当前用户信息 |
| `/api/auth/password` | POST | 登录 | 修改密码（body：`oldPassword`、`newPassword`） |
| `/api/users` | GET | 管理员 | 用户列表 |
| `/api/users/:id` | PATCH | 管理员 | 修改角色/名称/启用状态（不能操作自己） |
| `/api/users/:id` | DELETE | 管理员 | 删除用户（不能删除自己） |

---

## 5. 健康检查

### `GET /api/health`
```json
{ "ok": true, "time": 1700000000000 }
```

---

## 6. 数据模型（关键字段）

- **Issue**：`appId`、`fingerprint`、`title`、`culprit`（定位首帧）、`stack`、`level`、`eventCount`、`userCount`、`status`、`aiDiagnosis`（AI 诊断缓存）
- **Event**：`kind`(error|performance|behavior)、`appId`、`ts`、`payload`（完整事件 JSON，含面包屑/堆栈/HTTP 上下文）
- **SourceMap**：`appId`、`release`、`fileName`、`content`
- **AlertRule**：`appId`、`type`、`threshold`、`webhook`
- **User**：`username`、`passwordHash`、`name`、`role`(admin|member)、`enabled`
