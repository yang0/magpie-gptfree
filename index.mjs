/**
 * Native Magpie plugin entry point.
 * This is an IMPORT HELPER, not a model provider: successful logins become
 * native Codex subscription accounts using `magpie accounts import codex`.
 * Browser automation never bypasses interactive challenges.
 */
import { runBatch } from "./lib/importer.mjs";
const PROVIDER = "gptfree-import";

export const GPTFreeImportPlugin = async () => ({
  config: async (cfg) => {
    cfg.provider ??= {};
    cfg.provider[PROVIDER] ??= {
      name: "GPTFree Batch Import · 工具",
      npm: "@ai-sdk/openai-compatible",
      models: {}, // Native ChatGPT/Codex, not this helper, serves models.
    };
  },
  auth: {
    provider: PROVIDER,
    methods: [{
      type: "oauth",
      label: "TXT 批量导入 ChatGPT/Codex 账号",
      prompts: [
        { type: "text", key: "file", message: "TXT 文件完整路径（每行 邮箱----密码----2FA密钥）" },
        { type: "select", key: "consent", message: "我有这些账号的使用/管理授权",
          options: [{ label: "是，我确认", value: "yes" }, { label: "取消", value: "no" }] },
      ],
      async authorize(inputs, { signal } = {}) {
        if (inputs?.consent !== "yes")
          return { type: "failed", error: "请先确认账号的使用或管理授权" };
        if (!inputs?.file?.trim())
          return { type: "failed", error: "请输入 TXT 文件完整路径" };
        const task = runBatch({
          file: inputs.file.trim(), consent: true, signal,
        }).then((r) => ({ r }), (err) => ({ err }));
        return {
          url: "",
          instructions: "将打开可见的 Chrome/Edge 浏览器。支持自动填写密码和 TOTP；遇到安全验证请自行操作。导入结果在 Codex/ChatGPT 原生账号列表查看。大量账号建议使用命令行工具。",
          opened: true,
          method: "auto",
          async callback() {
            const { r, err } = await task;
            if (err) return { type: "failed", error: "批量导入未完成；请使用命令行查看脱敏错误信息" };
            if (!r.added) return { type: "failed", error: "没有成功导入的账号，请检查浏览器授权或运行 CLI 排错" };
            // Magpie needs a completed helper sign-in. It has no models:
            // the real accounts live under the native Codex provider.
            return {
              type: "success", key: "import-helper-complete",
              accountId: "GPTFree Import Helper",
              metadata: { imported: r.added, failed: r.failed.length },
            };
          },
        };
      },
    }],
    async loader() { return {}; },
  },
  provider: {
    id: PROVIDER,
    async models() { return {}; },
  },
});
