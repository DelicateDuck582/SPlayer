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
          <!-- 后端错误可见（例如 301 需要登录），避免"一片空白" -->
          <n-alert v-if="errorText" type="warning" :bordered="false" class="alert">
            {{ errorText }}
          </n-alert>
          <n-list v-if="sessions.length" hoverable clickable>
            <n-list-item v-for="item in sessions" :key="item.id" @click="openSession(item)">
              <n-flex align="center" justify="space-between" :wrap="false">
                <n-flex align="center" :wrap="false" class="session-main">
                  <n-avatar round :size="40" :src="item.avatarUrl" />
                  <div class="session">
                    <n-text class="nickname">{{ item.nickname || `用户 ${item.id}` }}</n-text>
                    <n-text class="last" depth="3">{{
                      item.lastMessage || "（暂无消息内容）"
                    }}</n-text>
                  </div>
                </n-flex>
                <n-flex align="center" :wrap="false">
                  <n-badge v-if="item.unreadCount" :value="item.unreadCount" :max="99" />
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
          <n-alert v-if="errorText" type="warning" :bordered="false" class="alert">
            {{ errorText }}
          </n-alert>
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
    <n-drawer v-model:show="showSession" :width="drawerWidth" placement="right">
      <n-drawer-content :title="currentSession?.nickname || '私信'" closable>
        <n-spin :show="sessionLoading">
          <div ref="historyRef" class="history">
            <div
              v-for="(msg, index) in history"
              :key="index"
              class="msg"
              :class="{ self: msg.self, pending: msg.pending, failed: msg.failed }"
            >
              <n-avatar v-if="!msg.self" round :size="30" :src="msg.avatarUrl" />
              <div class="bubble">
                <n-text class="msg-text">{{ msg.text }}</n-text>
                <n-text v-if="msg.time || msg.pending || msg.failed" class="msg-time" depth="3">
                  {{ msg.failed ? "发送失败" : msg.pending ? "发送中…" : msg.time }}
                </n-text>
              </div>
              <n-avatar v-if="msg.self" round :size="30" :src="myAvatar" />
            </div>
            <n-empty
              v-if="!history.length && !sessionLoading"
              description="暂无消息"
              size="small"
              style="margin-top: 20px"
            />
          </div>
        </n-spin>
        <template #footer>
          <div class="send-bar">
            <n-input
              v-model:value="sendContent"
              type="textarea"
              placeholder="输入私信内容（Enter 发送，Shift + Enter 换行）"
              :autosize="{ minRows: 1, maxRows: 4 }"
              :maxlength="200"
              :disabled="sending"
              @keydown="handleKeydown"
            />
            <n-button
              :focusable="false"
              type="primary"
              strong
              secondary
              round
              :loading="sending"
              :disabled="!sendContent.trim() || !currentSession?.id"
              @click="sendMessage"
            >
              发送
            </n-button>
          </div>
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
import { useDataStore } from "@/stores";

const dataStore = useDataStore();

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
/** 后端错误提示（例如 301 需要登录），避免页面"一片空白" */
const errorText = ref<string>("");

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
const historyRef = ref<HTMLElement | null>(null);
/** 历史消息（`self` 用于区分自己发出的消息，`pending/failed` 表示发送状态） */
const history = ref<
  Array<{
    text: string;
    avatarUrl?: string;
    nickname?: string;
    time?: string;
    self?: boolean;
    pending?: boolean;
    failed?: boolean;
  }>
>([]);
const sendContent = ref<string>("");
const sending = ref<boolean>(false);
/** 我的头像与 uid（用于消息左右对齐） */
const myAvatar = computed<string>(() => String(dataStore.userData?.avatarUrl ?? ""));
const myUid = computed<number>(() => Number(dataStore.userData?.userId ?? 0));
/** 抽屉宽度：窄屏占满视口 */
const drawerWidth = computed<string>(() =>
  typeof window !== "undefined" && window.innerWidth < 560 ? "100%" : "480",
);

/** 滚动到消息底部 */
const scrollToBottom = () => {
  nextTick(() => {
    const el = historyRef.value;
    if (el) el.scrollTop = el.scrollHeight;
  });
};

/** Enter 发送、Shift + Enter 换行（避开输入法组词状态） */
const handleKeydown = (event: KeyboardEvent) => {
  if (event.key !== "Enter" || event.shiftKey) return;
  if (event.isComposing || event.keyCode === 229) return;
  event.preventDefault();
  sendMessage();
};

/** 上游时间字段可能是时间戳或字符串 */
const formatTime = (time?: number | string) => {
  if (!time) return "";
  if (typeof time === "number") return formatTimestamp(time);
  const timestamp = Number(time);
  return Number.isNaN(timestamp) ? String(time) : formatTimestamp(timestamp);
};

/** 拉取私信会话（对上游字段做多形态兼容） */
const getSessions = async () => {
  const result: any = await msgPrivate();
  if (result?.code !== undefined && result.code !== 200) {
    errorText.value = `会话加载失败：${result?.message ?? result?.msg ?? `code ${result?.code}`}`;
    sessions.value = [];
    return;
  }
  const raw: any[] = result?.msgs ?? result?.data?.msgs ?? result?.data?.sessions ?? [];
  sessions.value = (Array.isArray(raw) ? raw : [])
    .map((item: any) => {
      const peer = item?.fromUser ?? item?.user ?? item?.peer ?? item?.toUser ?? {};
      return {
        id: Number(item?.id ?? item?.userId ?? peer?.userId ?? 0),
        nickname: item?.nickname ?? peer?.nickname,
        avatarUrl: item?.avatarUrl ?? peer?.avatarUrl,
        lastMessage: String(item?.lastMsg ?? item?.lastMessage ?? item?.msg ?? ""),
        unreadCount: Number(item?.unreadCount ?? item?.newMsgCount ?? 0),
        time: formatTime(item?.lastMsgTime ?? item?.time ?? item?.createTime),
      };
    })
    .filter((item) => item.id > 0);
};

/** 拉取通知类数据 */
const getNotices = async () => {
  const [commentsResult, forwardsResult, noticesResult] = await Promise.allSettled([
    msgComments(),
    msgForwards(),
    msgNotices(),
  ]);
  const pick = (result: PromiseSettledResult<any>, key: string) => {
    if (result.status !== "fulfilled") return [];
    const value: any = result.value;
    if (value?.code !== undefined && value.code !== 200) {
      if (!errorText.value) {
        errorText.value = `通知加载失败：${value?.message ?? value?.msg ?? `code ${value?.code}`}`;
      }
      return [];
    }
    const raw: any[] = value?.[key] ?? value?.data?.[key] ?? value?.data ?? [];
    return (Array.isArray(raw) ? raw : []).map((item) => ({
      id: item?.id,
      title: String(
        (item?.title ??
          item?.notice?.title ??
          item?.comment?.content?.slice(0, 16) ??
          key === "forwards")
          ? "有人提到了我"
          : "通知",
      ),
      lastMessage: String(
        item?.lastMessage ??
          item?.comment?.content ??
          item?.notice?.content ??
          item?.content ??
          item?.msg ??
          item?.lastForward?.content ??
          "",
      ),
      time: formatTime(item?.time ?? item?.createTime),
    }));
  };
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
  errorText.value = "";
  history.value = [];
  try {
    const result: any = await msgPrivateHistory(Number(item.id), 30);
    if (result?.code !== undefined && result.code !== 200) {
      errorText.value = `私信加载失败：${result?.message ?? result?.msg ?? `code ${result?.code}`}`;
      return;
    }
    const raw: any[] = result?.msgs ?? result?.data?.msgs ?? result?.data ?? [];
    history.value = (Array.isArray(raw) ? raw : [])
      .map((msg: any) => {
        const fromUser = msg?.fromUser ?? msg?.user ?? {};
        const fromUid = Number(fromUser?.userId ?? msg?.fromUserId ?? msg?.userId ?? 0);
        return {
          text: String(msg?.msg ?? msg?.text ?? msg?.content ?? ""),
          avatarUrl: fromUser?.avatarUrl ?? msg?.avatarUrl,
          nickname: fromUser?.nickname,
          time: formatTime(msg?.time ?? msg?.createTime ?? msg?.sendTime),
          self: myUid.value > 0 && fromUid === myUid.value,
        };
      })
      .filter((msg) => msg.text)
      .reverse();
    scrollToBottom();
  } finally {
    sessionLoading.value = false;
  }
};

/** 发送私信（乐观展示：先插入「发送中」气泡，失败可重试） */
const sendMessage = async () => {
  const content = sendContent.value.trim();
  const peerId = Number(currentSession.value?.id ?? 0);
  if (!content || !peerId || sending.value) return;
  sending.value = true;
  const draft = {
    text: content,
    self: true,
    pending: true,
    failed: false,
    time: formatTime(Date.now()),
  };
  history.value.push(draft);
  sendContent.value = "";
  scrollToBottom();
  try {
    const result: any = await sendText(String(peerId), content);
    if (result?.code === 200) {
      draft.pending = false;
      // 后台刷新会话列表（更新最后一条消息与未读数）
      getSessions().catch(() => undefined);
    } else {
      draft.pending = false;
      draft.failed = true;
      sendContent.value = content;
      window.$message?.warning(result?.message ?? result?.msg ?? "发送失败，请稍后再试");
    }
  } catch (error) {
    draft.pending = false;
    draft.failed = true;
    sendContent.value = content;
    window.$message?.error("发送失败，请检查网络后重试");
  } finally {
    sending.value = false;
    scrollToBottom();
  }
};

/** 拉取全部数据 */
const getMessageData = async () => {
  loading.value = true;
  errorText.value = "";
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
  .alert {
    margin-bottom: 10px;
    border-radius: 10px;
  }
  .send-bar {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    width: 100%;
  }
  .history {
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-height: calc(100vh - 180px);
    overflow-y: auto;
    padding-right: 4px;
    .msg {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      // 对方消息靠左，自己消息靠右
      &.self {
        flex-direction: row;
        justify-content: flex-end;
        .bubble {
          align-items: flex-end;
        }
      }
      .bubble {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        max-width: 76%;
        .msg-text {
          background: var(--n-action-color);
          border-radius: 10px;
          padding: 6px 10px;
          font-size: 13px;
          line-height: 1.6;
          white-space: pre-wrap;
          word-break: break-word;
        }
        .msg-time {
          margin-top: 2px;
          font-size: 11px;
        }
      }
      &.pending .msg-text {
        opacity: 0.6;
      }
      &.failed .msg-text {
        outline: 1px solid var(--n-error-color, #d03050);
      }
    }
  }
}
</style>
