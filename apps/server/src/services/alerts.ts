import { prisma } from '../db'

/**
 * 告警引擎（轻量版）。
 * 支持三类规则：新 issue 出现、错误量突增、性能指标劣化。
 * 推送到企业微信 / 钉钉 / 飞书机器人 Webhook，中文场景开箱可用。
 */

interface AlertPayload {
  title: string
  content: string
}

async function push(webhook: string, payload: AlertPayload): Promise<void> {
  // 企业微信机器人格式，钉钉/飞书格式相近，可后续按 webhook 域名适配
  const body = {
    msgtype: 'markdown',
    markdown: { content: `### ${payload.title}\n${payload.content}` },
  }
  try {
    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (err) {
    console.error('[vigil] 告警推送失败', err)
  }
}

/** 出现新 issue 时触发 */
export async function notifyNewIssue(appId: string, issueId: string, title: string, level: string, stack?: string): Promise<void> {
  const rules = await prisma.alertRule.findMany({ where: { appId, type: 'new_issue', enabled: true } })
  if (rules.length === 0) return

  const project = await prisma.project.findUnique({ where: { appId } })
  const content = [
    `**项目**：${project?.name ?? appId}（${appId}）`,
    `**等级**：${level}`,
    `**内容**：${title}`,
    stack ? `**堆栈首帧**：\n\`\`\`\n${stack.split('\n').slice(0, 4).join('\n')}\n\`\`\`` : '',
    `[查看详情](${process.env.DASHBOARD_BASE_URL ?? 'http://localhost:5173'}/issues/${issueId})`,
  ]
    .filter(Boolean)
    .join('\n')

  for (const rule of rules) {
    await push(rule.webhook, { title: '🚨 Vigil 发现新异常', content })
  }
}

/** 错误量突增：当前窗口错误数超过历史均值 * threshold */
export async function checkErrorSpike(appId: string): Promise<void> {
  const rules = await prisma.alertRule.findMany({ where: { appId, type: 'error_spike', enabled: true } })
  if (rules.length === 0) return

  const now = Date.now()
  const hour = 60 * 60 * 1000
  const [current, baseline] = await Promise.all([
    prisma.event.count({ where: { appId, kind: 'error', ts: { gte: new Date(now - hour) } } }),
    prisma.event.count({
      where: { appId, kind: 'error', ts: { gte: new Date(now - hour * 25), lt: new Date(now - hour) } },
    }),
  ])

  const avg = baseline / 24
  for (const rule of rules) {
    if (avg > 0 && current > avg * rule.threshold) {
      await push(rule.webhook, {
        title: '📈 Vigil 错误量突增',
        content: `项目 \`${appId}\` 最近 1 小时错误 ${current} 条，超过过去 24 小时均值（${avg.toFixed(1)} 条/小时）的 ${rule.threshold} 倍。`,
      })
    }
  }
}

/**
 * 性能劣化告警：核心 Web Vitals（LCP / INP / CLS）的近期 P75 超过
 * 7 天前基线 P75 的 `threshold` 倍时，推送告警。
 * `threshold` 为整数倍（默认 2 倍），与 AlertRule 的 Int 字段保持一致。
 */
export async function checkPerfDegrade(appId: string): Promise<void> {
  const rules = await prisma.alertRule.findMany({ where: { appId, type: 'perf_degrade', enabled: true } })
  if (rules.length === 0) return

  const metrics = ['LCP', 'INP', 'CLS']
  const day = 24 * 60 * 60 * 1000
  const now = Date.now()

  // 并发查三类指标：最近 1 天 vs 7 天前同一天（基线）
  const [recent, baseline] = await Promise.all([
    Promise.all(metrics.map((m) => fetchP75(appId, m, now - day, now))),
    Promise.all(metrics.map((m) => fetchP75(appId, m, now - 8 * day, now - 7 * day))),
  ])

  for (let i = 0; i < metrics.length; i++) {
    const metric = metrics[i]
    const r = recent[i]
    const b = baseline[i]
    if (r === null || b === null || b <= 0) continue
    const ratio = r / b
    for (const rule of rules) {
      if (ratio > rule.threshold) {
        await push(rule.webhook, {
          title: '🐢 Vigil 性能劣化',
          content:
            `项目 \`${appId}\` 的 **${metric}** 近期 P75 为 ${r.toFixed(0)} ms，` +
            `是 7 天前基线（${b.toFixed(0)} ms）的 **${ratio.toFixed(1)} 倍**（阈值 ${rule.threshold} 倍）。`,
        })
      }
    }
  }
}

/** 取某指标在时间段内的 P75（近似：取样本升序第 75 分位） */
async function fetchP75(appId: string, metric: string, from: number, to: number): Promise<number | null> {
  const rows = await prisma.event.findMany({
    where: { appId, kind: 'performance', perfName: metric, ts: { gte: new Date(from), lt: new Date(to) } },
    select: { perfValue: true },
    take: 5000,
  })
  const vals = rows
    .map((r) => r.perfValue)
    .filter((v): v is number => typeof v === 'number')
    .sort((a, b) => a - b)
  if (vals.length === 0) return null
  const idx = Math.min(Math.floor(vals.length * 0.75), vals.length - 1)
  return vals[idx]
}
