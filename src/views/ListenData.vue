<!-- 听歌足迹 / 统计（npm 版 API：/listen/data/*） -->
<template>
  <div class="listen-data">
    <div class="title">
      <n-text class="name">听歌足迹</n-text>
      <n-text class="tip" depth="3">数据来自网易云「听歌足迹」</n-text>
    </div>
    <n-spin :show="loading">
      <n-grid :cols="4" :x-gap="16" :y-gap="16" item-responsive responsive="screen">
        <n-grid-item span="4 s:2 m:1">
          <n-card class="stat-card" :bordered="false">
            <n-statistic label="累计收听时长" :value="formatDuration(total.duration)" />
            <n-text depth="3" class="sub">共听 {{ total.songs }} 首歌</n-text>
          </n-card>
        </n-grid-item>
        <n-grid-item span="4 s:2 m:1">
          <n-card class="stat-card" :bordered="false">
            <n-statistic label="本周收听时长" :value="formatDuration(report.week?.duration)" />
            <n-text depth="3" class="sub">{{ report.week?.range || "-" }}</n-text>
          </n-card>
        </n-grid-item>
        <n-grid-item span="4 s:2 m:1">
          <n-card class="stat-card" :bordered="false">
            <n-statistic label="本月收听时长" :value="formatDuration(report.month?.duration)" />
            <n-text depth="3" class="sub">{{ report.month?.range || "-" }}</n-text>
          </n-card>
        </n-grid-item>
        <n-grid-item span="4 s:2 m:1">
          <n-card class="stat-card" :bordered="false">
            <n-statistic label="年度听歌足迹" :value="formatDuration(year.duration)" />
            <n-text depth="3" class="sub">{{ year.range || "暂无年度报告" }}</n-text>
          </n-card>
        </n-grid-item>
      </n-grid>
      <n-card class="today" :bordered="false">
        <template #header>
          <n-flex align="center" justify="space-between">
            <n-text>今日收听</n-text>
            <n-button :focusable="false" size="small" strong secondary round @click="getListenData">
              <template #icon>
                <SvgIcon name="Refresh" />
              </template>
              刷新
            </n-button>
          </n-flex>
        </template>
        <SongList
          v-if="todaySongs.length"
          :data="todaySongs"
          :loading="false"
          height="auto"
          disabledSort
        />
        <n-empty v-else description="今天还没有听歌记录" size="small" />
      </n-card>
    </n-spin>
  </div>
</template>

<script setup lang="ts">
import type { SongType } from "@/types/main";
import {
  listenDataRealtimeReport,
  listenDataReport,
  listenDataTodaySong,
  listenDataTotal,
  listenDataYearReport,
} from "@/api/netease";
import { songDetail } from "@/api/song";
import { formatSongsList } from "@/utils/format";

const loading = ref<boolean>(false);
/** 累计数据 */
const total = ref<{ duration: number; songs: number }>({ duration: 0, songs: 0 });
/** 周 / 月报告 */
const report = ref<Record<string, { duration: number; range: string }>>({});
/** 年度报告 */
const year = ref<{ duration: number; range: string }>({ duration: 0, range: "" });
/** 今日收听歌曲 */
const todaySongs = ref<SongType[]>([]);

/** 毫秒 → 「x 小时 y 分钟」 */
const formatDuration = (duration?: number) => {
  if (!duration) return "0 分钟";
  const minutes = Math.floor(duration / 1000 / 60);
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours} 小时 ${minutes % 60} 分钟` : `${minutes} 分钟`;
};

/** 时间戳区间 → 「MM-DD ~ MM-DD」 */
const formatRange = (startTime?: number, endTime?: number) => {
  if (!startTime || !endTime) return "";
  const format = (time: number) => {
    const date = new Date(time);
    return `${date.getMonth() + 1}-${date.getDate()}`;
  };
  return `${format(startTime)} ~ ${format(endTime)}`;
};

/** 获取全部统计数据（并发请求，单项失败不影响其余） */
const getListenData = async () => {
  loading.value = true;
  try {
    const [totalResult, weekResult, monthResult, yearResult, todayResult] =
      await Promise.allSettled([
        listenDataTotal(),
        listenDataRealtimeReport(),
        listenDataReport("month"),
        listenDataYearReport(),
        listenDataTodaySong(),
      ]);

    if (totalResult.status === "fulfilled") {
      total.value = {
        duration: totalResult.value?.data?.totalDuration ?? 0,
        songs: totalResult.value?.data?.listenSongs ?? 0,
      };
    }
    if (weekResult.status === "fulfilled") {
      report.value.week = {
        duration: weekResult.value?.data?.duration ?? 0,
        range: formatRange(weekResult.value?.data?.startTime, weekResult.value?.data?.endTime),
      };
    }
    if (monthResult.status === "fulfilled") {
      report.value.month = {
        duration: monthResult.value?.data?.duration ?? 0,
        range: formatRange(monthResult.value?.data?.startTime, monthResult.value?.data?.endTime),
      };
    }
    if (yearResult.status === "fulfilled") {
      year.value = {
        duration: yearResult.value?.data?.duration ?? 0,
        range: formatRange(yearResult.value?.data?.startTime, yearResult.value?.data?.endTime),
      };
    }

    // 今日收听：上游只给 id + 次数，补一次歌曲详情
    const rawSongs =
      todayResult.status === "fulfilled" ? (todayResult.value?.data?.songs ?? []) : [];
    if (rawSongs.length) {
      const ids = [...new Set(rawSongs.map((item) => item.songId))];
      const detail = await songDetail(ids.slice(0, 100));
      const detailMap = new Map<number, any>(
        (detail?.songs ?? []).map((song: any) => [song.id, song]),
      );
      // 去重 + 详情缺失时用上游自带字段兜底（避免出现"未知歌手/未知作者"）
      const merged = new Map<number, any>();
      rawSongs.forEach((item) => {
        const id = Number(item.songId);
        if (!id || merged.has(id)) return;
        merged.set(
          id,
          detailMap.get(id) ?? {
            id,
            name: item.songName ?? `歌曲 #${id}`,
            ar: (item as any).artistName ? [{ id: 0, name: (item as any).artistName }] : undefined,
            al: (item as any).albumName ? { id: 0, name: (item as any).albumName } : undefined,
          },
        );
      });
      todaySongs.value = formatSongsList([...merged.values()]);
    } else {
      todaySongs.value = [];
    }
  } finally {
    loading.value = false;
  }
};

onMounted(getListenData);
</script>

<style lang="scss" scoped>
.listen-data {
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
  .stat-card {
    border-radius: 12px;
    .sub {
      display: block;
      margin-top: 6px;
      font-size: 12px;
    }
  }
  .today {
    margin-top: 16px;
    border-radius: 12px;
  }
}
</style>
