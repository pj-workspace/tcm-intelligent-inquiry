/**
 * @fileoverview 注册页 Server 入口：复用登录客户端壳，默认打开注册模式。
 */
import { LoginPageClient } from "../login/login-client";

/** 注册页：以 `register` 模式挂载共享的 `LoginPageClient`。 */
export default async function RegisterPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<Record<string, string | string[] | undefined>>;
  searchParams: Promise<Record<string, string | string[] | string[][] | undefined>>;
}>) {
  await Promise.all([params, searchParams]);
  return <LoginPageClient initialMode="register" />;
}
