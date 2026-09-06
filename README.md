# Vigil · 前端稳定性监控与智能诊断平台

> 一行代码接入，线上白屏 / JS 报错 / 接口异常 / 性能劣化尽在掌握。
> 可完全私有化部署的 Sentry 轻量替代方案。

```ts
import { init } from '@vigil/web-sdk'
init({ appId: 'my-shop', endpoint: 'https://vigil.example.com/api/report' })
```

![License](https://img.shields.io/badge/license-MIT-blue)
![Node](https://img.shields.io/badge/node-%3E%3D18-green)
![TypeScript](https://img.shields.io/badge/lang-TypeScript-3178c6)
![SDK](https://img.shields.io/badge/SDK-%3C%2010KB%20gzip-8b5cf6)
![Docker](https://img.shields.io/badge/deploy-Docker%20Compose-2496ed)
![ECharts](https://img.shields.io/badge/charts-ECharts-5470c6)

## 技术栈

| 层 | 技术 |
| --- | --- |
| 采集端 SDK | TypeScript，零运行时依赖，插件化架构（按需引入） |
| 上报通道 | Fetch / XMLHttpRequest 劫持、`sendBeacon`、失败指数退避重试 + 离线补报 |
| 服务端 | Node.js + Fastify + Prisma（SQLite 零依赖启动 / PostgreSQL 生产） |
| 可视化看板 | React 18 + Vite + ECharts（独立分包）+ TanStack Query |
| 部署 | Docker Compose 一键私有化（PostgreSQL + Redis） |
| AI 诊断 | 兼容 OpenAI 规范的大模型 + 内置规则库兜底，外部不可用时自动降级 |

---

## 一、解决什么问题

| 企业真实痛点 | Vigil 的应对 |
| --- | --- |
| 用户投诉了才知道线上崩了 | 异常秒级上报，企微/钉钉/飞书机器人主动告警 |
| 生产代码被压缩，堆栈看不懂 | Source Map 还原，直接定位到 `src/views/Order.tsx:42` |
| 错误日志成千上万条，没法看 | 错误指纹聚合，万条上报压缩为几十个 issue |
| 页面卡不卡全凭感觉 | Web Vitals（LCP/INP/CLS）P75 分位数量化 |
| 数据出不了公司内网 | Docker Compose 一键私有化部署 |

---

## 二、功能一览

### 采集 SDK（`@vigil/web-sdk`）

| 能力 | 说明 |
| --- | --- |
| JS 运行时异常 | `window.error` 捕获阶段监听 |
| Promise 未处理拒绝 | `unhandledrejection` |
| 资源加载失败 | 图片 / 脚本 / 样式 404 |
| 接口异常 | 劫持 `fetch` 与 `XMLHttpRequest`，记录状态码、耗时、响应体 |
| 慢请求 | 超过阈值（默认 3s）单独上报 |
| 白屏检测 | 视口 9 点命中测试 + 容器节点判定 |
| Web Vitals | LCP / FCP / INP / CLS / TTFB，`PerformanceObserver` 被动订阅 |
| 用户行为面包屑 | 点击 / 路由 / 请求 / console，出错时带上最近 20 步现场 |
| 上报可靠性 | 批量 + 定时双触发，卸载时 `sendBeacon`，失败指数退避重试并落本地补报 |
| 隐私合规 | 默认脱敏 password / token / 身份证等敏感字段，支持自定义扩展 |

### 服务端（`@vigil/server`）

- `POST /api/report` 批量上报，幂等去重，按项目自动建项目
- 错误指纹聚合：自动创建 / 更新 Issue，统计发生次数与影响用户数
- Source Map 上传与堆栈还原（带内存缓存，避免重复解析）
- 告警引擎：新问题、错误量突增、性能劣化，推送到企业微信 / 钉钉 / 飞书 Webhook
- 多维查询：概览指标、趋势、分位数、浏览器/版本/页面分布

### AI 根因诊断

- 结合**还原后的堆栈 + 源码定位 + 用户行为轨迹**，输出根因判断、修复建议（含代码示例）、影响面评估与置信度
- **双模式**：配置 `AI_API_KEY` 走大模型（兼容 DeepSeek / 通义千问 / 智谱 / Kimi / OpenAI / Ollama 等 OpenAI 规范接口）；
  未配置或调用失败时自动回退**内置规则库**，功能不中断
- 诊断结果缓存在 Issue 上，避免重复消耗 token

### 用户与权限

- JWT 鉴权（`node:crypto` 自行实现 HS256，零新增依赖），密码使用 scrypt 加盐哈希 + 常量时间比较
- 首次启动自动创建管理员 `admin / admin123`
- 角色区分：管理员可创建账号、调整角色、启停/删除用户；普通成员仅查看
- 路由守卫 + 接口层全局鉴权，SDK 上报接口与登录接口保持公开

### 分析看板（`@vigil/dashboard`）

- **概览**：核心指标卡 + 异常趋势 + 浏览器分布 + TOP 问题 + Web Vitals
- **问题列表**：状态/类型/关键字筛选，分页
- **问题详情**：还原后堆栈、AI 诊断、影响面统计、单次事件的环境信息与行为轨迹
- **性能**：P50/P75/P95 对比 + 健康度评级
- **会话回放**：按会话聚合的轻量 DOM 快照录屏，时间轴 + 逐帧回放 + 出错前操作路径还原
- **接入与告警**：接入代码片段、Source Map 上传命令、AI 配置、告警规则管理
- **账号**：修改密码、用户管理（管理员）

---

## 三、快速开始

### 环境要求

Node.js >= 18（推荐 20+）、npm >= 9

### 1. 安装依赖

```bash
npm install
```

### 2. 初始化数据库

默认使用 SQLite，零依赖启动：

```bash
npm run db:push
```

### 3. 打包 SDK 并生成演示数据

```bash
npm run build:sdk   # Demo 站点依赖构建产物
npm run seed        # 生成近 7 天演示数据 + 会话回放剧本 + 三类告警规则
```

### 4. 启动服务

```bash
npm run dev         # 采集服务 :3001 + 看板 :5173
npm run demo        # 另开终端：异常制造机 :5174
```

| 地址 | 说明 |
| --- | --- |
| http://localhost:5173 | 分析看板（首次访问会跳转登录页） |
| http://localhost:5174 | Demo 站点（一键制造各类异常） |
| http://localhost:3001/api/health | 采集服务健康检查 |

**默认账号：`admin` / `admin123`**（服务首次启动时自动创建，登录后请尽快修改密码）

在 Demo 站点点几个「触发」按钮，回到看板刷新，即可看到完整链路。
进入问题详情页，点击「开始诊断」可体验 AI 根因分析。

---

## 四、项目结构

```
vigil/
├── packages/
│   └── sdk/                    # @vigil/web-sdk —— 浏览器采集 SDK
│       └── src/
│           ├── core/           # 客户端、上报通道、面包屑、指纹算法
│           ├── plugins/        # 错误 / HTTP / 性能 / 白屏 / 行为
│           └── utils/          # 设备信息、脱敏、采样
├── apps/
│   ├── server/                 # 采集与聚合服务（Fastify + Prisma）
│   │   ├── prisma/schema.prisma
│   │   └── src/
│   │       ├── routes/         # report / overview / issues / projects / sourcemap / ai / auth
│   │       └── services/       # Source Map 还原、告警引擎、AI 诊断、鉴权
│   └── dashboard/              # 分析看板（React 18 + Vite + ECharts）
│       └── src/
│           ├── pages/          # 概览 / 问题 / 详情 / 性能 / 设置 / 登录
│           ├── components/     # 图表封装、指标卡、布局、Markdown 渲染
│           ├── auth.tsx        # 登录状态与权限
│           └── store.tsx       # 项目与时间范围全局状态
├── demo/                       # 异常制造机（零依赖 Node 静态服务）
├── docker-compose.yml          # 私有化部署
└── scripts/report-size.mjs     # 构建后统计 SDK gzip 体积
```

---

## 五、架构与数据流

```
浏览器（@vigil/web-sdk）                 服务端（Fastify）
┌────────────────────────┐             ┌──────────────────────────┐
│ 插件层                  │             │ POST /api/report          │
│  jsError / http / perf  │  批量上报   │  ├ 幂等去重（eventId）     │
│  whiteScreen / behavior │ ──────────▶ │  ├ 指纹聚合 → Issue        │
│ 面包屑（环形缓冲）       │  HTTP       │  ├ Source Map 还原堆栈     │
│ 采样 · 脱敏 · 钩子      │  sendBeacon │  └ 落库 Event              │
└────────────────────────┘             └────────────┬─────────────┘
                                                    │
                                       ┌────────────▼─────────────┐
                                       │ PostgreSQL / SQLite       │
                                       │ Project·Issue·Event·Map   │
                                       └────────────┬─────────────┘
                                                    │
                        ┌───────────────────────────┼──────────────────┐
                        ▼                           ▼                  ▼
                 React 看板                    告警引擎             AI 诊断（已实现）
             概览/问题/性能/设置          企微·钉钉·飞书            根因 + 修复建议
```

---

## 六、核心接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/report` | 批量上报事件（SDK 调用） |
| GET | `/api/overview?appId=&range=` | 概览：指标、趋势、性能分布、TOP 问题 |
| GET | `/api/issues?appId=&status=&level=&keyword=&page=` | 问题列表 |
| GET | `/api/issues/:id` | 问题详情 + 最近事件 + 分布 |
| PATCH | `/api/issues/:id` | 修改状态（resolved / ignored / unresolved） |
| GET / POST | `/api/projects` | 项目列表 / 创建 |
| POST | `/api/sourcemap` | 上传 Source Map |
| POST | `/api/sourcemap/restore` | 在线还原堆栈（调试用） |
| GET / POST / DELETE | `/api/alerts` | 告警规则管理 |
| POST | `/api/ai/diagnose` | AI 根因诊断（`force=true` 忽略缓存） |
| GET | `/api/ai/status` | 当前 AI 配置状态 |
| POST | `/api/auth/login` | 登录，返回 JWT |
| POST | `/api/auth/register` | 注册（无用户时开放，之后需管理员） |
| GET | `/api/auth/me` | 当前登录用户 |
| POST | `/api/auth/password` | 修改密码 |
| GET | `/api/users` | 用户列表（管理员） |
| PATCH / DELETE | `/api/users/:id` | 修改角色启停 / 删除用户（管理员） |

> 除 `/api/health`、`/api/report`、`/api/auth/login`、`/api/auth/register` 外，其余接口均需 `Authorization: Bearer <token>`。

---

## 七、技术亮点

1. **错误指纹聚合**：`错误类型 + 归一化消息 + 堆栈首帧` 哈希，把数字、哈希串、引号内容泛化，
   保证 `id=123` 与 `id=456` 的同类错误合并为一个 issue，同时不误合并不同根因。
2. **上报可靠性三保险**：批量/定时触发减少请求数；`sendBeacon` 保证卸载时不丢；
   失败指数退避重试后仍失败则落 `localStorage`，下次启动补报。
3. **不侵入业务**：`fetch` / `XHR` 只做包裹不改写语义，异常照常向上抛。
4. **白屏检测用命中测试**：比"数 DOM 节点"更准确，能识别"有 DOM 但不可见"的伪正常。
5. **性能采集零轮询**：全部基于 `PerformanceObserver` 被动订阅，对主线程无负担。
6. **批次级写库优化**：一次上报批次内的 Issue 计数最后统一刷新，避免 N 次写库。
7. **零依赖鉴权**：JWT 与密码加盐哈希全部基于 `node:crypto` 自行实现，不引入第三方安全库。
8. **AI 诊断双模式**：大模型与规则库互补，外部服务不可用时功能自动降级而非中断。

---

## 八、开发计划

已完成（W1-W3）：

- [x] SDK 全插件（错误 / 性能 / 行为 / 白屏）
- [x] 上报通道（批量 / Beacon / 重试 / 离线补报）
- [x] 采集服务（接收 / 聚合 / 幂等）
- [x] Source Map 上传与堆栈还原
- [x] 看板五大页面（概览 / 问题 / 详情 / 性能 / 设置）
- [x] 演示数据与异常制造机
- [x] AI 根因诊断（大模型 + 规则库兜底）
- [x] 用户登录与角色权限
- [x] 会话回放 UI（时间轴 + 逐帧 DOM 快照回放）
- [x] 告警引擎三类规则（新问题 / 错误突增 / 性能劣化）

待推进（W4）：

- [ ] 单元测试（Vitest）与 E2E 冒烟
- [ ] `vigil-cli`：Source Map 上传命令行工具
- [x] 告警规则引擎完善（性能劣化告警）已落地
- [ ] 生产切换 PostgreSQL + Redis 限流
- [ ] npm 发布 `@vigil/web-sdk`
- [ ] Docker 部署全流程验证
- [ ] 生产切换 PostgreSQL + Redis 限流
- [ ] npm 发布 `@vigil/web-sdk`
- [ ] Docker 部署全流程验证

---

## 九、常见问题

**Q：演示看板是空的？**
先执行 `npm run seed` 生成演示数据，或打开 Demo 站点触发异常。

**Q：SDK 上报了但看板看不到？**
确认采集服务在 3001 端口运行；看板通过 Vite 代理访问，若直连需设置 `VITE_API_BASE`。

**Q：想接入自己的项目？**
看板「接入与告警」页有代码片段，选 appId 后复制即可。

**Q：生产环境怎么部署？**
`docker compose up -d`。注意把 `prisma/schema.prisma` 的 provider 改为 `postgresql` 并执行 `npx prisma db push`。

---

## 十、License

MIT
