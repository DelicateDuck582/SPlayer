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
          <div v-if="lists[tab.name]?.length" class="notice-list">
            <div
              v-for="(item, index) in lists[tab.name]"
              :key="item.id ?? index"
              class="notice-item"
              :class="{ clickable: !!item.resource }"
              @click="openResource(item.resource)"
            >
              <n-avatar round :size="38" :src="item.avatarUrl" />
              <div class="notice-main">
                <n-flex align="center" justify="space-between" :wrap="false">
                  <n-text class="notice-title">{{ item.title || "通知" }}</n-text>
                  <n-text depth="3" class="time">{{ item.time || "" }}</n-text>
                </n-flex>
                <n-text class="notice-content">{{ item.text || "" }}</n-text>
                <!-- 结构化资源卡片：专辑 / 歌曲 / 歌单 / MV / 视频 / 电台节目 -->
                <div v-if="item.resource" class="resource-card">
                  <img class="resource-cover" :src="item.resource.cover" loading="lazy" alt="" />
                  <div class="resource-info">
                    <n-text class="resource-name" :title="item.resource.name">
                      {{ item.resource.name }}
                    </n-text>
                    <n-text depth="3" class="resource-sub">{{ item.resource.sub }}</n-text>
                  </div>
                  <n-tag :bordered="false" round size="tiny" type="info">
                    {{ resourceLabel(item.resource.type) }}
                  </n-tag>
                  <SvgIcon class="resource-arrow" name="Right" />
                </div>
                <!-- 正文里的图片（限尺寸显示，点击放大） -->
                <div v-if="item.images?.length" class="msg-images">
                  <img
                    v-for="(src, i) in item.images"
                    :key="i"
                    class="msg-image"
                    :class="{ emoji: isEmojiImage(src) }"
                    :src="src"
                    loading="lazy"
                    alt=""
                    @click.stop="previewImage(src)"
                  />
                </div>
              </div>
            </div>
          </div>
          <n-empty v-else description="暂无内容" size="small" />
        </n-spin>
      </n-tab-pane>
    </n-tabs>

    <!-- 私信会话（抽屉） -->
    <n-drawer v-model:show="showSession" :width="drawerWidth" placement="right">
      <n-drawer-content class="chat-drawer" :title="currentSession?.nickname || '私信'" closable>
        <n-spin :show="sessionLoading">
          <div ref="historyRef" class="history">
            <template v-for="(msg, index) in history" :key="index">
              <!-- 时间分隔（微信式：相隔超过 5 分钟显示一次） -->
              <n-text v-if="showTimeAt(index)" class="time-divider" depth="3">
                {{ msg.time }}
              </n-text>
              <div
                class="msg"
                :class="{ self: msg.self, pending: msg.pending, failed: msg.failed }"
              >
                <n-avatar v-if="!msg.self" round :size="32" :src="msg.avatarUrl" />
                <div class="bubble">
                  <n-text v-if="msg.text" class="msg-text">{{ msg.text }}</n-text>
                  <!-- 分享类消息（歌曲 / 歌单 / MV …）以卡片展示 -->
                  <div
                    v-if="msg.resource"
                    class="resource-card"
                    @click="openResource(msg.resource)"
                  >
                    <img class="resource-cover" :src="msg.resource.cover" loading="lazy" alt="" />
                    <div class="resource-info">
                      <n-text class="resource-name" :title="msg.resource.name">
                        {{ msg.resource.name }}
                      </n-text>
                      <n-text depth="3" class="resource-sub">{{ msg.resource.sub }}</n-text>
                    </div>
                    <n-tag :bordered="false" round size="tiny" type="info">
                      {{ resourceLabel(msg.resource.type) }}
                    </n-tag>
                  </div>
                  <!-- 消息里的图片（限尺寸显示，点击放大） -->
                  <div v-if="msg.images?.length" class="msg-images">
                    <img
                      v-for="(src, i) in msg.images"
                      :key="i"
                      class="msg-image"
                      :class="{ emoji: isEmojiImage(src) }"
                      :src="src"
                      loading="lazy"
                      alt=""
                      @click="previewImage(src)"
                    />
                  </div>
                </div>
                <n-avatar v-if="msg.self" round :size="32" :src="myAvatar" />
              </div>
              <n-text v-if="msg.pending || msg.failed" class="send-state" depth="3">
                {{ msg.failed ? "发送失败，内容已回填到输入框" : "发送中…" }}
              </n-text>
            </template>
            <n-empty
              v-if="!history.length && !sessionLoading"
              description="暂无消息"
              size="small"
              style="margin-top: 20px"
            />
          </div>
        </n-spin>
        <template #footer>
          <!-- 微信式输入条：表情 · 自适应输入框 · 发送 -->
          <div class="composer">
            <n-popover trigger="click" placement="top-start" :show-arrow="false">
              <template #trigger>
                <n-button class="tool" quaternary circle :focusable="false" :disabled="sending">
                  <template #icon>
                    <SvgIcon name="Chat" />
                  </template>
                </n-button>
              </template>
              <n-flex class="emoji-list" :size="4">
                <n-button
                  v-for="emoji in EMOJIS"
                  :key="emoji"
                  quaternary
                  size="small"
                  @click="insertEmoji(emoji)"
                >
                  {{ emoji }}
                </n-button>
              </n-flex>
            </n-popover>
            <div class="composer-input">
              <n-input
                ref="inputRef"
                v-model:value="sendContent"
                type="textarea"
                class="composer-textarea"
                placeholder="发消息…"
                :autosize="{ minRows: 1, maxRows: 5 }"
                :maxlength="500"
                :disabled="sending"
                @keydown="handleKeydown"
              />
              <n-text v-if="sendContent.length > 380" class="counter" depth="3">
                {{ sendContent.length }}/500
              </n-text>
            </div>
            <n-button
              class="send"
              :focusable="false"
              round
              strong
              :type="canSend ? 'primary' : 'default'"
              :disabled="!canSend"
              :loading="sending"
              @click="sendMessage"
            >
              发送
            </n-button>
          </div>
        </template>
      </n-drawer-content>
    </n-drawer>

    <!-- 图片预览（限制在视口内，避免出现横向滚动条） -->
    <n-modal
      v-model:show="previewVisible"
      preset="card"
      style="width: min(720px, 92vw)"
      title="图片预览"
    >
      <div class="msg-preview">
        <img class="preview-image" :src="previewSrc" alt="" />
      </div>
    </n-modal>
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
import { songDetail } from "@/api/song";
import { formatSongsList } from "@/utils/format";
import { usePlayerController } from "@/core/player/PlayerController";
import {
  isEmojiImage,
  parseMessageContent,
  toPreviewText,
  type MessageResource,
} from "@/utils/messageContent";

const router = useRouter();
const dataStore = useDataStore();
const player = usePlayerController();

/** 通知 / 评论 / @我 条目 */
interface NoticeItem {
  id?: number;
  title: string;
  text: string;
  time: string;
  ts: number;
  avatarUrl?: string;
  nickname?: string;
  resource?: MessageResource;
  /** 正文里的图片 */
  images?: string[];
}

const loading = ref<boolean>(false);
const activeTab = ref<string>("private");
/** 私信会话 */
const sessions = ref<NeteaseMessageItem[]>([]);
/** 通知类列表 */
const lists = ref<Record<string, NoticeItem[]>>({
  comments: [],
  forwards: [],
  notices: [],
});
/** 快捷表情（插入到输入框） */
const EMOJIS = ["😀", "😂", "🥰", "👍", "🎵", "🎧", "❤️", "🙏", "🎉", "😭"];
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
    /** 消息附带的资源（分享歌曲 / 歌单等，以卡片展示） */
    resource?: MessageResource;
    /** 消息里的图片（已限尺寸渲染） */
    images?: string[];
    avatarUrl?: string;
    nickname?: string;
    time?: string;
    /** 原始时间戳（用于气泡时间分隔） */
    ts?: number;
    self?: boolean;
    pending?: boolean;
    failed?: boolean;
  }>
>([]);
const sendContent = ref<string>("");
const sending = ref<boolean>(false);
/** 输入框实例（发送后保持焦点 / 表情插入后聚焦） */
const inputRef = ref<any>(null);
/** 是否可发送 */
const canSend = computed<boolean>(
  () => !!sendContent.value.trim() && !sending.value && !!currentSession.value?.id,
);
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

/** 图片预览（点击消息里的图片放大查看） */
const previewSrc = ref<string>("");
const previewVisible = computed({
  get: () => !!previewSrc.value,
  set: (value: boolean) => {
    if (!value) previewSrc.value = "";
  },
});
const previewImage = (src: string) => {
  previewSrc.value = src;
};

/** Enter 发送、Shift + Enter 换行（避开输入法组词状态） */
const handleKeydown = (event: KeyboardEvent) => {
  if (event.key !== "Enter" || event.shiftKey) return;
  if (event.isComposing || event.keyCode === 229) return;
  event.preventDefault();
  sendMessage();
};

/** 插入表情并保持焦点 */
const insertEmoji = (emoji: string) => {
  sendContent.value += emoji;
  nextTick(() => inputRef.value?.focus?.());
};

/** 是否在指定消息前显示时间分隔（与上一条相隔超过 5 分钟） */
const showTimeAt = (index: number) => {
  const current = history.value[index];
  if (!current?.ts) return false;
  const prev = history.value[index - 1];
  if (!prev?.ts) return true;
  return current.ts - prev.ts > 5 * 60 * 1000;
};

/** 资源类型文案 */
const resourceLabel = (type: MessageResource["type"]) =>
  ({
    album: "专辑",
    song: "歌曲",
    playlist: "歌单",
    mv: "MV",
    video: "视频",
    program: "节目",
    dj: "电台",
  })[type] ?? "内容";

/** 打开消息里的结构化资源（歌曲直接播放，其余跳转对应页面） */
const openResource = async (resource?: MessageResource) => {
  if (!resource) return;
  if (resource.type === "song") {
    // 歌曲：直接加入播放（先取详情补全元数据；歌曲 id 必为数字）
    const detail: any = await songDetail(Number(resource.id));
    const song = detail?.songs?.[0];
    if (song) {
      player.updatePlayList(formatSongsList([song]));
      return;
    }
  }
  const routeName = {
    album: "album",
    playlist: "playlist",
    mv: "mv",
    video: "video",
    program: "radio",
    dj: "radio",
    song: "album",
  }[resource.type] as string;
  router.push({ name: routeName, query: { id: resource.id } });
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
        lastMessage: toPreviewText(
          parseMessageContent(item?.lastMsg ?? item?.lastMessage ?? item?.msg).text,
          60,
        ),
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
  const pick = (result: PromiseSettledResult<any>, key: string): NoticeItem[] => {
    if (result.status !== "fulfilled") return [];
    const value: any = result.value;
    if (value?.code !== undefined && value.code !== 200) {
      if (!errorText.value) {
        errorText.value = `通知加载失败：${value?.message ?? value?.msg ?? `code ${value?.code}`}`;
      }
      return [];
    }
    const raw: any[] = value?.[key] ?? value?.data?.[key] ?? value?.data ?? [];
    return (Array.isArray(raw) ? raw : []).map((item: any) => {
      const ts = Number(item?.time ?? item?.createTime ?? 0);
      const nickname =
        item?.user?.nickname ?? item?.fromUser?.nickname ?? item?.comment?.user?.nickname;
      const avatarUrl =
        item?.user?.avatarUrl ?? item?.fromUser?.avatarUrl ?? item?.comment?.user?.avatarUrl;
      // 统一解析：JSON 串 / HTML / 对象 → 纯文本 + 可选资源卡片
      const parsed = parseMessageContent(item);
      return {
        id: item?.id,
        title: String(
          item?.title ??
            item?.notice?.title ??
            (nickname ? nickname : key === "forwards" ? "有人提到了我" : "通知"),
        ),
        text: parsed.text,
        time: formatTime(ts),
        ts,
        avatarUrl,
        nickname,
        resource: parsed.resource,
        images: parsed.images,
      };
    });
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
        // 统一解析：分享类消息的 msg 是 JSON 串（含 song/playlist 等资源）
        const parsed = parseMessageContent(msg?.msg ?? msg?.text ?? msg?.content ?? msg);
        return {
          text: parsed.text,
          resource: parsed.resource,
          images: parsed.images,
          avatarUrl: fromUser?.avatarUrl ?? msg?.avatarUrl,
          nickname: fromUser?.nickname,
          time: formatTime(msg?.time ?? msg?.createTime ?? msg?.sendTime),
          ts: Number(msg?.time ?? msg?.createTime ?? msg?.sendTime ?? 0),
          self: myUid.value > 0 && fromUid === myUid.value,
        };
      })
      .filter((msg) => msg.text || msg.resource)
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
    ts: Date.now(),
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
    nextTick(() => inputRef.value?.focus?.());
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

<style lang="scss">
/**
 * 私信抽屉（n-drawer）与图片预览（n-modal）会被 naive-ui Teleport 渲染到 body，
 * scoped 样式会编译为 `.message-view[data-v-*] …`，无法命中抽屉/弹窗内部
 * （此前「图片限尺寸、输入区压扁、消息区铺满」因此完全没生效）。
 * 改为以组件唯一的 class 作为作用域根，写成全局样式：
 * .message-view（消息中心页面）、.chat-drawer（私信抽屉）、.msg-preview（图片预览）。
 */
.message-view,
.chat-drawer {
  /* ===== 共用：结构化资源卡片（通知卡片与私信气泡） ===== */
  .resource-card {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 8px;
    padding: 8px 10px;
    border-radius: 10px;
    background: var(--n-color-modal, rgba(128, 128, 128, 0.08));
    cursor: pointer;
    transition: transform 0.2s var(--n-bezier);
    &:hover {
      transform: translateY(-1px);
    }
    .resource-cover {
      flex-shrink: 0;
      width: 46px;
      height: 46px;
      border-radius: 8px;
      object-fit: cover;
      background: var(--n-border-color);
    }
    .resource-info {
      flex: 1;
      min-width: 0;
      .resource-name {
        display: block;
        font-size: 14px;
        font-weight: bold;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
      .resource-sub {
        display: block;
        font-size: 12px;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
    }
    .resource-arrow {
      font-size: 16px;
      opacity: 0.5;
    }
  }
  /* ===== 共用：消息 / 通知里的图片，限制尺寸，绝不按原图撑破容器 ===== */
  .msg-images {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    max-width: 100%;
    min-width: 0;
    overflow: hidden;
    .msg-image {
      display: block;
      width: auto;
      height: auto;
      /* 双重上限：容器宽度 + 260px 硬上限，保证一定装得进聊天栏 */
      max-width: min(100%, 260px);
      max-height: 200px;
      object-fit: contain;
      border-radius: 8px;
      cursor: zoom-in;
      background: var(--n-border-color);
      /* 表情图按行内小图渲染 */
      &.emoji {
        width: 1.4em;
        height: 1.4em;
        max-height: 1.4em;
        object-fit: contain;
        border-radius: 2px;
        vertical-align: text-bottom;
      }
    }
  }
}
.message-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  /* 只允许纵向滚动，避免页面底部出现可拖拽的横向滚动条 */
  overflow-y: auto;
  overflow-x: hidden;
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
    /* 标题过长时省略：避免撑破卡片，导致页面出现横向滚动条 */
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .notice-content {
    display: block;
    font-size: 13px;
    line-height: 1.6;
    margin-top: 4px;
    // 长文本（超长评论 / 未解析内容）不撑破卡片
    overflow-wrap: anywhere;
    word-break: break-word;
    white-space: pre-wrap;
    max-height: 320px;
    overflow-y: auto;
  }
  .time {
    flex-shrink: 0;
    font-size: 12px;
  }
  .alert {
    margin-bottom: 10px;
    border-radius: 10px;
  }
  /* 通知 / 评论 / @我：微信式卡片列表 */
  .notice-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    .notice-item {
      display: flex;
      gap: 10px;
      padding: 10px 12px;
      border-radius: 12px;
      min-width: 0;
      background: var(--n-action-color);
      &.clickable {
        cursor: pointer;
        transition: transform 0.2s var(--n-bezier);
        &:hover {
          transform: translateY(-1px);
        }
      }
      .notice-main {
        flex: 1;
        min-width: 0;
      }
    }
  }
}
/* ===== 私信抽屉：内容被 Teleport 到 body，必须使用全局样式 ===== */
.chat-drawer {
  /* 微信式输入条（压扁：单行高度约 32px） */
  .composer {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    width: 100%;
    .tool {
      flex-shrink: 0;
      width: 32px;
      height: 32px;
    }
    .composer-input {
      position: relative;
      flex: 1;
      min-width: 0;
      .counter {
        position: absolute;
        right: 10px;
        bottom: 4px;
        font-size: 11px;
      }
      .n-input,
      .n-input__border,
      .n-input__state-border {
        border-radius: 16px;
      }
      /* 去掉 textarea 的默认大内边距与最小高度，避免输入区出现大片空白 */
      .n-input__textarea-el {
        padding: 5px 46px 5px 12px;
        min-height: 22px;
        line-height: 22px;
        resize: none;
      }
    }
    .send {
      flex-shrink: 0;
      height: 32px;
      min-width: 60px;
      padding: 0 14px;
    }
  }
  /* 抽屉：消息区铺满剩余高度、输入区贴底，且杜绝横向滚动条 */
  .n-drawer-body-content-wrapper {
    display: flex;
    flex-direction: column;
    padding: 10px 12px 0;
    min-width: 0;
    overflow-x: hidden;
  }
  /* n-spin 容器也要铺满，内部消息区才能撑开 */
  .n-spin-container,
  .n-spin-content {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    min-width: 0;
    overflow-x: hidden;
  }
  .n-drawer-footer {
    padding: 8px 12px;
  }
  /* 会话消息区（微信式气泡；消息不足时贴底显示） */
  .history {
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex: 1;
    min-height: 0;
    min-width: 0;
    /* 只允许纵向滚动：避免消息区底部出现可拖拽的横向滚动条 */
    overflow-y: auto;
    overflow-x: hidden;
    padding-right: 4px;
    > :first-child {
      margin-top: auto;
    }
    .time-divider {
      align-self: center;
      margin: 6px 0;
      padding: 1px 8px;
      border-radius: 8px;
      font-size: 11px;
      background: var(--n-action-color);
    }
    .msg {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      width: 100%;
      max-width: 100%;
      min-width: 0;
      .bubble {
        display: flex;
        flex-direction: column;
        gap: 6px;
        /* 气泡宽度由内容决定（fit-content）且限制在 76% 内，
           内部图片的百分比宽度才有确定的参照，不会撑出横向滚动条 */
        width: fit-content;
        max-width: 76%;
        min-width: 0;
        .msg-text {
          padding: 8px 12px;
          border-radius: 12px;
          font-size: 14px;
          line-height: 1.6;
          white-space: pre-wrap;
          // 长文本（含未解析的 JSON / 超长评论）不做横向撑爆，纵向超高时可滚动
          overflow-wrap: anywhere;
          word-break: break-word;
          max-height: 320px;
          overflow-y: auto;
          background: var(--n-action-color);
        }
      }
      // 自己的消息靠右，并使用主题色气泡
      &.self {
        flex-direction: row;
        justify-content: flex-end;
        .bubble .msg-text {
          background: var(--n-primary-color-suppl, var(--n-action-color));
        }
      }
      &.pending .msg-text {
        opacity: 0.65;
      }
      &.failed .msg-text {
        outline: 1px solid var(--n-error-color, #d03050);
      }
    }
    .send-state {
      align-self: flex-end;
      margin: -4px 42px 0 0;
      font-size: 11px;
    }
  }
}
/* ===== 图片预览：n-modal 同样被 Teleport 到 body，需独立根类 ===== */
.msg-preview {
  .preview-image {
    display: block;
    width: 100%;
    max-height: 70vh;
    object-fit: contain;
    border-radius: 8px;
  }
}
</style>
