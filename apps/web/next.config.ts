import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@vantiq/domain", "@vantiq/fixtures"],
};

export default config;
