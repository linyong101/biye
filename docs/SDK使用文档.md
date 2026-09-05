# Vigil Web SDK 使用文档

Vigil Web SDK（`@vigil/web-sdk`）是一行接入的前端稳定性监控采集器，自动捕获
JS 运行时错误、资源加载失败、HTTP 异常、白屏、Web Vitals 性能与用户行为，
并支持 Source Map 还原与 AI 根因诊断。

---

## 1. 安装

```bash
npm i @vigil/web-sdk
# 或
pnpm add @vigil/web-sdk
```

也可直接通过打包产物（ESM / UMD）以 `<script>` 方式引入，浏览器全局暴露 `Vigil`。

---

## 2. 一行接入

```ts
import { init } from '@vigil/web-sdk'

init({
  appId: 'demo-shop',                        // 与服务端「项目标识」一致
  endpoint: 'https://your-host/api/report',  // 采集服务上报地址
  release: '1.0.0',                          // 应用版本号，用于按版本定位回归
  environment: 'production',
})
```

初始化后 SDK 会自动开启以下能力：

| 能力 | 说明 |
| --- | --- |
| JS 错误 / 未捕获 Promise | `window.onerror`、`unhandledrejection` |
| 资源加载失败 | `<img>` / `<script>` / `<link>` 加载错误 |
| HTTP 请求异常 | `fetch` / `XMLHttpRequest` 失败或慢请求，同时作为面包屑来源 |
| 白屏检测 | 通过 DOM 节点采样判断页面是否白屏 |
| 性能（Web Vitals） | LCP / FCP / INP / CLS / TTFB / DCL |
| 用户行为 | PV、点击、页面停留时长 |
| 面包屑 | 点击 / 路由 / HTTP / 控制台 / 自定义，随错误上报还原现场 |

---

## 3. 配置项 `VigilOptions`

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `appId` | `string` | **必填** | 项目标识，服务端据此隔离数据 |
| `endpoint` | `string` | **必填** | 上报地址，如 `https://vigil.example.com/api/report` |
| `release` | `string` | — | 应用版本号，Source Map 还原与版本回归定位 |
| `environment` | `string` | — | 环境标识，如 `production` / `staging` |
| `sampleRate` | `number` | `1` | 采样率 `0~1`，`0.1` 表示只上报 10% 流量 |
| `maxBreadcrumbs` | `number` | `20` | 面包屑保留条数 |
| `batchSize` | `number` | `10` | 批量上报条数阈值 |
| `flushInterval` | `number` | `5000` | 定时上报间隔（ms） |
| `enableError` | `boolean` | `true` | 是否采集 JS 错误 |
| `enablePerformance` | `boolean` | `true` | 是否采集 Web Vitals |
| `enableBehavior` | `boolean` | `true` | 是否采集用户行为（PV/点击/停留） |
| `enableWhiteScreen` | `boolean` | `true` | 是否开启白屏检测 |
| `enableBreadcrumb` | `boolean` | `true` | 是否采集面包屑 |
| `slowRequestThreshold` | `number` | `3000` | 慢请求阈值（ms） |
| `sensitiveKeys` | `string[]` | `[]` | 需脱敏的字段名（不区分大小写，命中值替换为 `***`） |
| `beforeSend` | `(event) => event \| null` | — | 上报前最后一道钩子，返回 `null` 丢弃该事件 |
| `debug` | `boolean` | `false` | 调试模式，打印内部日志 |

---

## 4. 主动上报 API

```ts
import {
  init,
  captureException,
  captureMessage,
  setUser,
  addBreadcrumb,
  flush,
  getInstance,
} from '@vigil/web-sdk'
```

| 方法 | 说明 |
| --- | --- |
| `init(options)` | 初始化并返回 `VigilClient` 实例（幂等，重复调用返回同一实例） |
| `captureException(err, extra?)` | 手动上报异常，适用于 `try/catch` 与框架错误边界 |
| `captureMessage(message, level?, extra?)` | 主动上报一条消息，`level` 默认 `info` |
| `setUser(userId)` | 设置当前用户，用于统计「影响用户数」 |
| `addBreadcrumb(message, data?)` | 追加一条自定义面包屑 |
| `flush()` | 立即上报队列（如关键流程结束前） |
| `getInstance()` | 获取已初始化实例，未初始化返回 `null` |

示例：

```ts
setUser('u_12345')

try {
  riskyCheckout()
} catch (e) {
  captureException(e, { feature: 'checkout' })
}

// React 错误边界
componentDidCatch(error: Error) {
  captureException(error)
}
```

---

## 5. 高级用法

### 5.1 采样降低流量成本

```ts
init({ appId, endpoint, sampleRate: 0.1 }) // 仅上报 10% 的事件
```

### 5.2 敏感信息脱敏

```ts
init({ appId, endpoint, sensitiveKeys: ['password', 'token', 'authorization'] })
```

命中的字段在序列化前会被替换为 `***`，避免把用户隐私上报到服务端。

### 5.3 自定义过滤 `beforeSend`

```ts
init({
  appId,
  endpoint,
  beforeSend(event) {
    if (event.url?.includes('/health')) return null // 丢弃健康检查页错误
    return event
  },
})
```

---

## 6. Source Map 上传

生产构建（webpack / vite / esbuild 等）开启 `sourcemap` 后，把生成的 `.map`
文件上传到采集服务，线上压缩堆栈即可被还原到源码行号：

```bash
curl -X POST https://your-host/api/sourcemap \
  -H "Authorization: Bearer <token>" \
  -F "appId=demo-shop" \
  -F "release=1.0.0" \
  -F "fileName=assets/index.js" \
  -F "content=@dist/assets/index.js.map"
```

上传后，错误详情页的堆栈会直接显示 `src/views/Order.tsx:42:13` 这样的源码位置。

---

## 7. 事件数据结构（简述）

- **ErrorEvent**：`errorKind`(js/promise/resource/http/whiteScreen/custom)、`level`、`message`、`stack`、`fingerprint`、HTTP/资源上下文
- **PerformanceEvent**：`name`(LCP/FCP/INP/CLS/TTFB)、`value`、`rating`(good/needs-improvement/poor)
- **BehaviorEvent**：`name`(pv/click/stay)、`duration`(停留时长)

`fingerprint` 相同的错误会被服务端聚合为同一条 Issue，避免看板被刷屏。
