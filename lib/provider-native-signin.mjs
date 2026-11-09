/**
 * Magpie Providers -> GPTFree sign-in, WITHOUT launching a web page.
 * Magpie's official keyless API sign-in hook invokes one OS-native TXT
 * picker; the ongoing batch is visible in the plugin's embedded GUI.
 */
import { pickAccountTxt } from "./native-file-dialog.mjs";
import { startGuiServer, GUI_PORT } from "./gui-service.mjs";
import { POOL_MARKER } from "./pool-connection.mjs";

export function nativeImportMethod({
  picker = pickAccountTxt,
  server = () => startGuiServer({ port: GUI_PORT }),
} = {}) {
  return {
    type: "api",
    keyless: true,
    label: "选择 TXT 文件并自动导入 GPTFree",
    async authorize(_inputs, { signal } = {}) {
      let file;
      try { file = await picker({ signal }); }
      catch (error) {
        const known = /系统文件选择器不可用|当前平台没有可用|请选择.*\.txt/.test(String(error?.message || ""));
        return { type: "failed", error: known ?
          String(error.message).slice(0, 200) :
          "无法打开系统文件选择器；请使用 Magpie 左侧 Plugins → GPTFree 账号导入" };
      }
      if (signal?.aborted || !file) return {
        type: "failed",
        error: "已取消选择账号文件；可直接使用左侧 Plugins → GPTFree 账号导入",
      };
      let job;
      try {
        const service = await server();
        job = await service.startNativeImport(file, { signal, mode: "pool" });
        const first = await job.first;
        if (!first.ok) return {
          type: "failed",
          error: first.error || "账号尚未成功入池，请在左侧 GPTFree 页面查看",
        };
        // Only a nonsecret marker enters Magpie's plugin-auth store.
        return {
          type: "success",
          key: POOL_MARKER,
          metadata: { accountId: "GPTFree local pool" },
        };
      } catch (error) {
        return {
          type: "failed",
          error: /已有批量导入任务|账号 TXT 格式不正确|无法读取选中的 TXT/.test(String(error?.message || "")) ?
            error.message.slice(0, 200) :
            "本地导入服务未能启动，请检查左侧 GPTFree 导入页",
        };
      }
    },
  };
}
