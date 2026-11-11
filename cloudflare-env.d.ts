declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    CODEFLOE_TOKEN?: string;
    MCP_ACCESS_TOKEN?: string;
  }
}
