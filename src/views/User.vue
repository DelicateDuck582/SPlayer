<!-- 用户主页（npm 版 API：/user/detail、/user/playlist、/user/follows、/user/followeds、/user/record、/follow） -->
<template>
  <div class="user-view">
    <n-spin :show="loading">
      <n-card v-if="profile" class="profile" :bordered="false">
        <n-flex class="header" align="center" justify="space-between">
          <n-flex align="center">
            <n-avatar round :size="72" :src="profile.avatarUrl" />
            <div class="info">
              <n-flex align="center">
                <n-text class="nickname">{{ profile.nickname || "未知用户" }}</n-text>
                <n-tag :bordered="false" round size="small">Lv.{{ level }}</n-tag>
              </n-flex>
              <n-text class="signature" depth="3">{{
                profile.signature || "这个人很懒，什么都没写"
              }}</n-text>
              <n-flex class="counts">
                <n-text depth="3" class="count" @click="activeTab = 'playlist'">
                  歌单 {{ playlistCount }}
                </n-text>
                <n-text depth="3" class="count" @click="activeTab = 'follows'">
                  关注 {{ profile.follows || 0 }}
                </n-text>
                <n-text depth="3" class="count" @click="activeTab = 'followeds'">
                  粉丝 {{ profile.followeds || 0 }}
                </n-text>
                <n-text depth="3" class="count">听歌 {{ listenSongs }} 首</n-text>
              </n-flex>
            </div>
          </n-flex>
          <n-button
            v-if="!isSelf"
            :focusable="false"
            :type="profile.followed ? 'default' : 'primary'"
            strong
            secondary
            round
            @click="toggleFollow"
          >
            <template #icon>
              <SvgIcon name="Add" />
            </template>
            {{ profile.followed ? "已关注" : "关注 TA" }}
          </n-button>
        </n-flex>
      </n-card>

      <n-tabs v-model:value="activeTab" class="tabs" type="segment" animated>
        <n-tab-pane name="playlist" tab="歌单">
          <CoverList
            v-if="playlists.length"
            :data="playlists"
            :loading="false"
            type="playlist"
            :hiddenCover="settingStore.hiddenCovers.playlist"
          />
          <n-empty v-else description="暂无公开歌单" size="small" />
        </n-tab-pane>
        <n-tab-pane name="follows" tab="关注">
          <n-list v-if="follows.length" hoverable clickable>
            <n-list-item v-for="item in follows" :key="item.userId" @click="goUser(item.userId)">
              <n-flex align="center">
                <n-avatar round :size="40" :src="item.avatarUrl" />
                <n-text class="user-name">{{ item.nickname }}</n-text>
                <n-text depth="3" class="user-sign">{{ item.signature || "" }}</n-text>
              </n-flex>
            </n-list-item>
          </n-list>
          <n-empty v-else description="暂无关注" size="small" />
        </n-tab-pane>
        <n-tab-pane name="followeds" tab="粉丝">
          <n-list v-if="followeds.length" hoverable clickable>
            <n-list-item v-for="item in followeds" :key="item.userId" @click="goUser(item.userId)">
              <n-flex align="center">
                <n-avatar round :size="40" :src="item.avatarUrl" />
                <n-text class="user-name">{{ item.nickname }}</n-text>
                <n-text depth="3" class="user-sign">{{ item.signature || "" }}</n-text>
              </n-flex>
            </n-list-item>
          </n-list>
          <n-empty v-else description="暂无粉丝" size="small" />
        </n-tab-pane>
        <n-tab-pane name="record" tab="听歌排行">
          <n-flex class="record-menu" align="center" justify="space-between">
            <n-tabs
              v-model:value="recordType"
              size="small"
              type="segment"
              @update:value="getUserRecord"
            >
              <n-tab name="week">最近一周</n-tab>
              <n-tab name="all">所有时间</n-tab>
            </n-tabs>
            <n-text depth="3" class="count">{{ recordSongs.length }} 首</n-text>
          </n-flex>
          <SongList
            v-if="recordSongs.length"
            :data="recordSongs"
            :loading="false"
            height="auto"
            disabledSort
          />
          <n-empty v-else description="暂无听歌记录（需要对方主页公开）" size="small" />
        </n-tab-pane>
      </n-tabs>
    </n-spin>
  </div>
</template>

<script setup lang="ts">
import type { CoverType, SongType } from "@/types/main";
import type { NeteaseUserProfile } from "@/types/netease";
import {
  follow,
  userDetail,
  userFolloweds,
  userFollows,
  userPlaylist,
  userRecord,
} from "@/api/netease";
import { formatCoverList, formatSongsList } from "@/utils/format";
import { isLogin } from "@/utils/auth";
import { openUserLogin } from "@/utils/modal";
import { useDataStore, useSettingStore } from "@/stores";

const route = useRoute();
const router = useRouter();
const dataStore = useDataStore();
const settingStore = useSettingStore();

const loading = ref<boolean>(false);
const profile = ref<NeteaseUserProfile | null>(null);
const level = ref<number>(0);
const listenSongs = ref<number>(0);
const playlists = ref<CoverType[]>([]);
const follows = ref<any[]>([]);
const followeds = ref<any[]>([]);
const recordSongs = ref<SongType[]>([]);
const activeTab = ref<string>("playlist");
const recordType = ref<string>("week");

/** 目标用户 id：地址栏优先，其次当前登录用户 */
const uid = computed<number>(
  () => Number(route.query?.uid) || Number(dataStore.userData.userId) || 0,
);
/** 是否是自己 */
const isSelf = computed<boolean>(() => uid.value === Number(dataStore.userData.userId));
/** 歌单数量 */
const playlistCount = computed<number>(() => playlists.value.length);

/** 拉取用户数据（多接口并发，单项失败不影响其余） */
const getUserData = async () => {
  if (!uid.value) {
    router.replace({ path: "/403" });
    return;
  }
  loading.value = true;
  try {
    const [detailResult, playlistResult, followsResult, followedsResult] = await Promise.allSettled(
      [
        userDetail(uid.value),
        userPlaylist(uid.value, 100),
        userFollows(uid.value, 60),
        userFolloweds(uid.value, 60),
      ],
    );

    if (detailResult.status === "fulfilled") {
      profile.value = detailResult.value?.profile ?? null;
      level.value = Number(detailResult.value?.level ?? 0);
      listenSongs.value = Number(detailResult.value?.listenSongs ?? 0);
    }
    if (playlistResult.status === "fulfilled") {
      playlists.value = formatCoverList(
        (playlistResult.value?.playlist ?? []).filter((item: any) => item?.id),
      );
    }
    if (followsResult.status === "fulfilled") {
      follows.value = followsResult.value?.follow ?? [];
    }
    if (followedsResult.status === "fulfilled") {
      followeds.value = followedsResult.value?.followeds ?? [];
    }
    await getUserRecord();
  } finally {
    loading.value = false;
  }
};

/** 听歌排行（0：所有时间 / 1：最近一周） */
const getUserRecord = async () => {
  const result = await userRecord(uid.value, recordType.value === "week" ? 1 : 0);
  const source = recordType.value === "week" ? (result?.weekData ?? []) : (result?.allData ?? []);
  recordSongs.value = formatSongsList(source.map((item) => item.song).filter(Boolean));
};

/** 关注 / 取关 */
const toggleFollow = async () => {
  if (!isLogin()) {
    window.$message?.warning("请先登录");
    openUserLogin();
    return;
  }
  const next = profile.value?.followed ? 2 : 1;
  const result: any = await follow(uid.value, next as 1 | 2);
  if (result?.code === 200) {
    if (profile.value) profile.value.followed = next === 1;
    window.$message?.success(next === 1 ? "已关注" : "已取消关注");
  } else {
    window.$message?.warning(result?.message ?? "操作失败，请稍后再试");
  }
};

/** 跳转其它用户主页 */
const goUser = (userId: number) => {
  router.push({ name: "user", query: { uid: userId } });
};

watch(
  () => route.query.uid,
  () => getUserData(),
);

onMounted(getUserData);
</script>

<style lang="scss" scoped>
.user-view {
  height: 100%;
  overflow: auto;
  .profile {
    margin-top: 12px;
    border-radius: 12px;
    .header {
      .info {
        margin-left: 16px;
        .nickname {
          font-size: 22px;
          font-weight: bold;
          margin-right: 8px;
        }
        .signature {
          display: block;
          margin-top: 6px;
          font-size: 13px;
        }
        .counts {
          margin-top: 8px;
          gap: 16px;
          .count {
            cursor: pointer;
            font-size: 13px;
          }
        }
      }
    }
  }
  .tabs {
    margin-top: 16px;
    :deep(.n-tabs-nav) {
      margin-bottom: 12px;
    }
  }
  .user-name {
    margin-left: 10px;
    font-weight: bold;
  }
  .user-sign {
    margin-left: 10px;
    font-size: 12px;
  }
  .record-menu {
    margin-bottom: 12px;
  }
}
</style>
