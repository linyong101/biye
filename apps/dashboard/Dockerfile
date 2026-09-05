FROM node:22-alpine AS build
WORKDIR /app
COPY apps/dashboard/package.json ./
RUN npm install --no-audit --no-fund
COPY apps/dashboard/. .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
# SPA 路由回退 + 将 /api 反向代理到采集服务（同容器网络内）
RUN printf 'server {\n  listen 80;\n  root /usr/share/nginx/html;\n  index index.html;\n  location /api/ {\n    proxy_pass http://server:3001;\n    proxy_set_header Host $host;\n    proxy_set_header X-Real-IP $remote_addr;\n  }\n  location / {\n    try_files $uri $uri/ /index.html;\n  }\n}\n' > /etc/nginx/conf.d/default.conf
EXPOSE 80
