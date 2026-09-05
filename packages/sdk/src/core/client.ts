import type {
  BehaviorEvent,
  Breadcrumb,
  DeviceInfo,
  ErrorEvent,
  ErrorKind,
  HttpContext,
  Level,
  PerformanceEvent,
  ResourceContext,
  VigilEvent,
  VigilOptions,
} from '../types'
import { getDeviceInfo, getSessionId, mask, sampled, uuid } from '../utils'
import { BreadcrumbStore } from './breadcrumb'
import { Transport } from './transport'
import { makeFingerprint } from './fingerprint'

type ResolvedOptions = Required<
  Pick<
    VigilOptions,
    | 'appId'
    | 'endpoint'
    | 'release'
    | 'environment'
    | 'sampleRate'
    | 'maxBreadcrumbs'
    | 'batchSize'
    | 'flushInterval'
    | 'enableError'
    | 'enablePerformance'
    | 'enableBehavior'
    | 'enableWhiteScreen'
    | 'enableBreadcrumb'
    | 'slowRequestThreshold'
    | 'sensitiveKeys'
    | 'debug'
  >
>

export class VigilClient {
  readonly options: ResolvedOptions
  readonly breadcrumbs: BreadcrumbStore
  private transport: Transport
  private device: DeviceInfo
  private sessionId: string
  private userId?: string
  private beforeSend?: (e: VigilEvent) => VigilEvent | null

  constructor(options: VigilOptions) {
    this.options = {
      appId: options.appId,
      endpoint: options.endpoint,
      release: options.release ?? 'unknown',
      environment: options.environment ?? 'production',
      sampleRate: options.sampleRate ?? 1,
      maxBreadcrumbs: options.maxBreadcrumbs ?? 20,
      batchSize: options.batchSize ?? 10,
      flushInterval: options.flushInterval ?? 5000,
      enableError: options.enableError ?? true,
      enablePerformance: options.enablePerformance ?? true,
      enableBehavior: options.enableBehavior ?? true,
      enableWhiteScreen: options.enableWhiteScreen ?? true,
      enableBreadcrumb: options.enableBreadcrumb ?? true,
      slowRequestThreshold: options.slowRequestThreshold ?? 3000,
      sensitiveKeys: options.sensitiveKeys ?? [],
      debug: options.debug ?? false,
    }
    this.beforeSend = options.beforeSend
    this.breadcrumbs = new BreadcrumbStore(this.options.maxBreadcrumbs)
    this.transport = new Transport({
      endpoint: this.options.endpoint,
      batchSize: this.options.batchSize,
      flushInterval: this.options.flushInterval,
      debug: this.options.debug,
    })
    this.device = getDeviceInfo()
    this.sessionId = getSessionId()
  }

  /** 手动关联用户，缺省时使用匿名 sessionId */
  setUser(userId: string): void {
    this.userId = userId
  }

  addBreadcrumb(crumb: Breadcrumb): void {
    if (!this.options.enableBreadcrumb) return
    this.breadcrumbs.push(crumb)
  }

  /** 主动上报异常，用于 try/catch 与框架错误边界 */
  captureException(err: unknown, extra?: Record<string, unknown>): void {
    let message = 'Unknown error'
    let stack: string | undefined
    if (err instanceof Error) {
      message = `${err.name}: ${err.message}`
      stack = err.stack
    } else if (typeof err === 'string') {
      message = err
    } else {
      message = safeStringify(err)
    }
    this.captureError({
      errorKind: 'custom',
      level: 'error',
      message,
      stack,
      extra,
    })
  }

  /** 主动上报自定义消息 */
  captureMessage(message: string, level: Level = 'info', extra?: Record<string, unknown>): void {
    this.captureError({ errorKind: 'custom', level, message, extra })
  }

  captureError(input: {
    errorKind: ErrorKind
    level: Level
    message: string
    stack?: string
    http?: HttpContext
    resource?: ResourceContext
    extra?: Record<string, unknown>
  }): void {
    const event: ErrorEvent = {
      ...this.baseEvent(),
      kind: 'error',
      errorKind: input.errorKind,
      level: input.level,
      message: input.message,
      stack: input.stack,
      fingerprint: makeFingerprint(input.errorKind, input.message, input.stack),
      http: input.http,
      resource: input.resource,
      extra: input.extra,
    }
    this.send(event)
  }

  capturePerformance(input: {
    name: string
    value: number
    rating: PerformanceEvent['rating']
    pageUrl?: string
    extra?: Record<string, unknown>
  }): void {
    const event: PerformanceEvent = {
      ...this.baseEvent(),
      kind: 'performance',
      name: input.name,
      value: input.value,
      rating: input.rating,
      pageUrl: input.pageUrl ?? location.href,
      extra: input.extra,
    }
    this.send(event)
  }

  captureBehavior(input: { name: BehaviorEvent['name']; duration?: number; extra?: Record<string, unknown> }): void {
    const event: BehaviorEvent = {
      ...this.baseEvent(),
      kind: 'behavior',
      name: input.name,
      duration: input.duration,
      extra: input.extra,
    }
    this.send(event)
  }

  /** 所有事件的统一出口：采样 → 脱敏 → 钩子 → 入队 */
  private send(event: VigilEvent): void {
    if (!sampled(this.options.sampleRate)) return
    const hooked = this.beforeSend ? this.beforeSend(event) : event
    if (!hooked) return
    const safeEvent = mask(hooked, this.options.sensitiveKeys) as VigilEvent
    if (this.options.debug) console.log('[vigil] capture', safeEvent)
    this.transport.enqueue(safeEvent)
  }

  flush(): void {
    this.transport.flush()
  }

  private baseEvent() {
    return {
      eventId: uuid(),
      ts: Date.now(),
      appId: this.options.appId,
      release: this.options.release,
      environment: this.options.environment,
      sessionId: this.sessionId,
      userId: this.userId,
      url: location.href,
      title: document.title,
      device: this.device,
      breadcrumbs: this.breadcrumbs.drain(),
    }
  }
}

function safeStringify(val: unknown): string {
  try {
    return JSON.stringify(val) ?? String(val)
  } catch {
    return String(val)
  }
}
