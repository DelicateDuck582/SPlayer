<!-- 酷狗扫码登录（`/login/qr/key` 直接返回二维码 base64；`/login/qr/check` 轮询状态） -->
<template>
  <div class="kugou-qr">
    <n-spin :show="loading">
      <div class="qr-box">
        <img v-if="qrImage" :src="qrImage" alt="酷狗登录二维码" />
        <img v-else class="placeholder" src="/images/avatar.jpg?asset" alt="" />
      </div>
    </n-spin>
    <n-text depth="3" class="tip">{{ tip }}</n-text>
    <n-button size="small" quaternary round :focusable="false" :loading="loading" @click="createQr">
      刷新二维码
    </n-button>
  </div>
</template>

<script setup lang="ts">
import { kugouLoginQrCreate, kugouLoginQrKey } from "@/api/kugou";
import { checkKugouQrLogin } from "@/utils/kugouAuth";

const props = defineProps<{
  /** 暂停轮询（如切换到其它登录方式） */
  pause?: boolean;
}>();

const emit = defineEmits<{
  saveLogin: [result: { ok: boolean; message: string }];
}>();

const loading = ref<boolean>(true);
const qrImage = ref<string>("");
const qrKey = ref<string>("");
const tip = ref<string>("正在获取二维码…");
let timer: ReturnType<typeof setInterval> | null = null;

/** 停止轮询 */
const stopPolling = () => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
};

/** 启动轮询（2s 一次，避免过于频繁） */
const startPolling = () => {
  stopPolling();
  timer = setInterval(async () => {
    if (props.pause || !qrKey.value) return;
    try {
      const result = await checkKugouQrLogin(qrKey.value);
      tip.value = result.message;
      // 0：二维码过期；4：登录成功
      if (result.status === 0) {
        stopPolling();
        return;
      }
      if (result.ok) {
        stopPolling();
        emit("saveLogin", { ok: true, message: result.message });
      }
    } catch (error) {
      console.warn("酷狗扫码状态检查失败：", (error as Error)?.message);
    }
  }, 2000);
};

/** 生成二维码 */
const createQr = async () => {
  stopPolling();
  loading.value = true;
  qrImage.value = "";
  try {
    const keyRes: any = await kugouLoginQrKey();
    const key = String(keyRes?.data?.qrcode ?? keyRes?.data?.key ?? "");
    if (!key) {
      tip.value = "二维码获取失败，请点击刷新重试";
      return;
    }
    qrKey.value = key;
    // 上游 key 接口已直接返回 base64 图片；缺失时再调用 /login/qr/create
    let image = String(keyRes?.data?.qrcode_img ?? "");
    if (!image) {
      const created: any = await kugouLoginQrCreate(key, true);
      image = String(created?.data?.base64 ?? "");
    }
    qrImage.value = image;
    tip.value = image ? "请使用酷狗 App 扫码" : "二维码获取失败，请点击刷新重试";
    if (image) startPolling();
  } catch (error) {
    // 常见原因：API 地址不可达（自定义域 DNS 未生效）、网络异常
    const isNetworkFailure = !(error as any)?.response;
    tip.value = isNetworkFailure
      ? "无法连接酷狗 API 服务：请检查网络，或在「设置 → 网络 → 音乐源 → 酷狗 API 服务地址」改用可用地址"
      : "二维码获取失败，请点击刷新重试";
    console.warn("酷狗二维码获取失败：", (error as Error)?.message);
  } finally {
    loading.value = false;
  }
};

// 切回扫码页时恢复轮询
watch(
  () => props.pause,
  (paused) => {
    if (!paused && qrKey.value && !timer) startPolling();
  },
);

onMounted(createQr);
onBeforeUnmount(stopPolling);
</script>

<style lang="scss" scoped>
.kugou-qr {
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
</style>
