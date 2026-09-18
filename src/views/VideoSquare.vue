<!-- 视频广场（npm 版 API：/video/group/list、/video/timeline/recommend、/video/timeline/all、/video/detail、/video/url） -->
<template>
  <div class="video-square">
    <div class="title">
      <n-text class="name">视频广场</n-text>
      <n-text class="tip" depth="3">推荐视频与标签时间线</n-text>
    </div>
    <n-flex class="tags">
      <n-tag
        :bordered="false"
        :type="!currentTag ? 'primary' : 'default'"
        round
        size="large"
        class="tag"
        @click="changeTag(0)"
      >
        推荐
      </n-tag>
      <n-tag
        v-for="tag in tags"
        :key="tag.id"
        :bordered="false"
        :type="currentTag === tag.id ? 'primary' : 'default'"
        round
        size="large"
        class="tag"
        @click="changeTag(tag.id)"
      >
        {{ tag.name }}
      </n-tag>
    </n-flex>
    <n-spin :show="loading">
      <n-grid
        v-if="videos.length"
        :cols="4"
        :x-gap="16"
        :y-gap="16"
        item-responsive
        responsive="screen"
      >
        <n-grid-item v-for="item in videos" :key="item.vid" span="2 m:1">
          <div class="video-card" @click="openVideo(item)">
            <div class="cover-wrap">
              <img class="cover" :src="item.coverUrl" loading="lazy" alt="" />
              <n-text class="duration">{{ msToTime(item.durationms || 0) }}</n-text>
            </div>
            <n-text class="card-title" :title="item.title">{{ item.title }}</n-text>
            <n-flex class="card-meta" justify="space-between">
              <n-text depth="3" class="meta-text">{{ item.creator?.nickname || "" }}</n-text>
              <n-text depth="3" class="meta-text">
                {{ formatCommentCount(item.playTime || 0) }} 次播放
              </n-text>
            </n-flex>
          </div>
        </n-grid-item>
      </n-grid>
      <n-empty v-else-if="!loading" description="暂无视频" size="small" />
      <n-flex v-if="hasMore && videos.length" class="load-more" justify="center">
        <n-button :focusable="false" strong secondary round :loading="loading" @click="loadMore">
          加载更多
        </n-button>
      </n-flex>
    </n-spin>

    <!-- 播放弹窗 -->
    <n-modal
      v-model:show="showPlayer"
      preset="card"
      style="width: 900px"
      :title="current?.title || '视频'"
    >
      <video v-if="playUrl" :src="playUrl" controls autoplay class="player" />
      <n-spin v-else :show="playerLoading">
        <n-empty description="暂无播放地址（可能受版权限制）" style="padding: 40px 0" />
      </n-spin>
      <template v-if="current" #footer>
        <n-flex justify="space-between" align="center">
          <n-text depth="3">
            作者：{{ current.creator?.nickname || "未知" }} · 点赞
            {{ formatCommentCount(current.praisedCount || 0) }} · 评论
            {{ formatCommentCount(current.commentCount || 0) }}
          </n-text>
          <n-button :focusable="false" strong secondary round @click="goComment(current.vid)">
            <template #icon>
              <SvgIcon name="Message" />
            </template>
            查看评论
          </n-button>
        </n-flex>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import type { NeteaseVideoItem } from "@/types/netease";
import {
  videoDetail,
  videoGroupList,
  videoTimelineAll,
  videoTimelineRecommend,
  videoUrl,
} from "@/api/netease";
import { formatCommentCount } from "@/utils/format";
import { msToTime } from "@/utils/time";

const router = useRouter();

const loading = ref<boolean>(false);
/** 视频标签 */
const tags = ref<Array<{ id: number; name: string }>>([]);
/** 当前标签（0 = 推荐） */
const currentTag = ref<number>(0);
const videos = ref<NeteaseVideoItem[]>([]);
const offset = ref<number>(0);
const hasMore = ref<boolean>(true);

/** 播放弹窗 */
const showPlayer = ref<boolean>(false);
const playerLoading = ref<boolean>(false);
const playUrl = ref<string>("");
const current = ref<NeteaseVideoItem | null>(null);

/** 从时间线响应中取出视频条目（上游每项为 { type, data }，仅取视频类型） */
const pickVideos = (datas: any[]): NeteaseVideoItem[] =>
  (datas || [])
    .map((item) => item?.data)
    .filter((item) => item?.vid)
    .map((item) => ({ ...item, vid: String(item.vid) }));

/** 上游会按 offset 分页，可能出现重复条目：去重并限制单页最大条数 */
const appendVideos = (list: NeteaseVideoItem[]) => {
  const seen = new Set(videos.value.map((item) => item.vid));
  const fresh = list.filter((item) => !seen.has(item.vid));
  videos.value = videos.value.concat(fresh).slice(0, 200);
};

/** 仅接受 http(s) 播放地址（防止渲染非预期协议的 URL） */
const safeUrl = (url: unknown): string => {
  const value = String(url ?? "").replace(/^http:/, "https:");
  return /^https?:\/\//i.test(value) ? value : "";
};

/** 拉取视频标签 */
const getTags = async () => {
  const result: any = await videoGroupList();
  tags.value = (result?.data ?? []).filter((tag: any) => tag?.id && tag?.name);
};

/** 拉取当前标签的视频（offset=0 时重置列表） */
const getVideos = async (reset = false) => {
  loading.value = true;
  try {
    if (reset) {
      offset.value = 0;
      videos.value = [];
      hasMore.value = true;
    }
    const result: any = currentTag.value
      ? await videoTimelineAll(currentTag.value, offset.value)
      : await videoTimelineRecommend(offset.value);
    const list = pickVideos(result?.datas ?? []);
    if (reset) videos.value = list.slice(0, 200);
    else appendVideos(list);
    hasMore.value = Boolean(result?.hasmore) && list.length > 0;
    offset.value += list.length;
  } finally {
    loading.value = false;
  }
};

/** 切换标签 */
const changeTag = (tagId: number) => {
  if (currentTag.value === tagId) return;
  currentTag.value = tagId;
  getVideos(true);
};

/** 加载更多 */
const loadMore = () => getVideos(false);

/** 打开视频（弹窗内播放，vid 为字符串，不能走只支持数字 id 的旧视频页） */
const openVideo = async (item: NeteaseVideoItem) => {
  current.value = item;
  showPlayer.value = true;
  playerLoading.value = true;
  playUrl.value = "";
  try {
    const [detailResult, urlResult] = await Promise.allSettled([
      videoDetail(item.vid),
      videoUrl(item.vid),
    ]);
    if (detailResult.status === "fulfilled") {
      const data: any = (detailResult.value as any)?.data;
      if (data?.title) current.value = { ...item, ...data, vid: String(data.vid ?? item.vid) };
    }
    const rawUrl = urlResult.status === "fulfilled" ? (urlResult.value as any)?.data?.url : "";
    playUrl.value = safeUrl(rawUrl);
  } finally {
    playerLoading.value = false;
  }
};

/** 查看评论 */
const goComment = (vid: string) => {
  router.push({ name: "comment", query: { id: vid, type: "video" } });
};

onMounted(async () => {
  await getTags();
  await getVideos(true);
});
</script>

<style lang="scss" scoped>
.video-square {
  height: 100%;
  overflow: auto;
  .title {
    display: flex;
    align-items: flex-end;
    margin-top: 12px;
    margin-bottom: 12px;
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
  .tags {
    margin-bottom: 16px;
    max-height: 96px;
    overflow: auto;
    .tag {
      cursor: pointer;
    }
  }
  .video-card {
    cursor: pointer;
    .cover-wrap {
      position: relative;
      .cover {
        width: 100%;
        aspect-ratio: 16 / 9;
        object-fit: cover;
        border-radius: 10px;
      }
      .duration {
        position: absolute;
        right: 6px;
        bottom: 6px;
        font-size: 12px;
        padding: 1px 5px;
        border-radius: 6px;
        background: rgba(0, 0, 0, 0.55);
        color: #fff;
      }
    }
    .card-title {
      display: block;
      margin-top: 6px;
      font-size: 14px;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .card-meta {
      .meta-text {
        font-size: 12px;
        max-width: 50%;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
    }
  }
  .load-more {
    margin: 16px 0;
  }
  .player {
    width: 100%;
    max-height: 60vh;
    border-radius: 10px;
    background: #000;
  }
}
</style>
