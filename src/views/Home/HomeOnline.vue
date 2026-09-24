<template>
  <div class="home-online">
    <!-- 登录功能 -->
    <div v-if="isSourceLogin()" class="main-rec">
      <div class="main-rec-grid">
        <n-flex :size="20" class="rec-list" justify="space-between" vertical>
          <!-- 每日推荐 -->
          <SongListCard
            :data="dailySongsList"
            :title="dailySongsTitle"
            :height="90"
            :description="dailySongsDescription"
            size="small"
            :hiddenCover="settingStore.hiddenCovers.home"
            @click="router.push({ name: 'daily-songs' })"
          />
          <!-- 我喜欢的音乐（仅网易云源） -->
          <SongListCard
            v-if="isNetEase"
            :data="dataStore.likeSongsList.data"
            :height="90"
            title="我喜欢的音乐"
            description="发现你独特的音乐品味"
            size="small"
            :hiddenCover="settingStore.hiddenCovers.home"
            @click="router.push({ name: 'like-songs' })"
          />
        </n-flex>
        <!-- 私人FM（仅网易云源） -->
        <PersonalFM v-if="isNetEase" />
      </div>
    </div>
    <!-- 公共推荐 -->
    <div v-for="(item, index) in sortedRecData" :key="index" class="rec-public">
      <n-flex
        class="title"
        align="center"
        justify="space-between"
        @click="router.push({ path: item.path ?? undefined })"
      >
        <n-h3 prefix="bar">
          <n-text>{{ item.name }}</n-text>
          <SvgIcon v-if="item.path" :size="26" name="Right" />
        </n-h3>
      </n-flex>
      <!-- 列表 -->
      <ArtistList
        v-if="item.type === 'artist'"
        :data="item.list"
        :loading="true"
        :hiddenCover="settingStore.hiddenCovers.home"
      />
      <CoverList
        v-else
        :data="item.list"
        :type="item.type"
        :loading="true"
        :hiddenCover="settingStore.hiddenCovers.home"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ArtistType, CoverType, SongType } from "@/types/main";
import { NText } from "naive-ui";
import { useDataStore, useMusicStore, useSettingStore } from "@/stores";
import { newAlbumsAll, personalized, radarPlaylist, topArtists } from "@/api/rec";
import { allMv } from "@/api/video";
import { radioRecommend } from "@/api/radio";
// 按音乐源 + 登录态取首页推荐（酷狗 / QQ 的专属歌单、每日推荐、新碟、歌手）
import {
  currentSource,
  homeAlbums,
  homeArtists,
  homeDailySongs,
  homePersonalPlaylists,
  isSourceLogin,
  sourceLabel,
} from "@/api/recommend";
import { getCacheData } from "@/utils/cache";
import { formatArtistsList, formatCoverList } from "@/utils/format";
import { sleep } from "@/utils/helper";
import { isLogin } from "@/utils/auth";
import SvgIcon from "@/components/Global/SvgIcon.vue";

interface RecItemTypeBase {
  name: string;
  path?: string;
}

interface RecItemArtist extends RecItemTypeBase {
  type: "artist";
  list: ArtistType[];
}

interface RecItemCover extends RecItemTypeBase {
  type: "playlist" | "video" | "radio" | "album";
  list: CoverType[];
}

interface RecDataType {
  playlist: RecItemCover;
  radar: RecItemCover;
  artist: RecItemArtist;
  video: RecItemCover;
  radio: RecItemCover;
  album: RecItemCover;
}

const router = useRouter();
const dataStore = useDataStore();
const musicStore = useMusicStore();
const settingStore = useSettingStore();

/** 是否网易云源（我喜欢的音乐 / 私人 FM / 雷达 / MV / 播客 仅网易云提供） */
const isNetEase = computed<boolean>(() => currentSource() === "netease");

/** 第三方源（酷狗 / QQ）的每日推荐歌曲 */
const sourceDailySongs = ref<SongType[]>([]);

/** 首页「每日推荐」数据：网易云读 store，其它源读各自平台的每日推荐 */
const dailySongsList = computed<SongType[]>(() =>
  isNetEase.value ? musicStore.dailySongsData.list : sourceDailySongs.value,
);

/** 每日推荐说明文案（随源变化） */
const dailySongsDescription = computed<string>(() =>
  isNetEase.value ? "根据你的音乐口味 · 每日更新" : `${sourceLabel()} 账号的每日推荐`,
);

// 日推标题
const dailySongsTitle = computed(() => {
  if (settingStore.hiddenCovers.home) return "每日推荐";
  const day = new Date().getDate();
  return h("div", { class: "date" }, [
    h("div", { class: "date-icon" }, [
      h(SvgIcon, { name: "Calendar-Empty", size: 30, depth: 2 }),
      h(NText, null, () => day),
    ]),
    h(NText, { class: "name text-hidden" }, () => ["每日推荐"]),
  ]);
});

// 推荐数据
const recData = ref<RecDataType>({
  playlist: {
    name: isLogin() ? "专属歌单" : "推荐歌单",
    list: [] as CoverType[],
    type: "playlist",
    path: "/discover/playlists",
  },
  radar: {
    name: "雷达歌单",
    list: [] as CoverType[],
    type: "playlist",
  },
  artist: {
    name: "歌手推荐",
    list: [] as ArtistType[],
    type: "artist",
    path: "/discover/artists",
  },
  video: {
    name: "推荐 MV",
    list: [] as CoverType[],
    type: "video",
  },
  radio: {
    name: "推荐播客",
    list: [] as CoverType[],
    type: "radio",
  },
  album: {
    name: "新碟上架",
    list: [] as CoverType[],
    type: "album",
    path: "/discover/new",
  },
});

/** 区块标题（随音乐源与登录态变化） */
const sectionTitle = (key: keyof RecDataType, fallback: string): string => {
  const source = currentSource();
  if (key === "playlist") {
    if (source === "netease") return isLogin() ? "专属歌单" : "推荐歌单";
    return isSourceLogin() ? `${sourceLabel()}专属歌单` : `${sourceLabel()}推荐歌单`;
  }
  if (source !== "netease" && key === "album") return `${sourceLabel()}新碟上架`;
  if (source !== "netease" && key === "artist") return `${sourceLabel()}歌手推荐`;
  return fallback;
};

// 根据设置过滤和排序推荐数据（空区块直接隐藏，避免用通用默认内容冒充个性化推荐）
const sortedRecData = computed(() => {
  return settingStore.homePageSections
    .filter((section) => section.visible)
    .sort((a, b) => a.order - b.order)
    .map((section) => {
      const key = section.key as keyof RecDataType;
      const item = recData.value[key];
      return item ? { ...item, name: sectionTitle(key, item.name) } : undefined;
    })
    .filter((item): item is RecDataType[keyof RecDataType] => !!item && item.list.length > 0);
});

// 获取全部推荐（按当前音乐源与登录态取数；缓存键带源作用域）
const getAllRecData = async () => {
  try {
    // 延时
    await sleep(300);

    const source = currentSource();
    const logged = isSourceLogin();
    // 缓存作用域：音乐源 + 登录态（避免切源 / 登录后仍命中旧缓存，看起来像「默认推荐」）
    const scope = source + ":" + (logged ? "in" : "anon");

    // 每日推荐（歌曲）：网易云读 store，其它源走各自平台
    try {
      if (source === "netease") {
        sourceDailySongs.value = [];
      } else {
        sourceDailySongs.value = await getCacheData(homeDailySongs, {
          key: "dailySongs:" + scope,
          time: 10,
        });
      }
    } catch (error) {
      console.error("Error getting daily songs:", error);
    }

    // 歌单（专属 / 推荐）
    try {
      if (source === "netease") {
        const playlistRes = await getCacheData(
          personalized,
          { key: "playlistRec:" + scope, time: 10 },
          "playlist",
          logged ? 21 : 20,
        );
        recData.value.playlist.list = formatCoverList(
          (playlistRes.result ?? []).filter(
            (pl: any) => !String(pl?.name ?? "").includes("私人雷达"),
          ),
        );
      } else {
        recData.value.playlist.list = await getCacheData(
          homePersonalPlaylists,
          { key: "playlistRec:" + scope, time: 10 },
          logged ? 21 : 20,
        );
      }
    } catch (error) {
      console.error("Error getting playlist:", error);
    }

    // 雷达歌单（仅网易云：私人雷达，登录后为个性化内容）
    try {
      if (source === "netease") {
        const radarRes = await getCacheData(radarPlaylist, { key: "radarRec:" + scope, time: 30 });
        recData.value.radar.list = formatCoverList(radarRes);
      } else {
        recData.value.radar.list = [];
      }
    } catch (error) {
      console.error("Error getting radar:", error);
    }

    // 歌手
    try {
      if (source === "netease") {
        const artistRes = await getCacheData(
          topArtists,
          { key: "artistRec:" + scope, time: 10 },
          6,
        );
        recData.value.artist.list = formatArtistsList(artistRes.artists);
      } else {
        recData.value.artist.list = await getCacheData(
          homeArtists,
          { key: "artistRec:" + scope, time: 30 },
          6,
        );
      }
    } catch (error) {
      console.error("Error getting artist:", error);
    }

    // MV（仅网易云）
    try {
      if (source === "netease") {
        const videoRes = await getCacheData(allMv, { key: "videoRec:" + scope, time: 10 });
        recData.value.video.list = formatCoverList(videoRes.data);
      } else {
        recData.value.video.list = [];
      }
    } catch (error) {
      console.error("Error getting video:", error);
    }

    // 播客（仅网易云）
    try {
      if (source === "netease") {
        const radioRes = await getCacheData(radioRecommend, { key: "radioRec:" + scope, time: 10 });
        recData.value.radio.list = formatCoverList(radioRes.djRadios);
      } else {
        recData.value.radio.list = [];
      }
    } catch (error) {
      console.error("Error getting radio:", error);
    }

    // 新碟
    try {
      if (source === "netease") {
        const albumRes = await getCacheData(newAlbumsAll, { key: "albumRec:" + scope, time: 10 });
        recData.value.album.list = formatCoverList(albumRes.albums);
      } else {
        recData.value.album.list = await getCacheData(
          homeAlbums,
          { key: "albumRec:" + scope, time: 30 },
          20,
        );
      }
    } catch (error) {
      console.error("Error getting album:", error);
    }
  } catch (error) {
    window.$message.error("个性化推荐获取出错");
    console.error("Error getting personalized data:", error);
  }
};

onActivated(getAllRecData);

onMounted(() => {
  getAllRecData();
});
</script>

<style lang="scss" scoped>
.main-rec {
  .main-rec-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 20px;
  }
  .date {
    display: flex;
    align-items: center;
    margin-bottom: 4px;
    .date-icon {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-right: 4px;
      .n-text {
        position: absolute;
        font-size: 12px;
        color: var(--primary-hex);
        line-height: normal;
        margin-top: 4px;
        transform: scale(0.8);
      }
    }
    .name {
      font-size: 18px;
      font-weight: bold;
    }
  }
  @media (max-width: 768px) {
    .main-rec-grid {
      grid-template-columns: repeat(1, minmax(0, 1fr));
    }
    .rec-list {
      display: grid !important;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
}
.title {
  margin-top: 28px;
  padding: 0 4px;
  width: max-content;
  .n-h {
    margin: 0;
    display: flex;
    align-items: center;
    cursor: pointer;
    .n-icon {
      opacity: 0;
      transform: translateX(4px);
      transition:
        opacity 0.3s,
        transform 0.3s;
    }
    &:hover {
      .n-icon {
        opacity: 1;
        transform: translateX(0);
      }
    }
  }
}
</style>
