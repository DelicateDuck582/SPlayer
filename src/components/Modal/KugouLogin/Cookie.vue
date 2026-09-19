<!-- 酷狗 Cookie 登录（粘贴 token / userid，或整段 Cookie） -->
<template>
  <div class="kugou-cookie">
    <n-alert :bordered="false" title="如何获取酷狗 Cookie">
      <template #icon>
        <SvgIcon name="Help" />
      </template>
      登录
      <n-a href="https://www.kugou.com/" target="_blank">酷狗音乐网页端</n-a>
      后按 <code>F12</code> → <code>Application</code>（应用）→ <code>Cookies</code>，复制
      <code>token</code> 与 <code>userid</code> 两项即可，也可以整段粘贴 Cookie。<br />
      凭据只保存在本机，且仅在请求体里发送给酷狗 API 服务（不进 URL / 日志）。
    </n-alert>
    <n-input
      v-model:value="cookie"
      :autosize="{ minRows: 3, maxRows: 6 }"
      type="textarea"
      placeholder="token=xxx; userid=xxx;"
      :disabled="loading"
    />
    <n-text v-if="currentName" depth="3" class="current">当前登录：{{ currentName }}</n-text>
    <n-button type="primary" block :loading="loading" @click="login">登录</n-button>
  </div>
</template>

<script setup lang="ts">
import { getKugouUser, isKugouLogin, loginKugouByCookie } from "@/utils/kugouAuth";

const emit = defineEmits<{
  saveLogin: [result: { ok: boolean; message: string }];
}>();

const cookie = ref<string>("");
const loading = ref<boolean>(false);

/** 已登录时的昵称（提示用户正在覆盖登录） */
const currentName = computed<string>(() => {
  void isKugouLogin();
  if (!isKugouLogin()) return "";
  const user = getKugouUser();
  return user?.nickname || user?.userid || "已登录";
});

/** Cookie 登录 */
const login = async () => {
  if (!cookie.value?.trim()) {
    window.$message.warning("请输入酷狗 Cookie");
    return;
  }
  if (loading.value) return;
  loading.value = true;
  const result = await loginKugouByCookie(cookie.value);
  loading.value = false;
  emit("saveLogin", result);
};
</script>

<style lang="scss" scoped>
.kugou-cookie {
  .n-input {
    margin: 16px 0 12px 0;
    width: 100%;
  }
  .current {
    display: block;
    margin-bottom: 8px;
    font-size: 12px;
  }
  code {
    font-size: 12px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background-color: var(--n-border-color);
    padding: 4px 6px;
    border-radius: 8px;
    margin: 4px 0;
    font-family: auto;
  }
}
</style>
