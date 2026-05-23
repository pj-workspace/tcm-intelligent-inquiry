/**
 * @fileoverview Next.js 应用配置：根路径重定向至 `/chat`。
 */
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** 将 `/` 永久重定向到聊天工作台入口。 */
  async redirects() {
    return [
      {
        source: "/",
        destination: "/chat",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
