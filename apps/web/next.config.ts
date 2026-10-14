import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@vantiq/ai", "@vantiq/domain", "@vantiq/fixtures", "@vantiq/db", "@vantiq/integrations"],
  serverExternalPackages: ["exceljs", "@react-pdf/renderer"],
  experimental: {
    // Uploads go through a server action; the hosted plan caps request bodies near 4.5 MB.
    serverActions: { bodySizeLimit: "4.5mb" },
  },
};

export default config;
