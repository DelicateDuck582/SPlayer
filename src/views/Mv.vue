<!-- MV 详情 / 播放（npm 版 API：/mv/detail、/mv/url、/simi/mv、/mv/sub） -->
<template>
  <div class="mv-view">
    <n-spin :show="loading">
      <!-- MV 广场（未指定 id 时展示全部 MV） -->
      <template v-if="!currentId">
        <div class="title">
          <n-text class="name">MV 广场</n-text>
          <n-text class="tip" depth="3">来自「全部 MV」（上升最快）</n-text>
        </div>
        <n-grid
          v-if="mvList.length"
          :cols="4"
          :x-gap="16"
          :y-gap="16"
          item-responsive
          responsive="screen"
        >
          <n-grid-item v-for="mv in mvList" :key="mv.id" span="2 m:1">
            <div class="simi-card" @click="goMv(mv.id)">
              <img class="cover" :src="mv.cover || mv.picUrl" loading="lazy" alt="" />
              <n-text class="simi-name" :title="mv.name">{{ mv.name }}</n-text>
              <n-text class="simi-artist" depth="3">{{ mv.artistName || "" }}</n-text>
            </div>
          </n-grid-item>
        </n-grid>
        <n-empty v-else description="暂无 MV" size="small" />
      </template>
      <template v-else-if="detail">
        <div class="title">
          <n-text class="name">{{ detail.name }}</n-text>
          <n-text class="artist" depth="3">{{ detail.artistName || "未知歌手" }}</n-text>
        </div>
        <div class="player">
          <video v-if="url" :src="url" controls autoplay class="video" />
          <n-empty
            v-else
            description="暂无播放地址（可能受版权限制或需要登录）"
            style="padding: 40px 0"
          />
        </div>
        <n-flex class="meta" align="center" justify="space-between">
          <n-flex class="stats" align="center">
            <n-text depth="3">播放 {{ detail.playCount || 0 }}</n-text>
            <n-text depth="3">收藏 {{ detail.subCount || 0 }}</n-text>
            <n-text depth="3">评论 {{ detail.commentCount || 0 }}</n-text>
            <n-text depth="3">{{ detail.publishTime || "" }}</n-text>
          </n-flex>
          <n-flex align="center">
            <n-button
              :focusable="false"
              :type="subed ? 'primary' : 'default'"
              strong
              secondary
              round
              @click="toggleSub"
            >
              <template #icon>
                <SvgIcon name="Like" />
              </template>
              {{ subed ? "已收藏" : "收藏 MV" }}
            </n-button>
            <n-button :focusable="false" strong secondary round @click="goComment">
              <template #icon>
                <SvgIcon name="Message" />
              </template>
              查看评论
            </n-button>
          </n-flex>
        </n-flex>
        <n-text v-if="detail.briefDesc" class="desc" depth="3">{{ detail.briefDesc }}</n-text>
        <div class="sub-title">相似 MV</div>
        <n-grid
          v-if="similar.length"
          :cols="4"
          :x-gap="16"
          :y-gap="16"
          item-responsive
          responsive="screen"
        >
          <n-grid-item v-for="mv in similar" :key="mv.id" span="2 m:1">
            <div class="simi-card" @click="goMv(mv.id)">
              <img class="cover" :src="mv.cover || mv.picUrl" loading="lazy" alt="" />
              <n-text class="simi-name" :title="mv.name">{{ mv.name }}</n-text>
              <n-text class="simi-artist" depth="3">{{ mv.artistName || "" }}</n-text>
            </div>
          </n-grid-item>
        </n-grid>
        <n-empty v-else description="暂无相似 MV" size="small" />
      </template>
      <n-empty v-else-if="!loading" description="MV 不存在或已被删除" style="margin-top: 60px" />
    </n-spin>
  </div>
</template>

<script setup lang="ts">
import type { NeteaseMvBrief, NeteaseMvDetail } from "@/types/netease";
import { mvAll, mvDetail, mvSub, mvUrl, simiMv } from "@/api/netease";
import { isLogin } from "@/utils/auth";
import { openUserLogin } from "@/utils/modal";

const route = useRoute();
const router = useRouter();

const loading = ref<boolean>(false);
const detail = ref<NeteaseMvDetail | null>(null);
const url = ref<string>("");
const similar = ref<NeteaseMvBrief[]>([]);
/** MV 广场列表 */
const mvList = ref<NeteaseMvBrief[]>([]);
const subed = ref<boolean>(false);

/** 当前 MV id（为空时进入「MV 广场」列表模式） */
const currentId = computed<number | string>(() => (route.query?.id as string) || "");

/** 拉取 MV 广场列表 */
const getMvList = async () => {
  loading.value = true;
  try {
    const result: any = await mvAll("全部", "全部", "上升最快", 40);
    mvList.value = result?.data ?? result?.mvs ?? [];
  } finally {
    loading.value = false;
  }
};

/** 拉取 MV 数据（详情 / 播放地址 / 相似 MV 并发） */
const getMvData = async () => {
  const id = currentId.value;
  // 无 id：进入 MV 广场模式
  if (!id) {
    detail.value = null;
    url.value = "";
    similar.value = [];
    await getMvList();
    return;
  }
  loading.value = true;
  try {
    const [detailResult, urlResult, simiResult] = await Promise.allSettled([
      mvDetail(id),
      mvUrl(id, 1080),
      simiMv(id),
    ]);
    detail.value = detailResult.status === "fulfilled" ? (detailResult.value?.data ?? null) : null;
    subed.value = detailResult.status === "fulfilled" ? Boolean(detailResult.value?.subed) : false;

    // 1080P 取不到时回退 720P / 480P
    let playUrl = urlResult.status === "fulfilled" ? (urlResult.value?.data?.url ?? "") : "";
    if (!playUrl) {
      for (const resolution of [720, 480]) {
        const fallback: any = await mvUrl(id, resolution);
        if (fallback?.data?.url) {
          playUrl = fallback.data.url;
          break;
        }
      }
    }
    url.value = playUrl;
    similar.value = simiResult.status === "fulfilled" ? (simiResult.value?.mvs ?? []) : [];
  } finally {
    loading.value = false;
  }
};

/** 跳转其它 MV */
const goMv = (id: number) => {
  router.push({ name: "mv", query: { id } });
};

/** 查看评论 */
const goComment = () => {
  router.push({ name: "comment", query: { id: currentId.value, type: "mv" } });
};

/** 收藏 / 取消收藏 MV */
const toggleSub = async () => {
  if (!isLogin()) {
    window.$message?.warning("请先登录");
    openUserLogin();
    return;
  }
  const result: any = await mvSub(currentId.value, subed.value ? 0 : 1);
  if (result?.code === 200) {
    subed.value = !subed.value;
    window.$message?.success(subed.value ? "已收藏 MV" : "已取消收藏");
  } else {
    window.$message?.warning(result?.message ?? "操作失败，请稍后再试");
  }
};

watch(currentId, getMvData);
onMounted(getMvData);
</script>

<style lang="scss" scoped>
.mv-view {
  height: 100%;
  overflow: auto;
  .title {
    display: flex;
    align-items: flex-end;
    margin-top: 12px;
    margin-bottom: 16px;
    .name {
      font-size: 28px;
      font-weight: bold;
      margin-right: 10px;
      line-height: normal;
    }
    .artist {
      font-size: 14px;
      line-height: 30px;
    }
  }
  .player {
    background: #000;
    border-radius: 12px;
    overflow: hidden;
    aspect-ratio: 16 / 9;
    display: flex;
    align-items: center;
    justify-content: center;
    .video {
      width: 100%;
      height: 100%;
    }
  }
  .meta {
    margin-top: 14px;
    .stats {
      gap: 14px;
      font-size: 13px;
    }
  }
  .desc {
    display: block;
    margin-top: 12px;
    font-size: 13px;
    line-height: 1.7;
  }
  .sub-title {
    font-size: 18px;
    font-weight: bold;
    margin: 22px 0 12px;
  }
  .simi-card {
    cursor: pointer;
    .cover {
      width: 100%;
      aspect-ratio: 16 / 9;
      object-fit: cover;
      border-radius: 10px;
    }
    .simi-name {
      display: block;
      margin-top: 6px;
      font-size: 14px;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .simi-artist {
      display: block;
      font-size: 12px;
    }
  }
}
</style>
