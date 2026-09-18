<!-- 电台榜单（npm 版 API：/dj/hot、/dj/recommend、/dj/program/toplist、/dj/paygift） -->
<template>
  <div class="radio-board">
    <div class="title">
      <n-text class="name">电台榜单</n-text>
      <n-text class="tip" depth="3">热门、推荐、节目榜与付费精品</n-text>
    </div>
    <n-tabs v-model:value="activeTab" class="tabs" type="segment" animated @update:value="getData">
      <n-tab-pane name="hot" tab="热门电台" />
      <n-tab-pane name="recommend" tab="推荐电台" />
      <n-tab-pane name="program" tab="节目榜" />
      <n-tab-pane name="paygift" tab="付费精品" />
    </n-tabs>
    <n-spin :show="loading">
      <!-- 节目榜（按排名列表） -->
      <n-list v-if="activeTab === 'program'" hoverable clickable>
        <n-list-item v-for="item in programs" :key="item.id" @click="goRadio(item.radioId)">
          <n-flex align="center" justify="space-between">
            <n-flex align="center">
              <n-text class="rank" :class="{ top: item.rank <= 3 }">{{ item.rank }}</n-text>
              <img v-if="item.cover" class="mini-cover" :src="item.cover" loading="lazy" alt="" />
              <div class="program-info">
                <n-text class="program-name" :title="item.name">{{ item.name }}</n-text>
                <n-text depth="3" class="program-sub">
                  {{ item.radioName }} · {{ item.djName }}
                </n-text>
              </div>
            </n-flex>
            <n-text depth="3" class="score">{{ item.score }} 分</n-text>
          </n-flex>
        </n-list-item>
      </n-list>
      <!-- 电台卡片 -->
      <n-grid
        v-else-if="radios.length"
        :cols="5"
        :x-gap="16"
        :y-gap="16"
        item-responsive
        responsive="screen"
      >
        <n-grid-item v-for="radio in radios" :key="radio.id" span="2 s:1">
          <div class="radio-card" @click="goRadio(radio.id)">
            <img class="cover" :src="radio.cover" loading="lazy" alt="" />
            <n-text class="radio-name" :title="radio.name">{{ radio.name }}</n-text>
            <n-text depth="3" class="radio-sub">
              {{ radio.djNickname || "" }} · {{ radio.programCount }} 期
            </n-text>
            <n-text depth="3" class="radio-sub">
              订阅 {{ formatCommentCount(radio.subCount || 0) }}
            </n-text>
          </div>
        </n-grid-item>
      </n-grid>
      <n-empty v-else-if="!loading" description="暂无数据" size="small" style="margin-top: 40px" />
    </n-spin>
  </div>
</template>

<script setup lang="ts">
import { djHot, djPaygift, djProgramToplist, djRecommend } from "@/api/netease";
import { formatCommentCount } from "@/utils/format";

const router = useRouter();

const loading = ref<boolean>(false);
const activeTab = ref<string>("hot");
/** 电台卡片数据 */
const radios = ref<
  Array<{
    id: number;
    name: string;
    cover: string;
    djNickname?: string;
    programCount?: number;
    subCount?: number;
  }>
>([]);
/** 节目榜数据 */
const programs = ref<
  Array<{
    id: number;
    rank: number;
    name: string;
    cover: string;
    radioName?: string;
    djName?: string;
    score?: number;
    radioId?: number;
  }>
>([]);

/** 归一化电台条目 */
const normalizeRadios = (items: any[]) =>
  (items || [])
    .map((item) => ({
      id: Number(item?.id ?? item?.rid ?? 0),
      name: item?.name ?? item?.radioName ?? "未知电台",
      cover: item?.picUrl ?? item?.coverUrl ?? item?.cover ?? "",
      djNickname: item?.dj?.nickname ?? item?.djNickname ?? item?.nickname ?? "",
      programCount: Number(item?.programCount ?? 0),
      subCount: Number(item?.subCount ?? 0),
    }))
    .filter((item) => item.id);

/** 拉取当前 Tab 数据 */
const getData = async () => {
  loading.value = true;
  try {
    if (activeTab.value === "hot") {
      const result = await djHot(30, 0);
      radios.value = normalizeRadios(result?.djRadios ?? []);
    } else if (activeTab.value === "recommend") {
      const result = await djRecommend();
      radios.value = normalizeRadios(result?.djRadios ?? []);
    } else if (activeTab.value === "paygift") {
      // /dj/paygift 返回 data[0].list
      const result: any = await djPaygift(30, 0);
      const list = Array.isArray(result?.data)
        ? (result.data[0]?.list ?? [])
        : (result?.data?.list ?? []);
      radios.value = normalizeRadios(list);
    } else {
      const result = await djProgramToplist(50, 0);
      programs.value = (result?.toplist ?? [])
        .map((item: any) => {
          const program = item?.program ?? {};
          return {
            id: Number(program.id ?? 0),
            rank: Number(item?.rank ?? 0),
            name: program.name ?? "未知节目",
            cover: program.coverUrl ?? program.blurCoverUrl ?? program.radio?.picUrl ?? "",
            radioName: program.radio?.name ?? "",
            djName: program.dj?.nickname ?? program.mainSong?.artists?.[0]?.name ?? "",
            score: Number(item?.score ?? 0),
            radioId: Number(program.radio?.id ?? 0),
          };
        })
        .filter((item) => item.name);
      radios.value = [];
    }
  } finally {
    loading.value = false;
  }
};

/** 进入电台详情（复用既有电台页） */
const goRadio = (rid?: number) => {
  if (!rid) return;
  router.push({ name: "radio", query: { id: rid } });
};

onMounted(getData);
</script>

<style lang="scss" scoped>
.radio-board {
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
  .tabs {
    :deep(.n-tabs-nav) {
      margin-bottom: 14px;
    }
  }
  .radio-card {
    cursor: pointer;
    .cover {
      width: 100%;
      aspect-ratio: 1 / 1;
      object-fit: cover;
      border-radius: 10px;
    }
    .radio-name {
      display: block;
      margin-top: 6px;
      font-size: 14px;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .radio-sub {
      display: block;
      font-size: 12px;
    }
  }
  .rank {
    width: 26px;
    text-align: center;
    font-weight: bold;
    font-size: 15px;
    &.top {
      color: var(--n-color-target, #f0a020);
    }
  }
  .mini-cover {
    width: 44px;
    height: 44px;
    border-radius: 8px;
    object-fit: cover;
    margin: 0 10px;
  }
  .program-info {
    .program-name {
      display: block;
      font-weight: bold;
    }
    .program-sub {
      display: block;
      font-size: 12px;
    }
  }
  .score {
    font-size: 12px;
  }
}
</style>
