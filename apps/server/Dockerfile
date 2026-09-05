FROM node:22-alpine AS base
WORKDIR /app

# ---- 依赖层：只装服务端依赖，利用 Docker 缓存 ----
FROM base AS deps
COPY apps/server/package.json ./
RUN npm install --no-audit --no-fund

# ---- 构建层：校验 schema 并生成 Prisma Client ----
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY apps/server ./apps/server
WORKDIR /app/apps/server
RUN npx prisma generate

# ---- 运行层 ----
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/apps/server ./apps/server
WORKDIR /app/apps/server
EXPOSE 3001
# 启动前确保 Prisma Client 已生成，再同步表结构，最后拉起服务
CMD ["sh", "-c", "npx prisma generate && npx prisma db push --skip-generate && npx tsx src/index.ts"]
