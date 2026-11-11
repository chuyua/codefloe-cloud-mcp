"use client";

import { useEffect, useState } from "react";

type ConnectionState = {
  connected?: boolean;
  token_saved?: boolean;
  mode?: "cloudflare-secret" | "chatgpt-sites";
  error?: string;
};

export default function Page() {
  const [connected, setConnected] = useState(false);
  const [tokenSaved, setTokenSaved] = useState(false);
  const [cloudflareMode, setCloudflareMode] = useState(false);
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("正在检查连接…");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/connection")
      .then((response) => response.json() as Promise<ConnectionState>)
      .then((state) => {
        setConnected(!!state.connected);
        setTokenSaved(!!state.token_saved);
        setCloudflareMode(state.mode === "cloudflare-secret");
        setMessage(
          state.error ||
            (state.mode === "cloudflare-secret"
              ? state.token_saved
                ? "CodeFloe Token 由 Cloudflare Secret 管理。"
                : "请在 Cloudflare 中配置 CODEFLOE_TOKEN。"
              : ""),
        );
      })
      .catch(() => setMessage("连接检查失败，请刷新重试"));
  }, []);

  async function submit(disconnect = false) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(disconnect ? { disconnect: true } : { token }),
      });
      const data = (await response.json()) as { connected: boolean; error?: string };
      if (!response.ok) throw Error(data.error || "连接失败");
      setConnected(data.connected);
      setTokenSaved(data.connected);
      setToken("");
      setMessage(disconnect ? "已删除保存的凭据" : "已验证并安全保存。现在可在 ChatGPT 中连接云端插件。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "连接失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <span className="eyebrow">CODEFLOE · CLOUD CONNECTOR</span>
      <h1>代码协作，<br />随时连接。</h1>
      <p className="intro">通过云端连接 CodeFloe，无需运行桌面程序。此页面适配电脑浏览器与手机。</p>
      <section>
        <div className="status">
          {cloudflareMode
            ? tokenSaved ? "● Cloudflare Secret 已配置" : "○ 未配置 CodeFloe Secret"
            : connected ? "● 已连接 CodeFloe" : "○ 等待连接"}
        </div>
        <h2>{cloudflareMode ? "单用户 Cloudflare 部署" : connected ? "你的连接已就绪" : "连接你的 CodeFloe 账号"}</h2>
        {cloudflareMode ? (
          <>
            <p>这是单用户 Cloudflare 部署。CodeFloe Token 只从 Worker Secret 读取，不会在此页面显示或提交。</p>
            <p>若尚未配置，请在 Worker 设置中添加 <code>CODEFLOE_TOKEN</code>，保存后重新部署。</p>
            <p>ChatGPT 连接 MCP 时使用单独的 <code>MCP_ACCESS_TOKEN</code>。</p>
          </>
        ) : (
          <>
            <p>在 CodeFloe 的 Settings → Applications 中创建访问令牌。只读访问需要 read:repository、read:issue、read:user；写入操作请按需授权。</p>
            <a href="https://docs.codefloe.com/usage/mcp/" target="_blank" rel="noreferrer">查看官方授权说明 ↗</a>
            <form onSubmit={(event) => { event.preventDefault(); void submit(); }}>
              <label htmlFor="token">CodeFloe Access Token</label>
              <input id="token" type="password" value={token} onChange={(event) => setToken(event.target.value)} autoComplete="off" placeholder="仅在此安全表单填写" required minLength={8} />
              <button disabled={busy || !token}>{busy ? "正在验证…" : connected ? "更新连接" : "验证并连接"}</button>
            </form>
            {tokenSaved && <button className="secondary" disabled={busy} onClick={() => void submit(true)}>断开并删除凭据</button>}
          </>
        )}
        <p role="status">{message}</p>
      </section>
      <footer>
        {cloudflareMode
          ? "单用户模式不会在网页或数据库中保存 CodeFloe Token；请勿公开 MCP_ACCESS_TOKEN。"
          : <>凭据加密保存在服务端，按你的 ChatGPT 身份隔离。不要在聊天中发送 Token。<br />聊天内调用还需安装云端插件；不同客户端的插件入口可能不同。</>}
      </footer>
    </main>
  );
}
