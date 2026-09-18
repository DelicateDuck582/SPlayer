<!-- 数字专辑 / 新碟（npm 版 API：/album/list、/album/list/style、/album/new、/digitalAlbum/purchased） -->
<template>
  <div class="digital-album">
    <div class="title">
      <n-text class="name">数字专辑</n-text>
      <n-text class="tip" depth="3">新碟上架、语种风格馆与已购</n-text>
    </div>
    <n-tabs
      v-model:value="activeTab"
      class="tabs"
      type="segment"
      animated
      @update:value="onTabChange"
    >
      <n-tab-pane name="new" tab="新碟上架" />
      <n-tab-pane name="style" tab="语种风格馆" />
      <n-tab-pane name="all" tab="全部新碟" />
      <n-tab-pane name="purchased" tab="我的已购" />
    </n-tabs>
    <n-spin :show="loading">
      <n-grid
        v-if="list.length"
        :x-gap="16"
        :y-gap="16"
        cols="2 s:3 m:5"
        item-responsive
        responsive="screen"
      >
        <n-grid-item v-for="album in list" :key="album.albumId" span="1">
          <div class="album-card" @click="goAlbum(album.albumId)">
            <img class="cover" :src="album.coverUrl" loading="lazy" alt="" />
            <n-text class="album-name" :title="album.albumName">{{ album.albumName }}</n-text>
            <n-text class="artist" depth="3" :title="album.artistName">{{
              album.artistName
            }}</n-text>
            <n-flex class="price" justify="space-between" align="center" :wrap="false">
              <n-tag :bordered="false" round size="tiny" type="warning">
                ¥{{ ((album.price || 0) / 100).toFixed(2) }}
              </n-tag>
              <n-text depth="3" class="sale"
                >销量 {{ formatCommentCount(album.saleNum || 0) }}</n-text
              >
            </n-flex>
          </div>
        </n-grid-item>
      </n-grid>
      <n-empty
        v-else-if="!loading"
        :description="emptyText"
        size="small"
        style="margin-top: 40px"
      />
    </n-spin>
  </div>
</template>

<script setup lang="ts">
import type { NeteaseDigitalAlbum } from "@/types/netease";
import { albumList, albumListStyle, albumNew, digitalAlbumPurchased } from "@/api/netease";
import { formatCommentCount } from "@/utils/format";
import { isLogin } from "@/utils/auth";

const router = useRouter();

const loading = ref<boolean>(false);
const activeTab = ref<string>("new");
const list = ref<NeteaseDigitalAlbum[]>([]);

/** 空列表提示 */
const emptyText = computed<string>(() =>
  activeTab.value === "purchased" ? "暂无已购数字专辑（需登录）" : "暂无数据",
);

/** 统一的数字专辑字段（各接口字段名不同，这里归一化） */
const normalize = (items: any[]): NeteaseDigitalAlbum[] =>
  (items || [])
    .map((item) => ({
      albumId: Number(item?.albumId ?? item?.id ?? 0),
      albumName: item?.albumName ?? item?.name ?? "未知专辑",
      artistName: item?.artistName ?? item?.artist?.name ?? "",
      artistId: item?.artistId ?? item?.artist?.id,
      price: Number(item?.price ?? 0),
      coverUrl: item?.coverUrl ?? item?.picUrl ?? "",
      pubTime: item?.pubTime ?? item?.publishTime,
      saleNum: Number(item?.saleNum ?? 0),
      albumType: item?.albumType,
    }))
    .filter((item) => item.albumId);

/** 拉取当前 Tab 数据 */
const getList = async () => {
  loading.value = true;
  try {
    if (activeTab.value === "new") {
      const result: any = await albumList(30, 0);
      list.value = normalize(result?.products ?? []);
    } else if (activeTab.value === "style") {
      const result: any = await albumListStyle(30, 0);
      list.value = normalize(result?.albumProducts ?? []);
    } else if (activeTab.value === "all") {
      const result: any = await albumNew("ALL", 30, 0);
      list.value = normalize(result?.albums ?? []);
    } else {
      // 已购需要登录
      if (!isLogin()) {
        list.value = [];
        return;
      }
      const result: any = await digitalAlbumPurchased(30, 0);
      list.value = normalize(result?.paidAlbums ?? []);
    }
  } finally {
    loading.value = false;
  }
};

/** 切换 Tab */
const onTabChange = () => getList();

/** 进入专辑详情（复用既有专辑页） */
const goAlbum = (albumId: number) => {
  router.push({ name: "album", query: { id: albumId } });
};

onMounted(getList);
</script>

<style lang="scss" scoped>
.digital-album {
  height: 100%;
  overflow: auto;
  .album-card {
    cursor: pointer;
    display: flex;
    flex-direction: column;
    height: 100%;
    .cover {
      width: 100%;
      aspect-ratio: 1 / 1;
      object-fit: cover;
      border-radius: 10px;
      background: var(--n-action-color);
    }
    .album-name {
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      margin-top: 6px;
      font-size: 14px;
      line-height: 1.4;
      min-height: 2.8em;
    }
    .artist {
      display: block;
      font-size: 12px;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .price {
      margin-top: 4px;
      .sale {
        font-size: 12px;
      }
    }
  }
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
}
</style>
