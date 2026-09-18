<!-- 会员中心（npm 版 API：/vip/*、/yunbei/*、/signin/*、/daily_signin） -->
<template>
  <div class="vip-view">
    <div class="title">
      <n-text class="name">会员中心</n-text>
      <n-text class="tip" depth="3">黑胶会员、成长值、云贝与签到</n-text>
    </div>
    <n-spin :show="loading">
      <n-grid :cols="3" :x-gap="16" :y-gap="16" item-responsive responsive="screen">
        <!-- 会员状态 -->
        <n-grid-item span="3 m:2">
          <n-card class="card" :bordered="false">
            <n-flex align="center" justify="space-between">
              <n-flex align="center">
                <n-avatar round :size="56" :src="account?.avatarUrl" />
                <div class="user">
                  <n-text class="nickname">{{ account?.nickname || "未登录" }}</n-text>
                  <n-flex class="tags">
                    <n-tag
                      :type="isVip ? 'warning' : 'default'"
                      :bordered="false"
                      round
                      size="small"
                    >
                      {{ vipName }}
                    </n-tag>
                    <n-tag :bordered="false" round size="small">Lv.{{ vipLevel }}</n-tag>
                  </n-flex>
                </div>
              </n-flex>
              <n-flex vertical align="end">
                <n-text depth="3" class="label">会员到期</n-text>
                <n-text>{{ vipExpireText }}</n-text>
              </n-flex>
            </n-flex>
          </n-card>
        </n-grid-item>
        <!-- 成长值 -->
        <n-grid-item span="3 m:1">
          <n-card class="card" :bordered="false">
            <n-flex vertical>
              <n-text depth="3" class="label">会员成长值</n-text>
              <n-text class="big">{{ growth.progress ?? "-" }}</n-text>
              <n-text depth="3" class="label">
                今日已获取 {{ growth.todayGrowthPoint ?? 0 }} · 可领取
                {{ growth.obtainableGrowthPoint ?? 0 }}
              </n-text>
              <n-button
                :focusable="false"
                :disabled="!(growth.obtainableGrowthPoint > 0)"
                size="small"
                strong
                secondary
                round
                @click="claimGrowthPoint"
              >
                领取成长值
              </n-button>
            </n-flex>
          </n-card>
        </n-grid-item>
        <!-- 云贝与签到 -->
        <n-grid-item span="3 m:1">
          <n-card class="card" :bordered="false">
            <n-flex vertical>
              <n-text depth="3" class="label">云贝</n-text>
              <n-text class="big">{{ yunbei.userPoint ?? "-" }}</n-text>
              <n-text depth="3" class="label">
                PC 签到：{{ yunbei.pcSign ? "已完成" : "未完成" }} · 移动端：
                {{ yunbei.mobileSign ? "已完成" : "未完成" }}
              </n-text>
              <n-flex class="signin-btns">
                <n-button :focusable="false" size="small" strong secondary round @click="doSignin">
                  每日签到
                </n-button>
                <n-button
                  :focusable="false"
                  size="small"
                  strong
                  secondary
                  round
                  @click="doYunbeiSign"
                >
                  云贝签到
                </n-button>
              </n-flex>
            </n-flex>
          </n-card>
        </n-grid-item>
      </n-grid>

      <!-- 会员任务 -->
      <n-card class="card list-card" :bordered="false">
        <template #header>
          <n-flex align="center" justify="space-between">
            <n-text>会员任务</n-text>
            <n-text depth="3" class="label">{{ vipTasks.length }} 项</n-text>
          </n-flex>
        </template>
        <n-list v-if="vipTasks.length" hoverable>
          <n-list-item v-for="(task, index) in vipTasks" :key="index">
            <n-flex align="center" justify="space-between">
              <n-text>{{ task.taskName || task.description || `任务 ${index + 1}` }}</n-text>
              <n-tag
                :type="task.completed ? 'success' : 'default'"
                :bordered="false"
                round
                size="small"
              >
                {{ task.completed ? "已完成" : `+${task.growthPoint ?? 0} 成长值` }}
              </n-tag>
            </n-flex>
          </n-list-item>
        </n-list>
        <n-empty v-else description="暂无任务（登录后可见）" size="small" />
      </n-card>

      <!-- 云贝任务 -->
      <n-card class="card list-card" :bordered="false">
        <template #header>
          <n-flex align="center" justify="space-between">
            <n-text>云贝任务</n-text>
            <n-text depth="3" class="label">{{ yunbeiTaskList.length }} 项</n-text>
          </n-flex>
        </template>
        <n-list v-if="yunbeiTaskList.length" hoverable>
          <n-list-item v-for="(task, index) in yunbeiTaskList" :key="index">
            <n-flex align="center" justify="space-between">
              <n-text>{{ task.taskName || task.description || `任务 ${index + 1}` }}</n-text>
              <n-button
                v-if="!task.completed && task.taskId"
                :focusable="false"
                size="tiny"
                strong
                secondary
                round
                @click="finishYunbeiTask(task)"
              >
                完成
              </n-button>
              <n-tag
                v-else
                :type="task.completed ? 'success' : 'default'"
                :bordered="false"
                round
                size="small"
              >
                {{ task.completed ? "已完成" : (task.statusText ?? "-") }}
              </n-tag>
            </n-flex>
          </n-list-item>
        </n-list>
        <n-empty v-else description="暂无云贝任务" size="small" />
      </n-card>
    </n-spin>
  </div>
</template>

<script setup lang="ts">
import type { NeteaseVipTask, NeteaseYunbeiTask } from "@/types/netease";
import {
  dailySignin,
  userAccount,
  vipGrowthPoint,
  vipGrowthPointGet,
  vipInfoV2,
  vipTasks as fetchVipTasks,
  yunbeiInfo,
  yunbeiSign,
  yunbeiTaskFinish,
  yunbeiTasks as fetchYunbeiTasks,
} from "@/api/netease";
import { formatTimestamp } from "@/utils/time";

const loading = ref<boolean>(false);
/** 账号信息（昵称 / 头像） */
const account = ref<{ nickname?: string; avatarUrl?: string } | null>(null);
/** 会员信息 */
const vip = ref<any>(null);
/** 成长值 */
const growth = ref<any>({});
/** 云贝 */
const yunbei = ref<any>({});
const vipTasks = ref<NeteaseVipTask[]>([]);
const yunbeiTaskList = ref<NeteaseYunbeiTask[]>([]);

/** 是否黑胶会员 */
const isVip = computed<boolean>(
  () => Number(vip.value?.redVipLevel ?? vip.value?.data?.musicPackage?.vipCode ?? 0) > 0,
);
/** 会员名称 */
const vipName = computed<string>(() =>
  isVip.value ? (vip.value?.associator?.vipName ?? "黑胶会员") : "普通用户",
);
/** 会员等级 */
const vipLevel = computed<number>(
  () => Number(vip.value?.data?.redVipLevel ?? growth.value?.level ?? 0) || 0,
);
/** 到期时间 */
const vipExpireText = computed<string>(() => {
  const expire = vip.value?.data?.musicPackage?.expireTime ?? vip.value?.data?.redPlus?.expireTime;
  return expire ? formatTimestamp(expire) : "-";
});

/** 领取成长值 */
const claimGrowthPoint = async () => {
  const result: any = await vipGrowthPointGet();
  window.$message?.[result?.code === 200 ? "success" : "warning"](
    result?.code === 200 ? "成长值领取成功" : (result?.message ?? "领取失败，请稍后再试"),
  );
  await getVipData();
};

/** 每日签到（PC 端） */
const doSignin = async () => {
  const result: any = await dailySignin(1);
  window.$message?.[result?.code === 200 ? "success" : "warning"](
    result?.code === 200
      ? `签到成功，获得 ${result?.point ?? 0} 云贝`
      : (result?.message ?? "签到失败"),
  );
  await getVipData();
};

/** 云贝签到 */
const doYunbeiSign = async () => {
  const result: any = await yunbeiSign();
  window.$message?.[result?.code === 200 ? "success" : "warning"](
    result?.code === 200 ? "云贝签到成功" : (result?.message ?? "云贝签到失败"),
  );
  await getVipData();
};

/** 完成云贝任务 */
const finishYunbeiTask = async (task: NeteaseYunbeiTask) => {
  if (!task.taskId) return;
  const result: any = await yunbeiTaskFinish(task.taskId);
  window.$message?.[result?.code === 200 ? "success" : "warning"](
    result?.code === 200 ? "任务已完成" : (result?.message ?? "任务完成失败"),
  );
  await getVipData();
};

/** 拉取会员中心全部数据（并发请求，单项失败不影响其余） */
const getVipData = async () => {
  loading.value = true;
  try {
    const [accountResult, vipResult, growthResult, yunbeiResult, taskResult, yunbeiTaskResult] =
      await Promise.allSettled([
        userAccount(),
        vipInfoV2(),
        vipGrowthPoint(),
        yunbeiInfo(),
        fetchVipTasks(),
        fetchYunbeiTasks(),
      ]);

    if (accountResult.status === "fulfilled") {
      account.value = accountResult.value?.profile ?? null;
    }
    if (vipResult.status === "fulfilled") vip.value = vipResult.value;
    if (growthResult.status === "fulfilled") growth.value = growthResult.value?.data ?? {};
    if (yunbeiResult.status === "fulfilled") yunbei.value = yunbeiResult.value ?? {};
    if (taskResult.status === "fulfilled") {
      const data: any = taskResult.value?.data;
      vipTasks.value = Array.isArray(data) ? data : (data?.tasks ?? []);
    }
    if (yunbeiTaskResult.status === "fulfilled") {
      const data: any = yunbeiTaskResult.value?.data;
      yunbeiTaskList.value = Array.isArray(data) ? data : (data?.tasks ?? []);
    }
  } finally {
    loading.value = false;
  }
};

onMounted(getVipData);
</script>

<style lang="scss" scoped>
.vip-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: auto;
  .title {
    display: flex;
    align-items: flex-end;
    margin-top: 12px;
    margin-bottom: 16px;
    .name {
      font-size: 30px;
      font-weight: bold;
      margin-right: 8px;
      line-height: normal;
    }
    .tip {
      font-size: 14px;
      line-height: 30px;
    }
  }
  .card {
    border-radius: 12px;
    .user {
      margin-left: 12px;
      .nickname {
        font-size: 18px;
        font-weight: bold;
      }
      .tags {
        margin-top: 6px;
      }
    }
    .label {
      font-size: 12px;
    }
    .big {
      font-size: 26px;
      font-weight: bold;
      margin: 4px 0;
    }
    .signin-btns {
      margin-top: 10px;
    }
  }
  .list-card {
    margin-top: 16px;
  }
}
</style>
