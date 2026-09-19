<!--
  QQ 音乐登录弹窗（入口：左下角用户区头像；与网易云 / 酷狗登录体验对齐）

  Tab：扫码登录（`/getQQLoginQr` + `/checkQQLoginQr`）/ Cookie 登录
-->
<template>
  <div class="qq-login">
    <n-tabs v-model:value="activeTab" class="tabs" type="segment" animated>
      <n-tab-pane name="qr" tab="扫码登录">
        <div class="qr-pane">
          <n-spin :show="qrLoading">
            <div class="qr-box">
              <img v-if="qrImage" :src="qrImage" alt="QQ 音乐登录二维码" />
              <img v-else class="placeholder" src="/images/avatar.jpg?asset" alt="" />
            </div>
          </n-spin>
          <n-text depth="3" class="tip">{{ qrTip }}</n-text>
          <n-button
            size="small"
            quaternary
            round
            :focusable="false"
            :loading="qrLoading"
            @click="createQr"
          >
            刷新二维码
          </n-button>
        </div>
      </n-tab-pane>
      <n-tab-pane name="cookie" tab="Cookie 登录">
        <div class="cookie-pane">
          <n-alert :bordered="false" title="如何获取 QQ 音乐 Cookie">
            <template #icon>
              <SvgIcon name="Help" />
            </template>
            登录
            <n-a href="https://y.qq.com/" target="_blank">QQ 音乐网页端</n-a>
            后按 <code>F12</code> → <code>Application</code> → <code>Cookies</code>，复制
            <code>uin</code> 与 <code>qqmusic_key</code>（旧版为
            <code>qm_keyst</code>）。凭据只存本机，仅经
            <code>X-Custom-Cookie</code> 请求头发送（不进 URL / 日志）。
          </n-alert>
          <n-input
            v-model:value="cookie"
            :autosize="{ minRows: 3, maxRows: 6 }"
            type="textarea"
            placeholder="uin=o123456; qqmusic_key=xxx;"
            :disabled="loading"
          />
          <n-button type="primary" block :loading="loading" @click="loginCookie">登录</n-button>
        </div>
      </n-tab-pane>
    </n-tabs>
    <n-flex align="center" justify="space-between" class="footer">
      <n-text depth="3" class="current">当前登录：{{ currentText }}</n-text>
      <n-button
        size="small"
        quaternary
        round
        :focusable="false"
        :disabled="!logged"
        @click="handleLogout"
      >
        退出登录
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
import { qqLoginQr } from "@/api/qq";
import {
  checkQqQrLogin,
  getQqLastLoginTime,
  isQqLogin,
  loginQqByCookie,
  qqLoginSummary,
  qqLogout,
} from "@/utils/qqAuth";

const emit = defineEmits<{ close: []; success: [] }>();

const activeTab = ref<string>("qr");
const loading = ref<boolean>(false);
const cookie = ref<string>("");

// ---- 扫码登录
const qrLoading = ref<boolean>(true);
const qrImage = ref<string>("");
const qrSig = ref<string>("");
const qrTip = ref<string>("正在获取二维码…");
let timer: ReturnType<typeof setInterval> | null = null;

/** 是否已登录（读 qqCookie 建立响应式依赖） */
const logged = computed<boolean>(() => {
  void isQqLogin();
  return isQqLogin();
});

/** 登录态文案 */
const currentText = computed<string>(() => {
  const summary = qqLoginSummary();
  if (!summary.logged) return "未登录";
  const last = getQqLastLoginTime();
  return `${summary.text}${last ? ` · 上次登录 ${new Date(last).toLocaleString()}` : ""}`;
});

const stopPolling = () => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
};

/** 轮询扫码状态（2.5s） */
const startPolling = () => {
  stopPolling();
  timer = setInterval(async () => {
    if (!qrSig.value) return;
    try {
      const result = await checkQqQrLogin(qrSig.value);
      qrTip.value = result.message;
      if (result.ok) {
        stopPolling();
        window.$message.success(result.message);
        emit("success");
        emit("close");
      }
    } catch (error) {
      console.warn("QQ 扫码状态检查失败：", (error as Error)?.message);
    }
  }, 2500);
};

/** 获取二维码 */
const createQr = async () => {
  stopPolling();
  qrLoading.value = true;
  qrImage.value = "";
  try {
    const body = await qqLoginQr();
    const image = String(body?.img ?? "");
    qrSig.value = String(body?.qrsig ?? "");
    qrImage.value = image;
    qrTip.value = image ? "请使用 QQ / 微信扫码并在手机上确认" : "二维码获取失败，请点击刷新重试";
    if (image && qrSig.value) startPolling();
  } catch (error) {
    qrTip.value = !(error as any)?.response
      ? "无法连接 QQ 音乐 API 服务：请检查网络，或在「设置 → 网络 → 音乐源 → QQ 音乐 API 地址」改用可用地址"
      : "二维码获取失败，请点击刷新重试";
    console.warn("QQ 二维码获取失败：", (error as Error)?.message);
  } finally {
    qrLoading.value = false;
  }
};

/** Cookie 登录 */
const loginCookie = async () => {
  if (!cookie.value?.trim()) {
    window.$message.warning("请输入 QQ 音乐 Cookie");
    return;
  }
  loading.value = true;
  const result = await loginQqByCookie(cookie.value);
  loading.value = false;
  if (!result.ok) {
    window.$message.error(result.message);
    return;
  }
  window.$message.success(result.message);
  emit("success");
  emit("close");
};

/** 退出登录 */
const handleLogout = () => {
  qqLogout();
  emit("success");
  emit("close");
};

onMounted(createQr);
onBeforeUnmount(stopPolling);
</script>

<style lang="scss" scoped>
.qq-login {
  .tabs {
    margin-top: -8px;
  }
  .qr-pane {
    display: flex;
    flex-direction: column;
    align-items: center;
    .qr-box {
      width: 180px;
      height: 180px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 12px;
      overflow: hidden;
      background-color: var(--n-border-color);
      img {
        width: 100%;
        height: 100%;
        object-fit: contain;
      }
      .placeholder {
        opacity: 0.35;
      }
    }
    .tip {
      display: block;
      margin: 12px 0 8px 0;
      font-size: 12px;
    }
  }
  .cookie-pane {
    .n-input {
      margin: 16px 0 12px 0;
    }
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
