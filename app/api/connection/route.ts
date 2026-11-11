import { checkToken, getToken, isSingleUserMode, normalizeToken, removeToken, requestUser, saveToken, tokenStatusMessage } from "../../server";

export async function GET(request: Request) {
  const user = requestUser(request);
  if (!user) return Response.json({ error: "当前连接未通过身份验证。" }, { status: 401 });

  const token = await getToken(user);
  if (isSingleUserMode()) {
    return Response.json({
      connected: !!token,
      token_saved: !!token,
      mode: "cloudflare-secret",
      error: token ? undefined : "请在 Cloudflare 中配置 CODEFLOE_TOKEN。",
    });
  }
  if (!token) return Response.json({ connected: false, token_saved: false, mode: "chatgpt-sites" });
  try {
    const status = await checkToken(token);
    return Response.json({
      connected: status === 200,
      token_saved: true,
      api_status: status,
      mode: isSingleUserMode() ? "cloudflare-secret" : "chatgpt-sites",
      error: status === 200 ? undefined : tokenStatusMessage(status),
    });
  } catch {
    return Response.json({ connected: false, token_saved: true, mode: isSingleUserMode() ? "cloudflare-secret" : "chatgpt-sites", error: "暂时无法验证 CodeFloe 连接。" });
  }
}

export async function POST(request: Request) {
  if (isSingleUserMode()) {
    return Response.json({ error: "此部署从 Cloudflare Secret 读取 CodeFloe Token，请在 Cloudflare 中更新 CODEFLOE_TOKEN。" }, { status: 409 });
  }
  const user = requestUser(request);
  if (!user) return Response.json({ error: "当前连接未通过身份验证。" }, { status: 401 });
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response(null, { status: 403 });

  try {
    const body = await request.json() as { disconnect?: boolean; token?: unknown };
    if (body.disconnect === true) {
      await removeToken(user);
      return Response.json({ connected: false });
    }

    const token = typeof body.token === "string" ? normalizeToken(body.token) : "";
    if (token.length < 8 || token.length > 512 || /\s/.test(token)) {
      return Response.json({ error: "请输入完整的 CodeFloe 访问令牌。" }, { status: 400 });
    }
    const status = await checkToken(token);
    if (status !== 200) {
      return Response.json({ error: tokenStatusMessage(status), api_status: status }, { status: 400 });
    }

    await saveToken(user, token);
    return Response.json({ connected: true });
  } catch {
    return Response.json({ error: "暂时无法验证或保存 CodeFloe 连接。" }, { status: 502 });
  }
}
