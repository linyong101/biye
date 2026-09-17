import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import type { FastifyRequest } from 'fastify'
import { prisma } from '../db'

/**
 * 鉴权服务：JWT 签发/校验 + 密码加盐哈希。
 *
 * 全部基于 Node 内置 crypto 实现，不引入第三方依赖：
 * - 密码：scrypt 加盐哈希 + timingSafeEqual 常量时间比较（防时序攻击）
 * - 令牌：HS256 签名的 JWT，支持过期校验
 */

export interface JwtPayload {
  sub: string
  username: string
  name: string
  role: 'admin' | 'member'
}

const SECRET = process.env.JWT_SECRET ?? 'vigil-dev-secret-change-me'
const DEFAULT_EXPIRES = process.env.JWT_EXPIRES_IN ?? '7d'

function parseDuration(input: string): number {
  const m = input.match(/^(\d+)([smhd])$/)
  if (!m) return 7 * 24 * 3600
  const value = Number(m[1])
  const unit = { s: 1, m: 60, h: 3600, d: 86400 }[m[2]] as number
  return value * unit
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url')
}

export function signJwt(payload: JwtPayload): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const iat = Math.floor(Date.now() / 1000)
  const body = base64url(JSON.stringify({ ...payload, iat, exp: iat + parseDuration(DEFAULT_EXPIRES) }))
  const signature = createHmac('sha256', SECRET).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${signature}`
}

export function verifyJwt(token: string): JwtPayload | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [header, body, signature] = parts

  const expected = createHmac('sha256', SECRET).update(`${header}.${body}`).digest('base64url')
  if (signature.length !== expected.length) return null
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as JwtPayload & { exp?: number }
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null
    return { sub: payload.sub, username: payload.username, name: payload.name, role: payload.role }
  } catch {
    return null
  }
}

/** scrypt 加盐哈希，格式：salt:hash */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const derived = scryptSync(password, salt, 64)
  const target = Buffer.from(hash, 'hex')
  if (derived.length !== target.length) return false
  return timingSafeEqual(derived, target)
}

/** 从请求头解析当前登录用户 */
export function getUserFromRequest(request: FastifyRequest): JwtPayload | null {
  const raw = request.headers.authorization
  if (!raw?.startsWith('Bearer ')) return null
  return verifyJwt(raw.slice(7))
}

/** 创建用户时返回给前端的安全字段（不含密码哈希） */
export function toSafeUser(user: {
  id: string
  username: string
  name: string
  role: string
  enabled: boolean
  createdAt: Date
  lastLoginAt: Date | null
}) {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    enabled: user.enabled,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  }
}

/** 默认管理员的固定 id：保证「删库重置」后 id 不变化，避免浏览器旧 token 失效 */
export const DEFAULT_ADMIN_ID = 'admin-default'

/**
 * 初始化默认管理员账号（首次启动时调用）。
 *
 * 关键：id 固定为 DEFAULT_ADMIN_ID，使「删库重建」后 admin 的 id 保持不变，
 * 从而避免登录态（JWT 的 sub 即用户 id）因重置而失效，根治「重置后登录过期」。
 */
export async function ensureDefaultAdmin(): Promise<void> {
  const existing = await prisma.user.findUnique({ where: { username: 'admin' } })

  if (!existing) {
    await prisma.user.create({
      data: {
        id: DEFAULT_ADMIN_ID,
        username: 'admin',
        passwordHash: hashPassword('admin123'),
        name: '系统管理员',
        role: 'admin',
      },
    })
    console.log('[vigil] 已创建默认管理员账号：admin / admin123（请登录后尽快修改密码）')
    return
  }

  // 已存在但 id 为历史随机值 → 统一为固定 id（保留用户名/密码/角色），彻底规避旧 token 失效
  if (existing.id !== DEFAULT_ADMIN_ID) {
    await prisma.user.update({ where: { username: 'admin' }, data: { id: DEFAULT_ADMIN_ID } })
    console.log('[vigil] 已将默认管理员账号 id 固定为 admin-default（根治重置后登录过期）')
  }
}

export function assertRole(request: FastifyRequest, role: 'admin'): JwtPayload | null {
  const user = getUserFromRequest(request)
  if (!user) return null
  if (role === 'admin' && user.role !== 'admin') return null
  return user
}
