<!-- 曲风（风格）浏览（npm 版 API：/style/*） -->
<template>
  <div class="style-view">
    <div class="title">
      <n-text class="name">曲风</n-text>
      <n-text class="tip" depth="3">按曲风发现歌曲 / 歌单 / 歌手</n-text>
    </div>
    <n-spin :show="loading">
      <n-card class="style-tags" :bordered="false">
        <n-flex v-for="group in styleGroups" :key="group.tagId" class="style-group" align="center">
          <n-text class="group-name">{{ group.tagName }}</n-text>
          <n-flex class="children">
            <n-tag
              v-for="tag in group.childrenTags"
              :key="tag.tagId"
              :bordered="false"
              :type="String(currentTagId) === String(tag.tagId) ? 'primary' : 'default'"
              round
              size="large"
              @click="selectTag(tag)"
            >
              {{ tag.tagName }}
            </n-tag>
          </n-flex>
        </n-flex>
      </n-card>
      <n-card v-if="detail" class="style-detail" :bordered="false">
        <n-flex align="center" justify="space-between">
          <n-text class="detail-name">{{ detail.name }}</n-text>
          <n-text depth="3">
            {{ detail.songNum || 0 }} 首歌 · {{ detail.artistNum || 0 }} 位歌手
          </n-text>
        </n-flex>
        <n-text v-if="detail.desc" class="detail-desc" depth="3">{{ detail.desc }}</n-text>
      </n-card>
      <n-tabs v-model:value="activeTab" class="tabs" type="segment" animated>
        <n-tab-pane name="song" tab="歌曲">
          <SongList v-if="songs.length" :data="songs" :loading="false" height="auto" disabledSort />
          <n-empty v-else description="暂无歌曲" size="small" />
        </n-tab-pane>
        <n-tab-pane name="playlist" tab="歌单">
          <CoverList
            v-if="playlists.length"
            :data="playlists"
            :loading="false"
            type="playlist"
            :hiddenCover="settingStore.hiddenCovers.playlist"
          />
          <n-empty v-else description="暂无歌单" size="small" />
        </n-tab-pane>
        <n-tab-pane name="artist" tab="歌手">
          <ArtistList v-if="artists.length" :data="artists" :loading="false" />
          <n-empty v-else description="暂无歌手" size="small" />
        </n-tab-pane>
      </n-tabs>
    </n-spin>
  </div>
</template>

<script setup lang="ts">
import type { ArtistType, CoverType, SongType } from "@/types/main";
import type { NeteaseStyleDetail, NeteaseStyleTag } from "@/types/netease";
import { styleArtist, styleDetail, styleList, stylePlaylist, styleSong } from "@/api/netease";
import { formatArtistsList, formatCoverList, formatSongsList } from "@/utils/format";
import { useSettingStore } from "@/stores";

const route = useRoute();
const router = useRouter();
const settingStore = useSettingStore();

const loading = ref<boolean>(false);
/** 一级曲风（含子曲风） */
const styleGroups = ref<NeteaseStyleTag[]>([]);
/** 当前曲风 id */
const currentTagId = ref<number | string>((route.query?.tagId as string) || "");
/** 当前曲风详情 */
const detail = ref<NeteaseStyleDetail | null>(null);
const activeTab = ref<string>("song");
const songs = ref<SongType[]>([]);
const playlists = ref<CoverType[]>([]);
const artists = ref<ArtistType[]>([]);

/** 加载曲风列表 */
const getStyleList = async () => {
  const result = await styleList();
  styleGroups.value = (result?.data ?? []).filter((item) => item?.childrenTags?.length);
};

/** 加载某曲风的详情与内容 */
const getStyleContent = async (tagId: number | string) => {
  if (!tagId) return;
  loading.value = true;
  try {
    currentTagId.value = tagId;
    // 详情 / 歌曲 / 歌单 / 歌手 并发请求，单项失败不影响其余
    const [detailResult, songResult, playlistResult, artistResult] = await Promise.allSettled([
      styleDetail(tagId),
      styleSong(tagId),
      stylePlaylist(tagId),
      styleArtist(tagId),
    ]);
    detail.value = detailResult.status === "fulfilled" ? (detailResult.value?.data ?? null) : null;
    songs.value =
      songResult.status === "fulfilled"
        ? formatSongsList(songResult.value?.data?.songs ?? songResult.value?.songs ?? [])
        : [];
    playlists.value =
      playlistResult.status === "fulfilled"
        ? formatCoverList(
            playlistResult.value?.data?.playlists ?? playlistResult.value?.playlists ?? [],
          )
        : [];
    artists.value =
      artistResult.status === "fulfilled"
        ? formatArtistsList(artistResult.value?.data?.artists ?? artistResult.value?.artists ?? [])
        : [];
  } finally {
    loading.value = false;
  }
};

/** 切换曲风（同步到地址栏，便于分享与回退） */
const selectTag = (tag: NeteaseStyleTag) => {
  if (String(tag.tagId) === String(currentTagId.value)) return;
  router.push({ name: "style", query: { tagId: tag.tagId } });
};

/** 地址栏参数变化时刷新 */
watch(
  () => route.query.tagId,
  (tagId) => {
    if (tagId) getStyleContent(tagId as string);
  },
);

onMounted(async () => {
  await getStyleList();
  // 未指定曲风时默认展示第一个子曲风
  const defaultTag = currentTagId.value || styleGroups.value[0]?.childrenTags?.[0]?.tagId;
  if (defaultTag) await getStyleContent(defaultTag);
});
</script>

<style lang="scss" scoped>
.style-view {
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
  .style-tags {
    border-radius: 12px;
    margin-bottom: 16px;
    .style-group {
      padding: 6px 0;
      .group-name {
        width: 72px;
        font-weight: bold;
        flex-shrink: 0;
      }
      .children {
        flex: 1;
      }
    }
    .n-tag {
      cursor: pointer;
    }
  }
  .style-detail {
    border-radius: 12px;
    margin-bottom: 12px;
    .detail-name {
      font-size: 20px;
      font-weight: bold;
    }
    .detail-desc {
      display: block;
      margin-top: 8px;
      font-size: 13px;
      line-height: 1.6;
    }
  }
  .tabs {
    :deep(.n-tabs-nav) {
      margin-bottom: 12px;
    }
  }
}
</style>
