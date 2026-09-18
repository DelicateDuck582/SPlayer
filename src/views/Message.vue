<!-- 消息中心（npm 版 API：/msg/private、/msg/comments、/msg/forwards、/msg/notices、/send/text） -->
<template>
  <div class="message-view">
    <div class="title">
      <n-text class="name">消息中心</n-text>
      <n-text class="tip" depth="3">私信、评论、@我 与通知</n-text>
    </div>
    <n-tabs v-model:value="activeTab" class="tabs" type="segment" animated>
      <n-tab-pane name="private" tab="私信">
        <n-spin :show="loading">
          <n-list v-if="sessions.length" hoverable clickable>
            <n-list-item v-for="item in sessions" :key="item.id" @click="openSession(item)">
              <n-flex align="center" justify="space-between">
                <n-flex align="center">
                  <n-avatar round :size="40" :src="item.avatarUrl" />
                  <div class="session">
                    <n-text class="nickname">{{ item.nickname || `用户 ${item.id}` }}</n-text>
                    <n-text class="last" depth="3">{{ item.lastMessage || "" }}</n-text>
                  </div>
                </n-flex>
                <n-flex align="center">
                  <n-badge v-if="item.unreadCount" :value="item.unreadCount" />
                  <n-text depth="3" class="time">{{ item.time || "" }}</n-text>
                </n-flex>
              </n-flex>
            </n-list-item>
          </n-list>
          <n-empty v-else description="暂无会话" size="small" />
        </n-spin>
      </n-tab-pane>
      <n-tab-pane v-for="tab in noticeTabs" :key="tab.name" :name="tab.name" :tab="tab.label">
        <n-spin :show="loading">
          <n-list v-if="lists[tab.name]?.length" hoverable>
            <n-list-item v-for="(item, index) in lists[tab.name]" :key="item.id ?? index">
              <n-flex vertical>
                <n-text class="notice-title">{{ item.title || "通知" }}</n-text>
                <n-text depth="3" class="notice-content">{{ item.lastMessage || "" }}</n-text>
                <n-text depth="3" class="time">{{ item.time || "" }}</n-text>
              </n-flex>
            </n-list-item>
          </n-list>
          <n-empty v-else description="暂无内容" size="small" />
        </n-spin>
      </n-tab-pane>
    </n-tabs>

    <!-- 私信会话（抽屉） -->
    <n-drawer v-model:show="showSession" :width="480" placement="right">
      <n-drawer-content :title="currentSession?.nickname || '私信'">
        <n-spin :show="sessionLoading">
          <n-flex vertical class="history">
            <div v-for="(msg, index) in history" :key="index" class="msg">
              <n-avatar round :size="30" :src="msg.avatarUrl" />
              <n-text class="msg-text">{{ msg.text }}</n-text>
            </div>
            <n-empty
              v-if="!history.length && !sessionLoading"
              description="暂无消息"
              size="small"
            />
          </n-flex>
        </n-spin>
        <template #footer>
          <n-flex align="center">
            <n-input
              v-model:value="sendContent"
              placeholder="输入私信内容"
              :maxlength="200"
              @keyup.enter="sendMessage"
            />
            <n-button
              :focusable="false"
              type="primary"
              strong
              secondary
              round
              :loading="sending"
              :disabled="!sendContent.trim()"
              @click="sendMessage"
            >
              发送
            </n-button>
          </n-flex>
        </template>
      </n-drawer-content>
    </n-drawer>
  </div>
</template>

<script setup lang="ts">
import type { NeteaseMessageItem } from "@/types/netease";
import {
  msgComments,
  msgForwards,
  msgNotices,
  msgPrivate,
  msgPrivateHistory,
  sendText,
} from "@/api/netease";
import { formatTimestamp } from "@/utils/time";

const loading = ref<boolean>(false);
const activeTab = ref<string>("private");
/** 私信会话 */
const sessions = ref<NeteaseMessageItem[]>([]);
/** 通知类列表 */
const lists = ref<Record<string, NeteaseMessageItem[]>>({
  comments: [],
  forwards: [],
  notices: [],
});

/** 通知类 Tab */
const noticeTabs = [
  { name: "comments", label: "评论" },
  { name: "forwards", label: "@我" },
  { name: "notices", label: "通知" },
];

/** 当前会话与消息 */
const showSession = ref<boolean>(false);
const currentSession = ref<NeteaseMessageItem | null>(null);
const sessionLoading = ref<boolean>(false);
const history = ref<Array<{ text: string; avatarUrl?: string; nickname?: string }>>([]);
const sendContent = ref<string>("");
const sending = ref<boolean>(false);

/** 上游时间字段可能是时间戳或字符串 */
const formatTime = (time?: number | string) => {
  if (!time) return "";
  if (typeof time === "number") return formatTimestamp(time);
  const timestamp = Number(time);
  return Number.isNaN(timestamp) ? String(time) : formatTimestamp(timestamp);
};

/** 拉取私信会话 */
const getSessions = async () => {
  const result = await msgPrivate();
  sessions.value = (result?.msgs ?? []).map((item: any) => ({
    id: item?.id ?? item?.userId,
    nickname: item?.nickname ?? item?.fromUser?.nickname,
    avatarUrl: item?.avatarUrl ?? item?.fromUser?.avatarUrl,
    lastMessage: item?.lastMsg ?? item?.lastMessage,
    unreadCount: item?.unreadCount,
    time: formatTime(item?.time),
  }));
};

/** 拉取通知类数据 */
const getNotices = async () => {
  const [commentsResult, forwardsResult, noticesResult] = await Promise.allSettled([
    msgComments(),
    msgForwards(),
    msgNotices(),
  ]);
  const pick = (result: PromiseSettledResult<any>, key: string) =>
    result.status === "fulfilled"
      ? ((result.value?.[key] ?? result.value?.data ?? []) as any[]).map((item) => ({
          id: item?.id,
          title: item?.title ?? item?.comment?.content?.slice(0, 20) ?? "通知",
          lastMessage: item?.lastMessage ?? item?.comment?.content ?? item?.msg ?? "",
          time: formatTime(item?.time),
        }))
      : [];
  lists.value = {
    comments: pick(commentsResult, "comments"),
    forwards: pick(forwardsResult, "forwards"),
    notices: pick(noticesResult, "notices"),
  };
};

/** 打开会话并读取历史消息 */
const openSession = async (item: NeteaseMessageItem) => {
  currentSession.value = item;
  showSession.value = true;
  sessionLoading.value = true;
  try {
    const result: any = await msgPrivateHistory(Number(item.id), 30);
    const source: any[] = result?.msgs ?? result?.data?.msgs ?? [];
    history.value = source
      .map((msg) => {
        const fromUser = msg?.fromUser ?? msg?.user ?? {};
        return {
          text: msg?.text ?? msg?.msg ?? "",
          avatarUrl: fromUser?.avatarUrl,
          nickname: fromUser?.nickname,
        };
      })
      .reverse()
      .filter((msg) => msg.text);
  } finally {
    sessionLoading.value = false;
  }
};

/** 发送私信 */
const sendMessage = async () => {
  const content = sendContent.value.trim();
  if (!content || !currentSession.value?.id) return;
  sending.value = true;
  try {
    const result: any = await sendText(String(currentSession.value.id), content);
    if (result?.code === 200) {
      history.value.push({ text: content });
      sendContent.value = "";
    } else {
      window.$message?.warning(result?.message ?? "发送失败，请稍后再试");
    }
  } finally {
    sending.value = false;
  }
};

/** 拉取全部数据 */
const getMessageData = async () => {
  loading.value = true;
  try {
    await Promise.allSettled([getSessions(), getNotices()]);
  } finally {
    loading.value = false;
  }
};

onMounted(getMessageData);
</script>

<style lang="scss" scoped>
.message-view {
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
  .session {
    margin-left: 10px;
    .nickname {
      display: block;
      font-weight: bold;
    }
    .last {
      display: block;
      font-size: 12px;
      max-width: 320px;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
  }
  .notice-title {
    font-weight: bold;
  }
  .notice-content {
    font-size: 13px;
    margin-top: 4px;
  }
  .time {
    font-size: 12px;
  }
  .history {
    gap: 10px;
    .msg {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      .msg-text {
        background: var(--n-action-color);
        border-radius: 10px;
        padding: 6px 10px;
        font-size: 13px;
        word-break: break-all;
      }
    }
  }
}
</style>
