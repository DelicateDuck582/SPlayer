<!--
  酷狗登录弹窗（入口：左下角用户区头像；与网易云登录体验对齐）

  Tab：扫码登录 / 验证码登录 / 账号密码 / Cookie 登录
  底部：刷新登录（`/login/token`，相当于网易云的 refreshLogin）
-->
<template>
  <div class="kugou-login">
    <n-tabs v-model:value="activeTab" class="tabs" type="segment" animated>
      <n-tab-pane name="qr" tab="扫码登录">
        <QRCode :pause="activeTab !== 'qr'" @saveLogin="saveLogin" />
      </n-tab-pane>
      <n-tab-pane name="phone" tab="验证码登录">
        <Phone @saveLogin="saveLogin" />
      </n-tab-pane>
      <n-tab-pane name="account" tab="账号密码">
        <Account @saveLogin="saveLogin" />
      </n-tab-pane>
      <n-tab-pane name="cookie" tab="Cookie 登录">
        <CookiePanel @saveLogin="saveLogin" />
      </n-tab-pane>
    </n-tabs>
    <n-flex align="center" justify="space-between" class="footer">
      <n-text depth="3" class="current">
        {{ currentText }}
      </n-text>
      <n-button
        size="small"
        quaternary
        round
        :focusable="false"
        :loading="refreshing"
        :disabled="!isKugouLogin()"
        @click="handleRefresh"
      >
        刷新登录
      </n-button>
    </n-flex>
    <n-button :focusable="false" class="close" strong secondary round @click="emit('close')">
      <template #icon>
        <SvgIcon name="WindowClose" />
      </template>
      取消
    </n-button>
  </div>
</template>

<script setup lang="ts">
import QRCode from "./QRCode.vue";
import Phone from "./Phone.vue";
import Account from "./Account.vue";
import CookiePanel from "./Cookie.vue";
import {
  getKugouLastLoginTime,
  getKugouUser,
  isKugouLogin,
  refreshKugouLogin,
} from "@/utils/kugouAuth";

const emit = defineEmits<{
  close: [];
  success: [];
}>();

const activeTab = ref<string>("qr");
const refreshing = ref<boolean>(false);

/** 当前登录态文案 */
const currentText = computed<string>(() => {
  // 依赖 kugouCookie 触发响应式更新
  void isKugouLogin();
  if (!isKugouLogin()) return "未登录酷狗";
  const user = getKugouUser();
  const last = getKugouLastLoginTime();
  const timeText = last ? ` · 上次登录 ${new Date(last).toLocaleString()}` : "";
  return `已登录：${user?.nickname || user?.userid || "酷狗用户"}${timeText}`;
});

/** 子组件登录成功后的统一回调 */
const saveLogin = (result: { ok: boolean; message: string }) => {
  if (!result?.ok) {
    window.$message.error(result?.message || "酷狗登录失败");
    return;
  }
  window.$message.success(result.message);
  emit("success");
  emit("close");
};

/** 刷新登录（换新令牌，不改变账号） */
const handleRefresh = async () => {
  refreshing.value = true;
  const { ok, message } = await refreshKugouLogin();
  refreshing.value = false;
  if (ok) window.$message.success(message);
  else window.$message.error(message);
};
</script>

<style lang="scss" scoped>
.kugou-login {
  .tabs {
    margin-top: -8px;
  }
  .footer {
    margin-top: 12px;
    .current {
      font-size: 12px;
      max-width: 260px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
  .close {
    margin: 12px 0 4px 0;
    width: 100%;
  }
}
</style>
