import { env } from "cloudflare:workers";
import { getDb } from "../db";
import { credentials } from "../db/schema";
import { eq } from "drizzle-orm";
const encode=(v:Uint8Array)=>btoa(String.fromCharCode(...v));
const decode=(v:string)=>Uint8Array.from(atob(v),c=>c.charCodeAt(0));
export function isSingleUserMode(){return !!env.MCP_ACCESS_TOKEN?.trim();}
export function requestUser(request:Request){return request.headers.get("oai-authenticated-user-id")||(isSingleUserMode()?"single-user":null);}
export function authorizeMcpRequest(request:Request){
 const secret=env.MCP_ACCESS_TOKEN?.trim();
 if(!secret)return isSingleUserMode()?false:!!request.headers.get("oai-authenticated-user-id");
 const match=/^Bearer\s+([^\s]+)$/i.exec(request.headers.get("authorization")||"");
 if(!match)return false;
 const expected=new TextEncoder().encode(secret),actual=new TextEncoder().encode(match[1]);
 if(expected.length<32)return false;
 let difference=expected.length^actual.length;
 for(let i=0;i<Math.max(expected.length,actual.length);i++)difference|=(expected[i]||0)^(actual[i]||0);
 return difference===0;
}
async function key(){const secret=(env as unknown as Record<string,string>).TOKEN_ENCRYPTION_KEY;if(!secret)throw Error("服务端加密配置缺失");return crypto.subtle.importKey("raw",decode(secret),"AES-GCM",false,["encrypt","decrypt"]);}
export async function saveToken(user:string,token:string){const iv=crypto.getRandomValues(new Uint8Array(12));const bytes=await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:new TextEncoder().encode(user)},await key(),new TextEncoder().encode(token));const encrypted=encode(iv)+"."+encode(new Uint8Array(bytes));await getDb().insert(credentials).values({userId:user,encrypted}).onConflictDoUpdate({target:credentials.userId,set:{encrypted}});}
export async function getToken(user:string){if(isSingleUserMode())return env.CODEFLOE_TOKEN?.trim()||null;const row=await getDb().select().from(credentials).where(eq(credentials.userId,user)).get();if(!row)return null;const [iv,data]=row.encrypted.split('.');return new TextDecoder().decode(await crypto.subtle.decrypt({name:"AES-GCM",iv:decode(iv),additionalData:new TextEncoder().encode(user)},await key(),decode(data)));}
export async function removeToken(user:string){await getDb().delete(credentials).where(eq(credentials.userId,user));}
export function normalizeToken(value: string) {
  return value.trim().replace(/^(?:Bearer|token)\s+/i, "");
}

export async function checkToken(value: string) {
  const token = normalizeToken(value);
  const response = await fetch("https://codefloe.com/api/v1/user", {
    headers: { Accept: "application/json", Authorization: "token " + token },
    redirect: "manual",
    signal: AbortSignal.timeout(15000),
  });
  await response.body?.cancel();
  return response.status;
}

export function tokenStatusMessage(status: number) {
  if (status === 401) return "CodeFloe 拒绝了当前令牌（HTTP 401）。请核对这里填写的是 CodeFloe 生成的完整访问令牌。";
  if (status === 403) return "CodeFloe 拒绝读取账号信息（HTTP 403）。请核对令牌的 read:user 权限和访问范围。";
  return "CodeFloe 账号验证失败（HTTP " + status + "）。";
}

export async function upstream(value:string,method:string,params:unknown){
 const token=normalizeToken(value);
 let session:string|null=null; let version="2025-03-26";
 async function rpc(method:string,params:unknown,id:number){const headers:Record<string,string>={"Authorization":"token "+token,"Content-Type":"application/json","Accept":"application/json, text/event-stream","MCP-Protocol-Version":version};if(session)headers["Mcp-Session-Id"]=session;
 const r=await fetch("https://mcp.codefloe.com/mcp",{method:"POST",headers,body:JSON.stringify({jsonrpc:"2.0",id,method,params}),signal:AbortSignal.timeout(45000),redirect:"manual"});session=r.headers.get("Mcp-Session-Id")||session;if(!r.ok)throw Error("CodeFloe 返回 HTTP "+r.status);const raw=await r.text();let data;if(r.headers.get("content-type")?.includes("text/event-stream")){const chunks=raw.split(/\r?\n\r?\n/);for(const c of chunks){const s=c.split(/\r?\n/).filter(l=>l.startsWith("data:")).map(l=>l.slice(5).trimStart()).join("\n");if(s){const v=JSON.parse(s);if(v.id===id)data=v;}}}else data=JSON.parse(raw);if(!data)throw Error("CodeFloe 响应不完整");if(data.error)throw Error("CodeFloe MCP 请求失败（"+data.error.code+"）");return data.result;}
 const init=await rpc("initialize",{protocolVersion:version,capabilities:{},clientInfo:{name:"codefloe-cloud",version:"1.0.0"}},1);version=init.protocolVersion||version;
 const headers:Record<string,string>={"Authorization":"token "+token,"Content-Type":"application/json","Accept":"application/json, text/event-stream","MCP-Protocol-Version":version};if(session)headers["Mcp-Session-Id"]=session;
 const notified=await fetch("https://mcp.codefloe.com/mcp",{method:"POST",headers,body:JSON.stringify({jsonrpc:"2.0",method:"notifications/initialized"}),redirect:"manual",signal:AbortSignal.timeout(15000)});if(!notified.ok)throw Error("CodeFloe 初始化失败");await notified.body?.cancel();
 return rpc(method,params,2);
}
