<!-- 酷狗验证码登录（`/captcha/sent` 发送验证码 + `/login/cellphone` 登录） -->
<template>
  <div class="kugou-phone">
    <n-input
      v-model:value="mobile"
      placeholder="请输入手机号"
      :maxlength="11"
      clearable
      :disabled="loading"
    />
    <n-flex class="code-row" :wrap="false">
      <n-input
        v-model:value="code"
        placeholder="请输入短信验证码"
        clearable
        :disabled="loading"
        @keyup.enter="login"
      />
      <n-button
        class="send"
        :disabled="countdown > 0 || loading"
        :loading="sending"
        @click="sendCode"
      >
        {{ countdown > 0 ? `${countdown}s 后重发` : "发送验证码" }}
      </n-button>
    </n-flex>
    <n-button type="primary" block :loading="loading" @click="login">登录</n-button>
    <n-text depth="3" class="tip">
      验证码由酷狗下发；若返回风控错误（152 / 20010），请改用扫码或 Cookie 登录
    </n-text>
  </div>
</template>

<script setup lang="ts">
import { loginKugouByCellphone, sendKugouCaptcha } from "@/utils/kugouAuth";

const emit = defineEmits<{
  saveLogin: [result: { ok: boolean; message: string }];
}>();

const mobile = ref<string>("");
const code = ref<string>("");
const loading = ref<boolean>(false);
const sending = ref<boolean>(false);
const countdown = ref<number>(0);
let timer: ReturnType<typeof setInterval> | null = null;

const stopTimer = () => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
};

/** 发送验证码成功后开始倒计时（60s 内禁止重发） */
const startCountdown = (seconds = 60) => {
  stopTimer();
  countdown.value = seconds;
  timer = setInterval(() => {
    countdown.value -= 1;
    if (countdown.value <= 0) stopTimer();
  }, 1000);
};

/** 发送验证码 */
const sendCode = async () => {
  if (countdown.value > 0 || sending.value) return;
  sending.value = true;
  const { ok, message } = await sendKugouCaptcha(mobile.value);
  sending.value = false;
  if (ok) {
    window.$message.success(message);
    startCountdown();
  } else {
    window.$message.error(message);
  }
};

/** 登录 */
const login = async () => {
  if (loading.value) return;
  loading.value = true;
  const result = await loginKugouByCellphone(mobile.value, code.value);
  loading.value = false;
  emit("saveLogin", result);
};

onBeforeUnmount(stopTimer);
</script>

<style lang="scss" scoped>
.kugou-phone {
  .n-input {
    width: 100%;
  }
  .code-row {
    margin: 12px 0;
    .send {
      width: 130px;
      min-width: 130px;
    }
  }
  .tip {
    display: block;
    margin-top: 10px;
    font-size: 12px;
    line-height: 1.6;
  }
}
</style>
