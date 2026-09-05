import type { FastifyInstance } from 'fastify'
import { prisma } from '../db'
import {
  getUserFromRequest,
  hashPassword,
  signJwt,
  toSafeUser,
  verifyPassword,
} from '../services/auth'

/**
 * 认证与用户管理。
 *
 * 权限规则：
 * - 系统中没有任何用户时，允许开放注册，第一位注册者自动成为管理员
 * - 此后注册、查看用户列表、修改角色、删除用户均需要管理员令牌
 */
export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/auth/login', async (request, reply) => {
    const { username, password } = request.body as { username?: string; password?: string }
    if (!username || !password) {
      return reply.code(400).send({ ok: false, message: '用户名和密码不能为空' })
    }

    const user = await prisma.user.findUnique({ where: { username } })
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return reply.code(401).send({ ok: false, message: '用户名或密码错误' })
    }
    if (!user.enabled) {
      return reply.code(403).send({ ok: false, message: '账号已被禁用' })
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })

    const token = signJwt({ sub: user.id, username: user.username, name: user.name, role: user.role as 'admin' | 'member' })
    return { ok: true, data: { token, user: toSafeUser(user) } }
  })

  app.post('/api/auth/register', async (request, reply) => {
    const { username, password, name, role } = request.body as {
      username?: string
      password?: string
      name?: string
      role?: string
    }
    if (!username || !password) {
      return reply.code(400).send({ ok: false, message: '用户名和密码不能为空' })
    }
    if (password.length < 6) {
      return reply.code(400).send({ ok: false, message: '密码长度不能少于 6 位' })
    }

    const total = await prisma.user.count()
    if (total > 0) {
      // 已有用户时，仅管理员可创建新账号
      const operator = getUserFromRequest(request)
      if (!operator || operator.role !== 'admin') {
        return reply.code(403).send({ ok: false, message: '仅管理员可创建账号' })
      }
    }

    const exists = await prisma.user.findUnique({ where: { username } })
    if (exists) return reply.code(409).send({ ok: false, message: '用户名已存在' })

    const user = await prisma.user.create({
      data: {
        username,
        passwordHash: hashPassword(password),
        name: name ?? username,
        role: total === 0 ? 'admin' : role === 'admin' ? 'admin' : 'member',
      },
    })
    return { ok: true, data: toSafeUser(user) }
  })

  app.get('/api/auth/me', async (request, reply) => {
    const payload = getUserFromRequest(request)
    if (!payload) return reply.code(401).send({ ok: false, message: '未登录' })

    const user = await prisma.user.findUnique({ where: { id: payload.sub } })
    if (!user) return reply.code(401).send({ ok: false, message: '用户不存在' })
    return { ok: true, data: toSafeUser(user) }
  })

  app.post('/api/auth/password', async (request, reply) => {
    const payload = getUserFromRequest(request)
    if (!payload) return reply.code(401).send({ ok: false, message: '未登录' })

    const { oldPassword, newPassword } = request.body as { oldPassword?: string; newPassword?: string }
    if (!oldPassword || !newPassword) {
      return reply.code(400).send({ ok: false, message: '请填写原密码与新密码' })
    }
    if (newPassword.length < 6) {
      return reply.code(400).send({ ok: false, message: '新密码长度不能少于 6 位' })
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } })
    if (!user || !verifyPassword(oldPassword, user.passwordHash)) {
      return reply.code(400).send({ ok: false, message: '原密码错误' })
    }

    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword(newPassword) } })
    return { ok: true }
  })

  // ===== 用户管理（仅管理员）=====

  app.get('/api/users', async (request, reply) => {
    const operator = getUserFromRequest(request)
    if (!operator || operator.role !== 'admin') {
      return reply.code(403).send({ ok: false, message: '需要管理员权限' })
    }
    const users = await prisma.user.findMany({ orderBy: { createdAt: 'asc' } })
    return { ok: true, data: users.map(toSafeUser) }
  })

  app.patch('/api/users/:id', async (request, reply) => {
    const operator = getUserFromRequest(request)
    if (!operator || operator.role !== 'admin') {
      return reply.code(403).send({ ok: false, message: '需要管理员权限' })
    }
    const { id } = request.params as { id: string }
    const { name, role, enabled } = request.body as { name?: string; role?: string; enabled?: boolean }

    // 不允许把自己降级或禁用，避免系统失去管理员
    if (id === operator.sub && (role === 'member' || enabled === false)) {
      return reply.code(400).send({ ok: false, message: '不能修改自己的角色或禁用自己' })
    }

    const user = await prisma.user.update({
      where: { id },
      data: {
        ...(name ? { name } : {}),
        ...(role ? { role } : {}),
        ...(enabled === undefined ? {} : { enabled }),
      },
    })
    return { ok: true, data: toSafeUser(user) }
  })

  app.delete('/api/users/:id', async (request, reply) => {
    const operator = getUserFromRequest(request)
    if (!operator || operator.role !== 'admin') {
      return reply.code(403).send({ ok: false, message: '需要管理员权限' })
    }
    const { id } = request.params as { id: string }
    if (id === operator.sub) {
      return reply.code(400).send({ ok: false, message: '不能删除当前登录的账号' })
    }
    await prisma.user.delete({ where: { id } }).catch(() => undefined)
    return { ok: true }
  })
}
