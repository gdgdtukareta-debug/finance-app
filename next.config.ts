import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 画像の外部ドメインを許可（株価アイコンなど）
  images: {
    remotePatterns: [],
  },
  // TypeScriptの厳密チェックを有効化
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
