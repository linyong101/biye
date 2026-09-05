/** 上报事件的三大类：异常 / 性能 / 行为 */
export type EventKind = 'error' | 'performance' | 'behavior'

export type ErrorKind =
  | 'js'
  | 'promise'
  | 'resource'
  | 'http'
  | 'whiteScreen'
  | 'custom'

export type Level = 'fatal' | 'error' | 'warning' | 'info'

export interface Breadcrumb {
  /** 面包屑类型 */
  type: 'click' | 'navigation' | 'http' | 'error' | 'custom' | 'console'
  /** 简短描述 */
  message: string
  ts: number
  data?: Record<string, unknown>
  level?: Level
}

export interface DeviceInfo {
  ua: string
  browser: string
  browserVersion: string
  os: string
  device: string
  language: string
  screen: string
  viewport: string
  dpr: number
}

export interface HttpContext {
  url: string
  method: string
  status: number
  duration: number
  requestBody?: string
  responseText?: string
  /** 是否为慢请求 / 失败请求 */
  slow?: boolean
}

export interface ResourceContext {
  tagName: string
  src: string
}

export interface BaseEvent {
  eventId: string
  ts: number
  appId: string
  release: string
  environment: string
  sessionId: string
  userId?: string
  url: string
  title: string
  device: DeviceInfo
  breadcrumbs: Breadcrumb[]
}

export interface ErrorEvent extends BaseEvent {
  kind: 'error'
  errorKind: ErrorKind
  level: Level
  message: string
  stack?: string
  /** 错误指纹：相同根因的错误聚合为同一条 issue */
  fingerprint: string
  http?: HttpContext
  resource?: ResourceContext
  extra?: Record<string, unknown>
}

export interface PerformanceEvent extends BaseEvent {
  kind: 'performance'
  /** 指标名，如 LCP / INP / CLS / FCP / TTFB */
  name: string
  value: number
  rating: 'good' | 'needs-improvement' | 'poor'
  pageUrl: string
  extra?: Record<string, unknown>
}

export interface BehaviorEvent extends BaseEvent {
  kind: 'behavior'
  name: 'pv' | 'click' | 'stay' | 'replay'
  /** 停留时长（ms），仅 stay 事件有 */
  duration?: number
  extra?: Record<string, unknown>
}

export type VigilEvent = ErrorEvent | PerformanceEvent | BehaviorEvent

/** 会话回放：单个 DOM 节点的精简快照（坐标为相对视口的百分比） */
export interface ReplayNode {
  tag: string
  text?: string
  cls?: string
  id?: string
  rect: { x: number; y: number; w: number; h: number }
  value?: string
}

/** 会话回放：一帧（页面在某时刻的状态 + 触发原因） */
export interface ReplayFrame {
  /** 触发类型：snapshot | click | input | scroll | route */
  type: string
  url: string
  /** 相对录制开始的毫秒数 */
  t: number
  nodes: ReplayNode[]
}

export interface VigilOptions {
  /** 项目标识，服务端据此隔离数据 */
  appId: string
  /** 上报地址，如 https://vigil.example.com/api/report */
  endpoint: string
  /** 应用版本号，用于按版本定位回归 */
  release?: string
  environment?: string
  /** 采样率 0~1，默认 1 */
  sampleRate?: number
  /** 面包屑保留条数，默认 20 */
  maxBreadcrumbs?: number
  /** 批量上报条数阈值，默认 10 */
  batchSize?: number
  /** 定时上报间隔（ms），默认 5000 */
  flushInterval?: number
  enableError?: boolean
  enablePerformance?: boolean
  enableBehavior?: boolean
  enableWhiteScreen?: boolean
  enableBreadcrumb?: boolean
  /** 会话回放：轻量录制用户操作与界面快照，默认开启 */
  enableReplay?: boolean
  /** 回放快照采集间隔（ms），默认 3000 */
  replayIntervalMs?: number
  /** 慢请求阈值（ms），默认 3000 */
  slowRequestThreshold?: number
  /** 需要脱敏的字段名（不区分大小写，命中即 ***） */
  sensitiveKeys?: string[]
  /** 上报前最后一道钩子，返回 null 丢弃该事件 */
  beforeSend?: (event: VigilEvent) => VigilEvent | null
  debug?: boolean
}
