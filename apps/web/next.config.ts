import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@vantiq/ai", "@vantiq/domain", "@vantiq/fixtures", "@vantiq/db", "@vantiq/integrations"],
  serverExternalPackages: ["exceljs", "@react-pdf/renderer"],
  // Shared board packs: never cached, indexed or leaked to other sites through the Referer header.
  async headers() {
    return [
      {
        source: "/share/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
  experimental: {
    // Uploads go through a server action; the hosted plan caps request bodies near 4.5 MB.
    serverActions: { bodySizeLimit: "4.5mb" },
  },
};

export default config;
