# magpie-gptfree

一个**完全独立**的 Magpie ChatGPT / Codex 账号批量导入工具，支持从 TXT 批量读取邮箱、密码与 TOTP 2FA，使用 **Codex 官方 OAuth（PKCE + 浏览器确认）** 完成账号授权，再调用 Magpie 原生的 `accounts import codex` 接口把成功授权的账号写入 Magpie 管理。

- **不需要 DSH**，不连接任何第三方号池，只有本人有权使用的账号才可导入。
- **Magpie 插件入口**：`gptfree-import`，用于从 Magpie 触发批量导入。
- **命令行入口**：`bin/import.mjs`，支持 dry-run、逐行状态、脱敏错误。
- 使用本机可见的 Chrome/Edge；不绕过验证码、云端安全挑战或异常登录验证。
- 登录使用的是 **Codex OAuth scope**，不是 OpenAI Platform 的 OAuth Token；不会伪造续期凭证。

## TXT 导入格式

每行一条账号，支持 `----` 或 `---` 作为字段分隔符；可混合使用（分隔符为 3 个及以上连续短横线）。

| 格式 | 示例 | 处理 |
| --- | --- | --- |
| 1. 标准三字段 | `邮箱----密码----2FA密钥` | 自动填写登录表单与本地计算的 TOTP，成功后以 Codex OAuth 导入 |
| 2. 含邮箱/接码链接 | `邮箱----密码----2FA密钥----https://mail.xxx.store/...` | 自动识别第四字段为 URL，**仅使用前三字段登录**，绝不自动访问该第三方 URL |
| 3. 含现成 access token | `邮箱----密码----2FA密钥----eyJhbGci...` | 解析 JWT 元信息、判断是否过期，再执行 Codex OAuth 授权补全可续期登录 |
| 兼容格式 | `邮箱----密码` | 没有 TOTP 时尝试普通浏览器登录 |

TXT 样例（以下全是占位符，请替换成自己有权使用的账号）：

```text
first@example.com----YOUR_PASSWORD----GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ
second@example.com---YOUR_PASSWORD---GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ---https://mail.xxx.store/example
third@example.com----YOUR_PASSWORD----GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ----eyJhbGciOiJSUzI1NiJ9.eyJleHAiOjQ3MzM4NTYwMDB9.EXAMPLE_SIGNATURE
```

**重要：access_token 不能当成 refresh_token。** Magpie 原生 Codex 导入要求 `access_token`、`id_token` 和 `refresh_token`。第三种格式只有 `access_token`，**即使本地 JWT `exp` 尚未过期，也不表示它通过了服务器签名验证或一定能使用 Codex**。本版本支持识别、记录状态和自动回退到标准浏览器 OAuth，但**尚不能单凭这一个 token 直接加入可续期的 Magpie 原生号池**；不能把它误报为「已复用入池」。要实现真正的短期 access-only 号池需额外开发独立 Provider/续期管理，这是后续功能。

## 安装与使用

先安装 [Magpie](https://github.com/yetone/magpie) 并确认命令 `magpie --version` 能运行；再准备 Node.js 20+ 和 Chrome/Edge。

```powershell
git clone https://github.com/yang0/magpie-gptfree.git
cd magpie-gptfree
npm install
```

在此开发分支使用时，先执行 `git checkout feat/standalone-batch-2fa`（该分支未合入 main）。

1. 把自己的 TXT 存到当前目录，建议命名为 `accounts.txt` 并限制文件读取权限。
2. 先进行格式检查；不会连接 OpenAI，也不会输出密码/Token/邮箱链接：

```powershell
node bin/import.mjs --file .\accounts.txt --dry-run
```

3. 检查无误后启动受控登录导入。每个账号单独打开一个隔离浏览器会话：

```powershell
node bin/import.mjs --file .\accounts.txt --i-own-these-accounts
```

4. 等待网页登录完成（若需验证码或人工验证，自己在可见浏览器里完成）。导入成功后检查：

```powershell
magpie accounts codex
```

如 Magpie CLI 不在 PATH，可通过 `--magpie "C:\path\to\magpie.exe"` 指定程序；如需指定网络代理，可通过 `--proxy http://127.0.0.1:7890`（必须是可信代理）配置浏览器登录。

### 作为 Magpie 插件安装

```powershell
magpie plugin add .
magpie plugin login gptfree-import
```

在登录交互中输入 TXT 的绝对路径，确认账号使用权，插件会调用同一个导入器。**这是用于触发批量导入的工具插件，不是提供模型的自定义 Provider**：完成后到 Magpie 的 **ChatGPT / Codex** 原生账号列表查看，而不是在 `gptfree-import` 下找模型。

本项目的 Magpie 插件宿主 / Windows 浏览器实际联调仍待验证。如插件中调用本地浏览器受限，请直接用上面的 CLI 方式；CLI 是优先验收路径。

## 安全策略

- 明文账号 TXT 只在本地读取，不上传到本仓库或第三方服务。不要向他人发送这些文件。
- 密码、TOTP、JWT 不出现在 dry-run、进度日志和返回结果中；详细的原始上游错误也不打印。
- OAuth 使用随机 state + PKCE，本地 `127.0.0.1:1455` 回调，TLS 严格校验；单账号成功后只短暂生成受限制权限的临时 `auth.json`，通过 Magpie 原生导入后立即删除。
- 临时 refresh_token 会被 Magpie 刷新/轮换，**之前持有同一 token 的软件可能被登出**。
- 不绕过额外的登录挑战，不解码不可信链接的内容，也不会自动访问 TXT 里的第三方邮件网址。
- 不保证每个免费 ChatGPT 账号都有 Codex 模型/额度或访问权限。请遵守平台服务条款。

## 开发与测试

```bash
npm run check
npm test
```

测试使用模拟账号、模拟 Token 和模拟浏览器，不接触真实 ChatGPT 账号。

### 当前进度

- ✅ TXT 三/四字段、`---` / `----`、邮箱链接与 JWT 类型识别
- ✅ JWT 本地过期判断以及无法直接续期时的 OAuth 回退
- ✅ Codex OAuth PKCE + 可见浏览器 + TOTP 自动填写
- ✅ 成功后尝试导入 Magpie 原生 Codex 账号
- ✅ 单元测试与 GitHub Actions 工作流
- ⏳ 使用实际拥有的账号完成 Magpie 桌面插件与真正的 Codex 模型请求验收
- ⏳ 单独 access_token 直接复用为短期号池会话（当前原生导入不支持）

开发记录：[Issue #1](https://github.com/yang0/magpie-gptfree/issues/1)。
