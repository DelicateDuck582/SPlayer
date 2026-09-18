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

/**
 * 把单条原始条目规整为「日期 + 歌曲」
 *
 * 实测：登录后上游 `data` 形如 `{ calendarEvents: [{ date, songs: [...] }], calendarConfig }`，
 * 歌曲条目可能只有 `id/playCount`，也可能带 `song: { id, name, ar, al }` 嵌套。
 */
const coerceDay = (item: any, index: number): NeteaseCalendarDay | null => {
  if (Array.isArray(item)) return null;
  if (!item || typeof item !== "object") return null;
  const date =
    String(item.date ?? item.day ?? item.time ?? item.startTime ?? "")
      .slice(0, 10)
      .trim() || `#${index}`;
  // 歌曲列表可能叫 songs / songList / songDatas，或直接就是条目本身（以日期为键的简写）
  const rawSongs = item.songs ?? item.songList ?? item.songDatas ?? item.list ?? [];
  if (!Array.isArray(rawSongs)) return null;
  const songs = rawSongs
    .map((raw: any) => {
      const inner = raw?.song ?? raw?.data ?? raw;
      const id = Number(inner?.id ?? raw?.songId ?? raw?.id ?? 0);
      if (!id) return null;
      const arRaw = inner?.ar ?? inner?.artists ?? inner?.artist;
      const ar = Array.isArray(arRaw)
        ? arRaw
        : typeof arRaw === "string"
          ? [{ id: 0, name: arRaw }]
          : typeof inner?.artistName === "string"
            ? [{ id: 0, name: inner.artistName }]
            : undefined;
      return {
        id,
        name: inner?.name ?? inner?.title,
        ar,
        al: inner?.al ?? inner?.album,
        playCount: Number(raw?.playCount ?? raw?.playTimes ?? inner?.playCount ?? 1),
      } as NeteaseCalendarSong;
    })
    .filter((song): song is NeteaseCalendarSong => !!song);
  return songs.length ? { date, songs } : null;
};

/** 把上游返回的 data 规整为「日期 + 歌曲」数组（兼容 calendarEvents / days / 日期键 / 数组四种形态） */
const normalizeDays = (data: unknown): NeteaseCalendarDay[] => {
  if (!data) return [];
  // 1) 数组形态：可能直接是「日期条目」数组
  if (Array.isArray(data)) {
    return data
      .map((item, index) => coerceDay(item, index))
      .filter((day): day is NeteaseCalendarDay => !!day);
  }
  const record = data as Record<string, any>;
  // 2) 常见容器字段（登录后真实形态：calendarEvents）
  for (const key of ["calendarEvents", "days", "calendarDetail", "list", "data"]) {
    if (Array.isArray(record[key])) {
      const days = record[key]
        .map((item: any, index: number) => coerceDay(item, index))
        .filter((day: NeteaseCalendarDay | null): day is NeteaseCalendarDay => !!day);
      if (days.length) return days;
    }
  }
  // 3) 以日期为键：{ "2026-09-19": [{ id, playCount }] | { songs: [...] } }
  return Object.entries(record)
    .map(([date, value], index) =>
      coerceDay(
        Array.isArray(value) ? { date, songs: value } : { date, ...(value as object) },
        index,
      ),
    )
    .filter((day): day is NeteaseCalendarDay => !!day);
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
    const days = normalizeDays(result?.data);

    // 上游日历通常只返回歌曲 id（+ 播放次数），这里补齐歌名 / 歌手 / 专辑 / 时长
    const missingIds = [
      ...new Set(
        days
          .flatMap((day) => day.songs || [])
          .filter((song) => !song.name || !song.ar?.length)
          .map((song) => song.id),
      ),
    ];
    if (missingIds.length) {
      const detailMap = new Map<number, any>();
      // 分批请求（上游单次上限约 200 个 id，月记录较多时需多批）
      for (let i = 0; i < missingIds.length; i += 200) {
        const batch = missingIds.slice(i, i + 200);
        const detail: any = await songDetail(batch);
        const songs: any[] = detail?.songs ?? detail?.data?.songs ?? [];
        songs.forEach((song: any) => song?.id && detailMap.set(Number(song.id), song));
      }
      days.forEach((day) => {
        day.songs = (day.songs || []).map((song) => {
          const detail = detailMap.get(Number(song.id));
          if (!detail) return song;
          return {
            ...song,
            name: detail.name ?? song.name,
            ar: detail.ar ?? song.ar,
            al: detail.al ?? song.al,
          };
        });
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
