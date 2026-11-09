import { createHmac } from "node:crypto";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BASE32 = /^[A-Z2-7]+=*$/;
export const MAX_ACCOUNTS = 100;
export const MAX_BYTES = 1024 * 1024;

function splitFields(line) {
  // Accept 3 or 4 hyphens between fields, never split the password on single hyphens.
  const sep = line.includes("----") ? "----" : "---";
  const cols = line.split(sep).map((v) => v.trim());
  return cols;
}

export function parseAccounts(content) {
  if (typeof content !== "string" || Buffer.byteLength(content, "utf8") > MAX_BYTES)
    throw new Error("账号文件超过 1 MiB 或不是 UTF-8 文本");
  const accounts = [], errors = [], seen = new Set();
  let duplicates = 0;
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/);
  for (const [i, raw] of lines.entries()) {
    const line = raw.trim(), number = i + 1;
    if (!line || line.startsWith("#") || line.startsWith("//")) continue;
    const cols = splitFields(line);
    if (cols.length !== 2 && cols.length !== 3) {
      errors.push({ line: number, reason: "应为 邮箱----密码----2FA密钥（无2FA可省略第三项）" });
      continue;
    }
    const [rawEmail, password, rawSeed = ""] = cols;
    const email = rawEmail.toLowerCase();
    const totp = rawSeed.replace(/[\s-]/g, "").toUpperCase();
    if (!EMAIL.test(email) || email.length > 254) {
      errors.push({ line: number, reason: "邮箱格式不正确" }); continue;
    }
    if (!password || password.length > 512 || /[\r\n\0]/.test(password)) {
      errors.push({ line: number, reason: "密码为空或太长" }); continue;
    }
    if (totp && (!BASE32.test(totp) || totp.replace(/=+$/, "").length < 16)) {
      errors.push({ line: number, reason: "2FA密钥不是合法的 Base32 TOTP Secret" }); continue;
    }
    if (seen.has(email)) { duplicates++; continue; }
    seen.add(email);
    accounts.push({ email, password, totp, line: number });
    if (accounts.length > MAX_ACCOUNTS)
      throw new Error("单次最多导入 100 个账号；请分批执行");
  }
  return { accounts, errors, duplicates };
}

export function totpCode(seed, now = Date.now()) {
  const normalized = String(seed).toUpperCase().replace(/[\s=-]/g, "");
  if (!normalized || !/^[A-Z2-7]+$/.test(normalized))
    throw new Error("TOTP Secret 无效");
  // Base32 decode (RFC 4648), without external dependencies.
  let bits = 0, buffer = 0;
  const bytes = [];
  for (const ch of normalized) {
    const v = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(ch);
    buffer = (buffer << 5) | v;
    bits += 5;
    if (bits >= 8) {
      bytes.push((buffer >>> (bits -= 8)) & 255);
      buffer &= (1 << bits) - 1;
    }
  }
  const time = BigInt(Math.floor(now / 30000));
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(time);
  const hash = createHmac("sha1", Buffer.from(bytes)).update(msg).digest();
  const n = hash[hash.length - 1] & 0x0f;
  return String(((hash.readUInt32BE(n) & 0x7fffffff) % 1000000)).padStart(6, "0");
}

export function safeAccountName(email) {
  const [name, domain] = email.split("@");
  return name.length <= 2 ? "*@" + domain : name.slice(0, 2) + "***@" + domain;
}
