import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the native embedding runtime (onnxruntime-node) out of the bundle so it
  // loads from node_modules at runtime instead of being traced/bundled.
  serverExternalPackages: ["@huggingface/transformers"],
};

export default nextConfig;
