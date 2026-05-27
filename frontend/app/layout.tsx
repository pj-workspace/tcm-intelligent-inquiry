/**
 * @fileoverview 应用根布局：字体变量、全局样式与 Providers 包裹。
 */
import type { Metadata } from "next";
import { Inter, Noto_Serif_SC } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const notoSerifSC = Noto_Serif_SC({
  variable: "--font-noto-serif-sc",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "TCM Intelligent Inquiry",
  description: "AI-powered Traditional Chinese Medicine Assistant",
};

const themeInitScript = `(function(){try{var k='tcm-theme',d=document.documentElement,c=d.classList;c.remove('light','dark');var t=localStorage.getItem(k);if(t==='system'||!t){var m=window.matchMedia('(prefers-color-scheme: dark)');if(m.matches){c.add('dark');d.style.colorScheme='dark'}else{d.style.colorScheme='light'}}else if(t==='dark'||t==='light'){c.add(t);d.style.colorScheme=t}}catch(e){}})();`;

/** 根 HTML 壳：挂载字体 CSS 变量与全局 Auth/Toast Providers。 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      suppressHydrationWarning
      className={`${inter.variable} ${notoSerifSC.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="flex min-h-full flex-col bg-background font-sans text-foreground">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
