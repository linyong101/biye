import { prisma } from '../db'

/**
 * AI 根因诊断服务。
 *
 * 双模式设计：
 * 1. 配置了 AI_API_KEY → 调用大模型（兼容 OpenAI 接口规范的任意厂商：
 *    DeepSeek / 通义千问 / 智谱 / Kimi / OpenAI / 本地 Ollama）
 * 2. 未配置或调用失败 → 使用内置规则库给出诊断
 *
 * 这样即使没有 Key，演示与答辩也能正常展示完整功能。
 */

export interface Diagnosis {
  /** 根因判断 */
  cause: string
  /** 修复建议 */
  suggestion: string
  /** 影响面评估 */
  impact: string
  /** 置信度 */
  confidence: 'high' | 'medium' | 'low'
  /** 诊断来源：llm = 大模型，rule = 规则库兜底 */
  source: 'llm' | 'rule'
  model?: string
  diagnosedAt: string
}

const SYSTEM_PROMPT = `你是一名资深前端工程师，专注于线上事故的排查与定位。
请根据提供的错误信息、堆栈和用户行为轨迹，给出根因分析与修复建议。

要求：
1. 用中文回答，专业、简洁、可执行，不要讲空话
2. 必须严格输出如下 JSON，不要输出任何额外文字或标记
3. suggestion 中若涉及代码，使用 markdown 代码块

{
  "cause": "根因判断，2-3 句话，说明为什么会报这个错",
  "suggestion": "具体可执行的修复步骤，包含代码示例",
  "impact": "影响面评估，说明哪些用户/流程会受影响",
  "confidence": "high 或 medium 或 low"
}`

function isConfigured(): boolean {
  return Boolean(process.env.AI_API_KEY)
}

/** 组装喂给模型的上下文（同时控制长度，避免超出 token 限制） */
function buildContext(issue: {
  title: string
  errorKind: string
  level: string
  culprit?: string | null
  stack?: string | null
  eventCount: number
  userCount: number
}, events: Array<{ payload: string; url?: string | null; browser?: string | null; os?: string | null }>): string {
  const first = events[0]
  let breadcrumbs: Array<{ type?: string; message?: string }> = []
  let device = {}
  if (first) {
    try {
      const payload = JSON.parse(first.payload) as {
        breadcrumbs?: Array<{ type?: string; message?: string }>
        device?: Record<string, unknown>
      }
      breadcrumbs = payload.breadcrumbs ?? []
      device = payload.device ?? {}
    } catch {
      /* payload 解析失败则忽略 */
    }
  }

  const crumbText = breadcrumbs
    .slice(-8)
    .map((c, i) => `${i + 1}. [${c.type ?? 'unknown'}] ${c.message ?? ''}`)
    .join('\n')

  return [
    `## 错误信息`,
    `- 类型：${issue.errorKind}`,
    `- 等级：${issue.level}`,
    `- 内容：${issue.title}`,
    `- 发生次数：${issue.eventCount}`,
    `- 影响用户数：${issue.userCount}`,
    '',
    `## 堆栈（已还原）`,
    '```',
    (issue.stack ?? '无').slice(0, 2000),
    '```',
    '',
    `## 定位信息`,
    issue.culprit ?? '无',
    '',
    `## 环境信息`,
    first ? `URL: ${first.url ?? '未知'}\n浏览器: ${first.browser ?? '未知'} / ${first.os ?? '未知'}` : '无',
    Object.keys(device).length ? JSON.stringify(device) : '',
    '',
    `## 报错前的用户行为轨迹`,
    crumbText || '无',
  ].join('\n')
}

async function callLLM(context: string): Promise<Diagnosis> {
  const base = process.env.AI_BASE_URL ?? 'https://api.deepseek.com/v1'
  const model = process.env.AI_MODEL ?? 'deepseek-chat'

  const res = await fetch(`${base.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.AI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: context },
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  })

  if (!res.ok) throw new Error(`AI 接口返回 ${res.status}: ${await res.text()}`)

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
    model?: string
  }
  const content = json.choices?.[0]?.message?.content ?? ''
  return { ...parseDiagnosis(content), source: 'llm', model: json.model ?? model }
}

/** 模型有时会带 ```json 代码块，需要做健壮解析 */
function parseDiagnosis(content: string): Omit<Diagnosis, 'source'> {
  const cleaned = content
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim()

  try {
    const parsed = JSON.parse(cleaned) as Record<string, string>
    return {
      cause: parsed.cause ?? '未能确定根因',
      suggestion: parsed.suggestion ?? '建议结合堆栈进一步排查',
      impact: parsed.impact ?? '影响面未知',
      confidence: (['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'medium') as Diagnosis['confidence'],
      diagnosedAt: new Date().toISOString(),
    }
  } catch {
    // 模型没按 JSON 输出时，把原文作为根因描述返回，避免信息丢失
    return {
      cause: cleaned.slice(0, 1000),
      suggestion: '（模型未按结构化格式返回，以上为原始输出）',
      impact: '影响面未知',
      confidence: 'low',
      diagnosedAt: new Date().toISOString(),
    }
  }
}

/** 规则库兜底：不依赖外部服务，保证功能始终可用 */
function ruleDiagnose(
  issue: { title: string; errorKind: string; culprit?: string | null; stack?: string | null; eventCount: number; userCount: number },
): Diagnosis {
  const { title, errorKind, culprit, stack } = issue

  // 从堆栈提取源码位置，让结论更有指向性
  const locMatch = stack?.match(/([\w./@-]+\.(?:tsx|ts|jsx|js|vue)):(\d+):(\d+)/)
  const loc = locMatch ? `${locMatch[1]} 第 ${locMatch[2]} 行` : (culprit ?? '未知位置')

  let cause = ''
  let suggestion = ''

  if (/Cannot read propert(y|ies)/i.test(title)) {
    cause = `代码访问了 undefined 或 null 值的属性，最典型的场景是异步数据尚未返回时就进行了渲染。出错位置：${loc}。`
    suggestion = [
      '1. 使用可选链避免直接取属性：',
      '```ts',
      '// 修改前',
      'const price = product.price.toFixed(2)',
      '// 修改后',
      'const price = product?.price?.toFixed(2) ?? "0.00"',
      '```',
      '2. 渲染前增加数据加载态判断：`if (!data) return <Skeleton />`',
      '3. 为接口返回设置兜底默认值，避免下游拿到 undefined',
    ].join('\n')
  } else if (errorKind === 'promise') {
    cause = `存在未被 catch 的 Promise 异常，通常是异步请求失败或超时后没有错误处理分支。出错位置：${loc}。`
    suggestion = [
      '1. 为所有异步调用补充 catch：',
      '```ts',
      'try {',
      '  await fetchOrder()',
      '} catch (err) {',
      '  captureException(err)   // 上报',
      '  showErrorToast("加载失败，请重试")',
      '}',
      '```',
      '2. 在请求层统一处理超时与重试，避免每个调用点各写一遍',
      '3. 添加全局兜底：window.addEventListener("unhandledrejection")',
    ].join('\n')
  } else if (errorKind === 'http') {
    const status = Number(title.match(/->\s*(\d{3})/)?.[1] ?? 0)
    if (status >= 500) {
      cause = `服务端接口返回 ${status}，属于服务端异常，前端需要做好容错与降级。`
      suggestion = [
        '1. 前端增加失败重试与降级展示，避免整页崩溃',
        '2. 在请求拦截器中统一处理 5xx，给用户明确提示',
        '3. 推动后端排查该接口，查看服务端日志定位具体异常',
      ].join('\n')
    } else if (status >= 400) {
      cause = `接口返回 ${status}，多为请求参数错误、鉴权失效或资源不存在。`
      suggestion = [
        '1. 检查该接口的请求参数与鉴权 token 是否有效',
        '2. 对 401 做统一跳登录处理，对 403 提示无权限',
        '3. 在请求层打印 requestBody，便于复现',
      ].join('\n')
    } else {
      cause = `接口响应耗时超过慢请求阈值，属于性能问题而非功能性错误。`
      suggestion = [
        '1. 排查接口是否存在慢查询或缺少索引',
        '2. 增加接口缓存或分页，减少单次返回数据量',
        '3. 前端增加 loading 态与请求超时中断（AbortController）',
      ].join('\n')
    }
  } else if (errorKind === 'resource') {
    cause = `静态资源加载失败，可能是 CDN 异常、文件已被删除或路径拼写错误。`
    suggestion = [
      '1. 确认资源地址是否可访问，检查 CDN 配置与缓存刷新',
      '2. 为图片/脚本添加 onerror 兜底，避免影响主流程',
      '3. 构建产物使用 contenthash，发布后清理旧资源引用',
    ].join('\n')
  } else if (errorKind === 'whiteScreen') {
    cause = `页面出现白屏，通常是首屏渲染前 JS 执行中断，或路由组件加载失败导致渲染未挂载。`
    suggestion = [
      '1. 检查白屏前的 JS 异常，通常与首屏数据接口或路由懒加载失败有关',
      '2. 为路由组件添加 ErrorBoundary 与 Suspense 降级 UI',
      '3. 首屏关键数据做本地缓存兜底，接口失败时也能渲染骨架内容',
    ].join('\n')
  } else {
    cause = `捕获到 ${errorKind} 类型的异常，发生位置：${loc}。`
    suggestion = '建议结合堆栈与用户行为轨迹定位具体代码，补充异常捕获与兜底逻辑。'
  }

  return {
    cause,
    suggestion,
    impact: `该问题已发生 ${issue.eventCount} 次，影响 ${issue.userCount} 名用户${issue.eventCount > 50 ? '，属于高频问题，建议优先处理' : ''}。`,
    confidence: 'medium',
    source: 'rule',
    diagnosedAt: new Date().toISOString(),
  }
}

/**
 * 对指定 issue 执行诊断。
 * 已诊断过且未更新时直接返回缓存结果，避免重复消耗 token。
 */
export async function diagnoseIssue(issueId: string, force = false): Promise<Diagnosis> {
  const issue = await prisma.issue.findUnique({ where: { id: issueId } })
  if (!issue) throw new Error('issue not found')

  if (!force && issue.aiDiagnosis) {
    return JSON.parse(issue.aiDiagnosis) as Diagnosis
  }

  const events = await prisma.event.findMany({
    where: { issueId },
    orderBy: { ts: 'desc' },
    take: 5,
    select: { payload: true, url: true, browser: true, os: true },
  })

  let result: Diagnosis
  if (isConfigured()) {
    try {
      result = await callLLM(buildContext(issue, events))
    } catch (err) {
      console.error('[vigil] AI 诊断调用失败，回退规则库', err)
      const fallback = ruleDiagnose(issue)
      result = { ...fallback, cause: `${fallback.cause}\n\n> 大模型调用失败，以上为规则库兜底结果。` }
    }
  } else {
    result = ruleDiagnose(issue)
  }

  await prisma.issue.update({
    where: { id: issueId },
    data: { aiDiagnosis: JSON.stringify(result), aiDiagnosedAt: new Date() },
  })

  return result
}

/** 供前端判断当前是否启用了真实大模型 */
export function aiStatus(): { enabled: boolean; model: string; baseUrl: string } {
  return {
    enabled: isConfigured(),
    model: process.env.AI_MODEL ?? 'deepseek-chat',
    baseUrl: process.env.AI_BASE_URL ?? 'https://api.deepseek.com/v1',
  }
}
