<!-- 音乐日历（npm 版 API：/calendar） -->
<template>
  <div class="music-calendar">
    <div class="title">
      <n-text class="name">音乐日历</n-text>
      <n-text class="tip" depth="3">按天回看你听过的歌</n-text>
    </div>
    <n-flex class="menu" align="center" justify="space-between">
      <n-date-picker
        v-model:value="monthValue"
        type="month"
        :clearable="false"
        :actions="null"
        @update:value="getCalendar"
      />
      <n-button :focusable="false" strong secondary round :loading="loading" @click="getCalendar">
        <template #icon>
          <SvgIcon name="Refresh" />
        </template>
        刷新
      </n-button>
    </n-flex>
    <n-spin :show="loading">
      <n-empty
        v-if="!loading && dayList.length === 0"
        description="该时间段暂无听歌记录"
        style="margin-top: 60px"
        size="large"
      />
      <div v-for="day in dayList" :key="day.date" class="day">
        <div class="day-header">
          <n-text class="date">{{ day.date }}</n-text>
          <n-text class="meta" depth="3">
            {{ day.songs.length }} 首 · 共播放
            {{ day.songs.reduce((total, song) => total + (song.playCount || 0), 0) }} 次
          </n-text>
          <n-button
            :focusable="false"
            size="small"
            strong
            secondary
            round
            @click="player.updatePlayList(day.songs)"
          >
            <template #icon>
              <SvgIcon name="Play" />
            </template>
            播放本日
          </n-button>
        </div>
        <SongList :data="day.songs" :loading="false" height="auto" disabledSort hiddenAlbumCover />
      </div>
    </n-spin>
  </div>
</template>

<script setup lang="ts">
import type { SongType } from "@/types/main";
import type { NeteaseCalendarDay, NeteaseCalendarSong } from "@/types/netease";
import { calendar } from "@/api/netease";
import { songDetail } from "@/api/song";
import { formatSongsList } from "@/utils/format";
import { usePlayerController } from "@/core/player/PlayerController";

const player = usePlayerController();

/** 当前选择的月份 */
const monthValue = ref<number>(Date.now());
const loading = ref<boolean>(false);
/** 规范化后的日历数据（只保留有记录的日期） */
const dayList = ref<Array<{ date: string; songs: SongType[] }>>([]);

/** 把上游返回的 data 规整为「日期 + 歌曲」数组（兼容数组与对象两种形态） */
const normalizeDays = (data: unknown): NeteaseCalendarDay[] => {
  if (!data) return [];
  if (Array.isArray(data)) return data.filter(Boolean) as NeteaseCalendarDay[];
  return Object.entries(data as Record<string, unknown>)
    .map(([date, value]) => {
      if (Array.isArray(value)) return { date, songs: value } as NeteaseCalendarDay;
      const item = (value ?? {}) as NeteaseCalendarDay;
      return { ...item, date: item.date ?? date } as NeteaseCalendarDay;
    })
    .filter(Boolean);
};

/** 拉取日历数据（默认查询所选月份） */
const getCalendar = async () => {
  loading.value = true;
  try {
    const start = new Date(monthValue.value);
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(monthValue.value);
    end.setMonth(end.getMonth() + 1);
    end.setDate(0);
    end.setHours(23, 59, 59, 999);

    const result = await calendar(start.getTime(), end.getTime());
    const days = normalizeDays(result?.data).filter((day) => day?.songs?.length);

    // 上游日历只返回歌曲 id + 播放次数时，补齐歌曲信息（歌名 / 歌手 / 专辑 / 时长）
    const missingIds = days
      .flatMap((day) => day.songs || [])
      .filter((song: NeteaseCalendarSong) => !song.name || !song.ar)
      .map((song: NeteaseCalendarSong) => song.id)
      .filter(Boolean);
    if (missingIds.length) {
      const detail = await songDetail([...new Set(missingIds)].slice(0, 200));
      const detailMap = new Map<number, any>(
        (detail?.songs ?? []).map((song: any) => [song.id, song]),
      );
      days.forEach((day) => {
        day.songs = (day.songs || []).map((song) => detailMap.get(song.id) ?? song);
      });
    }

    // 合并播放次数（上游字段名不一，做兼容）
    dayList.value = days
      .map((day) => {
        const songs = formatSongsList(day.songs || []);
        songs.forEach((song, index) => {
          (song as SongType & { playCount?: number }).playCount =
            (day.songs?.[index] as NeteaseCalendarSong)?.playCount ?? 1;
        });
        return { date: String(day.date ?? "").slice(0, 10), songs };
      })
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  } finally {
    loading.value = false;
  }
};

onMounted(getCalendar);
</script>

<style lang="scss" scoped>
.music-calendar {
  display: flex;
  flex-direction: column;
  height: 100%;
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
  .menu {
    margin-bottom: 16px;
  }
  .day {
    margin-bottom: 24px;
    .day-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 8px;
      .date {
        font-size: 18px;
        font-weight: bold;
      }
      .meta {
        font-size: 13px;
        flex: 1;
      }
    }
  }
}
</style>
