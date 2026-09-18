<template>
  <div class="history">
    <div class="title">
      <n-text class="keyword">最近播放</n-text>
      <n-text class="size" depth="3">共 {{ dataStore.historyList?.length || 0 }} 首</n-text>
    </div>
    <n-flex class="menu">
      <n-button
        :focusable="false"
        :disabled="!dataStore.historyList?.length"
        type="primary"
        strong
        secondary
        round
        v-debounce="() => player.updatePlayList(dataStore.historyList)"
      >
        <template #icon>
          <SvgIcon name="Play" />
        </template>
        播放
      </n-button>
      <n-button
        :focusable="false"
        :disabled="!dataStore.historyList?.length"
        class="more"
        strong
        secondary
        round
        @click="cleanHistory"
      >
        <template #icon>
          <SvgIcon name="Delete" />
        </template>
        清空列表
      </n-button>
    </n-flex>
    <n-tabs
      v-model:value="activeTab"
      class="tabs"
      type="segment"
      animated
      @update:value="getCloudRecord"
    >
      <!-- 云端记录错误可见（例如 301 需要登录） -->
      <n-alert v-if="cloudError" type="warning" :bordered="false" class="alert">
        {{ cloudError }}
      </n-alert>
      <n-tab-pane name="song" tab="歌曲">
        <Transition name="fade" mode="out-in">
          <SongList
            v-if="dataStore.historyList.length > 0"
            :data="dataStore.historyList"
            :loading="true"
            hiddenSize
          />
          <n-empty
            v-else
            description="暂无记录，快去播放一些歌曲吧"
            style="margin-top: 60px"
            size="large"
          >
            <template #icon>
              <SvgIcon name="SearchOff" />
            </template>
          </n-empty>
        </Transition>
      </n-tab-pane>
      <n-tab-pane name="playlist" tab="歌单">
        <CoverList
          v-if="coverList.playlist.length"
          :data="coverList.playlist"
          :loading="false"
          type="playlist"
          :hiddenCover="settingStore.hiddenCovers.playlist"
        />
        <n-empty v-else :description="emptyText" size="small" style="margin-top: 40px" />
      </n-tab-pane>
      <n-tab-pane name="album" tab="专辑">
        <CoverList
          v-if="coverList.album.length"
          :data="coverList.album"
          :loading="false"
          type="album"
          :hiddenCover="settingStore.hiddenCovers.album"
        />
        <n-empty v-else :description="emptyText" size="small" style="margin-top: 40px" />
      </n-tab-pane>
      <n-tab-pane v-for="tab in simpleTabs" :key="tab.name" :name="tab.name" :tab="tab.tab">
        <n-spin :show="cloudLoading">
          <n-list v-if="simpleList[tab.name]?.length" hoverable>
            <n-list-item v-for="(item, index) in simpleList[tab.name]" :key="index">
              <n-flex align="center">
                <img v-if="item.cover" class="mini-cover" :src="item.cover" loading="lazy" alt="" />
                <div class="item-info">
                  <n-text class="item-name" :title="item.name">{{ item.name }}</n-text>
                  <n-text depth="3" class="item-sub">{{ item.sub }}</n-text>
                </div>
              </n-flex>
            </n-list-item>
          </n-list>
          <n-empty
            v-else-if="!cloudLoading"
            :description="emptyText"
            size="small"
            style="margin-top: 40px"
          />
        </n-spin>
      </n-tab-pane>
    </n-tabs>
  </div>
</template>

<script setup lang="ts">
import type { CoverType } from "@/types/main";
import { useDataStore, useSettingStore } from "@/stores";
import { usePlayerController } from "@/core/player/PlayerController";
import {
  recordRecentAlbum,
  recordRecentDj,
  recordRecentPlaylist,
  recordRecentVideo,
  recordRecentVoice,
} from "@/api/netease";
import { formatCoverList } from "@/utils/format";
import { isLogin } from "@/utils/auth";

const player = usePlayerController();
const dataStore = useDataStore();
const settingStore = useSettingStore();

/** 当前 Tab */
const activeTab = ref<string>("song");
const cloudLoading = ref<boolean>(false);
/** 云端最近播放（歌单 / 专辑） */
const coverList = ref<{ playlist: CoverType[]; album: CoverType[] }>({ playlist: [], album: [] });
/** 云端最近播放（视频 / 声音 / 播客） */
const simpleList = ref<Record<string, Array<{ name: string; cover?: string; sub?: string }>>>({
  video: [],
  voice: [],
  dj: [],
});
/** 简易 Tab 定义 */
const simpleTabs = [
  { name: "video", tab: "视频" },
  { name: "voice", tab: "声音" },
  { name: "dj", tab: "播客" },
];
/** 空列表提示（云端记录需要登录） */
const emptyText = computed<string>(() => (isLogin() ? "暂无记录" : "需要登录后查看云端记录"));

/** 从 `/record/recent/*` 响应中取出条目（上游字段层级不一，做兼容） */
const pickItems = (result: any, key: string): any[] => {
  const data = result?.data;
  if (!data) return [];
  if (Array.isArray(data)) return data;
  return data[key] ?? data.list ?? [];
};

/** 取出真正的资源对象：上游可能把资源放在 data / song / video / voice / dj 等字段 */
const pickResource = (item: any): any => {
  if (!item || typeof item !== "object") return {};
  return (
    item.data ??
    item.resource ??
    item.song ??
    item.video ??
    item.voice ??
    item.dj ??
    item.playlist ??
    item.album ??
    item
  );
};

/** 资源名（字段命名不一，兜底显示 id，避免整页"未知"） */
const pickName = (raw: any, ...keys: string[]): string => {
  for (const key of keys) {
    const value = raw?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return raw?.id ? `#${raw.id}` : "";
};

/** 封面地址 */
const pickCover = (raw: any): string =>
  raw?.coverUrl ?? raw?.cover ?? raw?.picUrl ?? raw?.coverImgUrl ?? raw?.album?.picUrl ?? "";

/** 已加载过的 Tab（避免每次切回都重新请求） */
const cloudLoaded = ref<Record<string, boolean>>({});
/** 云端记录加载错误（例如未登录） */
const cloudError = ref<string>("");

/** 获取云端最近播放（按需加载） */
const getCloudRecord = async () => {
  const tab = activeTab.value;
  if (tab === "song" || cloudLoaded.value[tab]) return;
  cloudLoading.value = true;
  cloudError.value = "";
  try {
    const result: any = await (tab === "playlist"
      ? recordRecentPlaylist()
      : tab === "album"
        ? recordRecentAlbum()
        : tab === "video"
          ? recordRecentVideo()
          : tab === "voice"
            ? recordRecentVoice()
            : recordRecentDj());

    // 后端错误可见（例如 301 需要登录）
    if (result?.code !== undefined && result.code !== 200) {
      cloudError.value = `云端记录加载失败：${result?.message ?? result?.msg ?? `code ${result?.code}`}`;
      return;
    }
    const items = pickItems(result, tab === "playlist" ? "playlists" : `${tab}s`).map(pickResource);

    if (tab === "playlist" || tab === "album") {
      coverList.value[tab] = formatCoverList(items);
    } else if (tab === "video") {
      simpleList.value.video = items.map((raw) => ({
        name: pickName(raw, "title", "name", "videoTitle"),
        cover: pickCover(raw),
        sub: raw?.creator?.nickname ?? raw?.nickname ?? "",
      }));
    } else if (tab === "voice") {
      simpleList.value.voice = items.map((raw) => ({
        name: pickName(raw, "name", "title", "voiceName"),
        cover: pickCover(raw),
        sub: raw?.dj?.nickname ?? raw?.radio?.name ?? raw?.programName ?? "",
      }));
    } else {
      simpleList.value.dj = items.map((raw) => ({
        name: pickName(raw, "name", "title", "radioName"),
        cover: pickCover(raw),
        sub: raw?.dj?.nickname ?? raw?.nickname ?? "",
      }));
    }
    cloudLoaded.value[tab] = true;
  } finally {
    cloudLoading.value = false;
  }
};

// 清空最近播放
const cleanHistory = () => {
  window.$dialog.warning({
    title: "清空列表",
    content: "确认清空最近播放列表？该操作不可撤销！",
    positiveText: "确认",
    negativeText: "取消",
    onPositiveClick: async () => {
      await dataStore.clearHistory();
      window.$message.success("最近播放列表已清空");
    },
  });
};
</script>

<style lang="scss" scoped>
.history {
  display: flex;
  flex-direction: column;
  height: 100%;
  .title {
    display: flex;
    align-items: flex-end;
    line-height: normal;
    margin-top: 12px;
    margin-bottom: 20px;
    .keyword {
      font-size: 30px;
      font-weight: bold;
      margin-right: 8px;
      line-height: normal;
    }
    .size {
      font-size: 15px;
      font-weight: normal;
      line-height: 30px;
    }
  }
  .menu {
    width: 100%;
    margin-bottom: 12px;
    .n-button {
      height: 40px;
      transition: all 0.3s var(--n-bezier);
    }
  }
  .song-list {
    flex: 1;
    overflow: hidden;
  }
  .alert {
    margin-bottom: 10px;
    border-radius: 10px;
  }
  .tabs {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    :deep(.n-tabs-pane-wrapper) {
      height: 100%;
      overflow: auto;
    }
  }
  .mini-cover {
    width: 44px;
    height: 44px;
    border-radius: 8px;
    object-fit: cover;
  }
  .item-info {
    margin-left: 10px;
    .item-name {
      display: block;
      font-weight: bold;
    }
    .item-sub {
      display: block;
      font-size: 12px;
    }
  }
}
</style>
