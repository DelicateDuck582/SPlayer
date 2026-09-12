<!-- 下载列表 -->
<template>
  <n-drawer
    v-model:show="statusStore.downloadListShow"
    :class="{ 'full-player': statusStore.showFullPlayer }"
    :auto-focus="false"
    id="main-download-list"
    style="width: 400px"
  >
    <n-drawer-content :native-scrollbar="false" closable>
      <template #header>
        <div class="download-header">
          <n-text class="name">下载列表</n-text>
          <n-text class="count" depth="3">
            {{ dataStore.downloadingSongs.length }} 个任务 · {{ dataStore.downloadedSongs.length }} 首已完成
          </n-text>
        </div>
      </template>
      <n-tabs v-model:value="currentTab" class="download-tabs" type="segment" justify-content="space-evenly">
        <n-tab-pane name="downloading">
          <template #tab>
            <n-badge
              :value="dataStore.downloadingSongs.length"
              :show="dataStore.downloadingSongs.length > 0"
              :max="99"
              :offset="[10, 2]"
            >
              下载中
            </n-badge>
          </template>
          <Transition name="fade" mode="out-in">
            <n-scrollbar v-if="dataStore.downloadingSongs.length > 0" class="list-scrollbar">
              <div
                v-for="item in sortedDownloadingSongs"
                :key="item.song.id"
                class="download-item"
              >
                <s-image :src="item.song.coverSize?.s || item.song.cover" class="cover" />
                <div class="data">
                  <n-text class="name text-hidden">{{ item.song.name || "未知曲目" }}</n-text>
                  <n-text class="artists text-hidden" depth="3">{{ getArtists(item.song) }}</n-text>
                  <n-flex vertical :size="4" class="status">
                    <n-flex justify="space-between" align="center">
                      <n-text
                        :type="item.status === 'failed' ? 'error' : undefined"
                        :depth="item.status === 'failed' ? undefined : '3'"
                        class="status-text"
                      >
                        {{
                          item.status === "downloading"
                            ? `${item.progress}%`
                            : item.status === "waiting"
                              ? "等待下载..."
                              : "下载失败"
                        }}
                      </n-text>
                      <n-text v-if="item.status === 'downloading'" depth="3" class="status-text">
                        {{ item.transferred }} / {{ item.totalSize }}
                      </n-text>
                    </n-flex>
                    <n-progress
                      type="line"
                      :percentage="item.status === 'downloading' ? item.progress : 0"
                      :show-indicator="false"
                      :status="item.status === 'failed' ? 'error' : undefined"
                      style="height: 4px"
                    />
                  </n-flex>
                </div>
                <n-flex class="actions" align="center" justify="center" vertical>
                  <div
                    v-if="item.status === 'failed'"
                    class="action-icon"
                    title="重试"
                    @click="downloadManager.retryDownload(item.song.id)"
                  >
                    <SvgIcon name="Refresh" :size="18" />
                  </div>
                  <div
                    class="action-icon"
                    title="移除"
                    @click="handleRemoveDownload(item.song.id)"
                  >
                    <SvgIcon name="Close" :size="18" />
                  </div>
                </n-flex>
              </div>
            </n-scrollbar>
            <n-empty v-else description="暂无正在下载的任务" class="empty" />
          </Transition>
        </n-tab-pane>
        <n-tab-pane name="downloaded">
          <template #tab>
            <n-badge
              :value="dataStore.downloadedSongs.length"
              :show="dataStore.downloadedSongs.length > 0"
              :max="99"
              :offset="[10, 2]"
            >
              已完成
            </n-badge>
          </template>
          <Transition name="fade" mode="out-in">
            <n-scrollbar v-if="dataStore.downloadedSongs.length > 0" class="list-scrollbar">
              <div
                v-for="item in downloadedSongList"
                :key="item.song.id"
                class="download-item"
              >
                <s-image :src="item.song.coverSize?.s || item.song.cover" class="cover" />
                <div class="data">
                  <n-text class="name text-hidden">{{ item.song.name || "未知曲目" }}</n-text>
                  <n-text class="artists text-hidden" depth="3">{{ getArtists(item.song) }}</n-text>
                  <n-text class="meta" depth="3">
                    {{ item.size }} · {{ formatTime(item.time) }}
                  </n-text>
                </div>
                <n-flex class="actions" align="center" justify="center" vertical>
                  <div class="action-icon" title="重新下载" @click="handleRedownload(item)">
                    <SvgIcon name="Download" :size="18" />
                  </div>
                  <div
                    class="action-icon"
                    title="移除记录"
                    @click="dataStore.removeDownloadedSong(item.song.id)"
                  >
                    <SvgIcon name="Delete" :size="18" />
                  </div>
                </n-flex>
              </div>
            </n-scrollbar>
            <n-empty v-else description="暂无已完成的下载" class="empty" />
          </Transition>
        </n-tab-pane>
      </n-tabs>
      <template #footer>
        <n-grid :cols="2" x-gap="16" class="download-menu">
          <n-gi v-if="currentTab === 'downloading'">
            <n-button
              :focusable="false"
              size="large"
              strong
              secondary
              :disabled="!hasFailed"
              @click="downloadManager.retryAllDownloads()"
            >
              <template #icon>
                <SvgIcon name="Refresh" />
              </template>
              全部重试
            </n-button>
          </n-gi>
          <n-gi>
            <n-button
              :focusable="false"
              size="large"
              strong
              secondary
              :disabled="
                currentTab === 'downloading'
                  ? dataStore.downloadingSongs.length === 0
                  : dataStore.downloadedSongs.length === 0
              "
              @click="handleClear"
            >
              <template #icon>
                <SvgIcon name="DeleteSweep" />
              </template>
              {{ currentTab === "downloading" ? "清空列表" : "清空记录" }}
            </n-button>
          </n-gi>
        </n-grid>
      </template>
    </n-drawer-content>
  </n-drawer>
</template>

<script setup lang="ts">
import { useDataStore, useStatusStore } from "@/stores";
import { useDownloadManager } from "@/core/resource/DownloadManager";
import type { DownloadedSongType, SongType } from "@/types/main";
import dayjs from "dayjs";

const dataStore = useDataStore();
const statusStore = useStatusStore();
const downloadManager = useDownloadManager();

const currentTab = ref<"downloading" | "downloaded">("downloading");

// 下载中的任务排序（下载中 > 等待中 > 失败）
// 过滤掉缺失歌曲信息的异常残留记录，避免渲染阶段读取空对象崩溃
const sortedDownloadingSongs = computed(() => {
  return dataStore.downloadingSongs
    .filter((item) => item?.song?.id)
    .sort((a, b) => {
      const getPriority = (status: string) => {
        if (status === "downloading") return 1;
        if (status === "waiting") return 2;
        return 3;
      };
      return getPriority(a.status) - getPriority(b.status);
    });
});

// 已完成的下载记录（同样过滤异常残留记录）
const downloadedSongList = computed(() =>
  dataStore.downloadedSongs.filter((item) => item?.song?.id),
);

// 是否存在失败任务
const hasFailed = computed(() =>
  dataStore.downloadingSongs.some((item) => item?.status === "failed"),
);

// 歌手信息
const getArtists = (song: SongType) => {
  if (!song) return "未知艺术家";
  if (Array.isArray(song.artists)) {
    return song.artists.map((a) => a.name).join(" / ");
  }
  return song.artists || "未知艺术家";
};

// 完成时间
const formatTime = (time: number) => dayjs(time).format("MM-DD HH:mm");

// 移除下载任务
const handleRemoveDownload = (id: number) => {
  downloadManager.removeDownload(id);
  window.$message.success("已删除下载任务");
};

// 重新下载
const handleRedownload = (item: DownloadedSongType) => {
  downloadManager.addDownload(item.song, item.quality);
};

// 清空
const handleClear = () => {
  const isDownloading = currentTab.value === "downloading";
  window.$dialog.warning({
    title: isDownloading ? "清空下载列表" : "清空下载记录",
    content: isDownloading ? "确认移除全部下载任务吗？" : "确认清空全部已完成记录吗？",
    positiveText: "确认",
    negativeText: "取消",
    onPositiveClick: () => {
      if (isDownloading) {
        downloadManager.removeAllDownloads();
      } else {
        dataStore.clearDownloadedSongs();
      }
      window.$message.success(isDownloading ? "下载列表已清空" : "下载记录已清空");
    },
  });
};

// 有任务时自动切换到下载中
watch(
  () => dataStore.downloadingSongs.length,
  (length, oldLength) => {
    if (length > oldLength) {
      currentTab.value = "downloading";
    }
  },
);
</script>

<style lang="scss" scoped>
.download-header {
  display: flex;
  flex-direction: column;
  .count {
    margin-top: 8px;
    font-size: 12px;
  }
}
.download-tabs {
  height: 100%;
  :deep(.n-tabs-pane-wrapper) {
    height: calc(100% - 48px);
  }
  :deep(.n-tab-pane) {
    height: 100%;
  }
}
.list-scrollbar {
  height: 100%;
  max-height: calc(100vh - 220px);
  .download-item {
    display: flex;
    align-items: center;
    padding: 10px;
    border-radius: 12px;
    border: 1px solid transparent;
    background-color: rgba(var(--primary), 0.08);
    margin-bottom: 10px;
    transition:
      border-color 0.3s,
      background-color 0.3s;
    &:hover {
      border-color: var(--primary-hex);
    }
    .cover {
      width: 48px;
      height: 48px;
      min-width: 48px;
      border-radius: 8px;
      overflow: hidden;
    }
    .data {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      margin: 0 10px;
      .name {
        font-size: 14px;
      }
      .artists {
        font-size: 12px;
        margin-top: 2px;
      }
      .meta {
        font-size: 12px;
        margin-top: 2px;
      }
      .status {
        margin-top: 6px;
        .status-text {
          font-size: 12px;
        }
      }
    }
    .actions {
      .action-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 4px;
        border-radius: 6px;
        cursor: pointer;
        transition: background-color 0.3s;
        &:hover {
          background-color: rgba(var(--primary), 0.29);
        }
      }
    }
  }
}
.empty {
  margin-top: 60px;
}
.download-menu {
  height: 40px;
  .n-button {
    width: 100%;
    border-radius: 8px;
  }
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>

<style lang="scss">
#main-download-list {
  --n-border-radius: 12px;
  .n-drawer-header {
    height: 70px;
  }
  .n-scrollbar-content {
    padding: 0;
    height: 100%;
  }
  .n-drawer-footer {
    height: 72px;
    padding: 16px;
  }
  &.full-player {
    --n-color: rgb(var(--main-cover-color));
    --n-close-icon-color: rgba(var(--main-cover-color), 0.58);
    background-color: transparent;
    box-shadow: none;
    .n-drawer-header,
    .n-drawer-footer {
      border: none;
    }
    a,
    span,
    .n-icon {
      color: rgb(var(--main-cover-color));
    }
    .n-button {
      --n-color: rgba(var(--main-cover-color), 0.08);
      --n-color-hover: rgba(var(--main-cover-color), 0.12);
      --n-color-pressed: var(--n-color);
      --n-color-focus: var(--n-color-hover);
    }
    .download-item {
      background-color: rgba(var(--main-cover-color), 0.08);
      &:hover {
        border-color: rgb(var(--main-cover-color));
      }
    }
  }
}
</style>
