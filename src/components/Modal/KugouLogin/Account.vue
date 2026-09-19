<!-- 酷狗账号密码登录（`/login`，部分账号需配套风控验证，失败时建议改用扫码 / Cookie） -->
<template>
  <div class="kugou-account">
    <n-input
      v-model:value="username"
      placeholder="酷狗账号 / 手机号 / 邮箱"
      clearable
      :disabled="loading"
    />
    <n-input
      v-model:value="password"
      type="password"
      show-password-on="click"
      placeholder="请输入密码"
      clearable
      :disabled="loading"
      @keyup.enter="login"
    />
    <n-button type="primary" block :loading="loading" @click="login">登录</n-button>
    <n-text depth="3" class="tip">
      酷狗对账号密码登录有风控验证，若失败请使用「扫码登录」或「Cookie 登录」
    </n-text>
  </div>
</template>

<script setup lang="ts">
import { loginKugouByAccount } from "@/utils/kugouAuth";

const emit = defineEmits<{
  saveLogin: [result: { ok: boolean; message: string }];
}>();

const username = ref<string>("");
const password = ref<string>("");
const loading = ref<boolean>(false);

/** 登录 */
const login = async () => {
  if (loading.value) return;
  loading.value = true;
  const result = await loginKugouByAccount(username.value, password.value);
  loading.value = false;
  emit("saveLogin", result);
};
</script>

<style lang="scss" scoped>
.kugou-account {
  .n-input {
    width: 100%;
    margin-bottom: 12px;
  }
  .tip {
    display: block;
    margin-top: 10px;
    font-size: 12px;
    line-height: 1.6;
  }
}
</style>
