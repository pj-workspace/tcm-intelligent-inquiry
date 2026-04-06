#!/usr/bin/env bash
# 一键：本地构建前端静态资源校验 + Docker 镜像构建与启动（MySQL + Redis Stack + Spring Boot + Nginx）
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

echo "==> 前端生产构建（校验 TS / 打包）…"
(cd frontend && npm ci --no-audit --no-fund && npm run build)

echo "==> Docker Compose 构建并后台启动…"
export DOCKER_BUILDKIT="${DOCKER_BUILDKIT:-1}"
docker compose build
docker compose up -d

echo "就绪：前端 http://localhost:${HTTP_PORT:-80}  |  后端直连 http://localhost:${BACKEND_PORT:-8080}"
echo "持久卷：MySQL / Redis 数据见 docker volume（tcm_mysql_data、tcm_redis_data）。"
