<template>
  <div class="cloud">
    <div class="title">
      <n-text class="keyword">我的云盘</n-text>
      <n-flex class="status">
        <n-text class="item">
          <SvgIcon name="Music" :depth="3" />
          <n-number-animation :from="0" :to="cloudCount || cloudData?.length || 0" /> 首
        </n-text>
        <n-text class="item">
          <SvgIcon name="Storage" :depth="3" />
          <n-progress
            :percentage="100 / (cloudSize.maxSize / cloudSize.size)"
            class="status"
            type="line"
          >
            <n-text class="space" depth="3">
              {{ cloudSize.size ?? 0 }}GB / {{ cloudSize.maxSize ?? 0 }}GB
            </n-text>
          </n-progress>
        </n-text>
      </n-flex>
    </div>
    <n-flex class="menu" justify="space-between">
      <n-flex class="left" align="flex-end">
        <!-- 上传到云盘 -->
        <n-button
          :focusable="false"
          :disabled="isUploading"
          :loading="isUploading"
          type="primary"
          strong
          secondary
          round
          @click="triggerUpload"
        >
          <template #icon>
            <SvgIcon name="Upload" />
          </template>
          {{ isUploading ? `上传中 ${uploadPercent}%` : "上传" }}
        </n-button>
        <input
          ref="fileInputRef"
          type="file"
          accept="audio/*,.mp3,.flac,.m4a,.wav,.ape,.ogg,.aac,.wma"
          multiple
          style="display: none"
          @change="handleFileChange"
        />
        <n-button
          :focusable="false"
          :disabled="showLoading || !cloudData?.length"
          :loading="showLoading"
          type="primary"
          strong
          secondary
          round
          v-debounce="() => player.updatePlayList(listDataShow)"
        >
          <template #icon>
            <SvgIcon name="Play" />
          </template>
          {{ showLoading ? `正在加载... (${cloudData.length}/${cloudCount})` : "播放" }}
        </n-button>
        <n-button :focusable="false" class="more" strong secondary circle @click="getAllCloudMusic">
          <template #icon>
            <SvgIcon name="Refresh" />
          </template>
        </n-button>
        <!-- 更多 -->
        <n-dropdown :options="moreOptions" trigger="click" placement="bottom-start">
          <n-button :focusable="false" class="more" circle strong secondary>
            <template #icon>
              <SvgIcon name="List" />
            </template>
          </n-button>
        </n-dropdown>
      </n-flex>
      <!-- 模糊搜索 -->
      <n-input
        v-if="cloudData?.length"
        v-model:value="searchValue"
        :input-props="{ autocomplete: 'off' }"
        class="search"
        placeholder="模糊搜索"
        clearable
        round
      >
        <template #prefix>
          <SvgIcon name="Search" />
        </template>
      </n-input>
    </n-flex>
    <!-- 未完成上传（刷新/中断后可断点续传） -->
    <n-alert
      v-if="pendingTasks.length"
      class="resume-tip"
      type="info"
      closable
      @close="handleDismissQueue"
    >
      有 {{ pendingTasks.length }} 个未完成的上传（剩余 {{ pendingSizeText }}）：
      重新选择相同文件即可从断点继续
      <n-button class="resume-btn" size="small" type="primary" ghost @click="resumeUpload">
        继续上传
      </n-button>
    </n-alert>
    <!-- 列表 -->
    <Transition name="fade" mode="out-in">
      <SongList
        v-if="!searchValue || searchData?.length"
        :data="listDataShow"
        :loading="loading"
        :doubleClickAction="searchData?.length ? 'add' : 'all'"
        @removeSong="handleRemoveSong"
      />
      <n-empty
        v-else
        :description="`搜不到关于 ${searchValue} 的任何歌曲呀`"
        style="margin-top: 60px"
        size="large"
      >
        <template #icon>
          <SvgIcon name="SearchOff" />
        </template>
      </n-empty>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import type { SongType } from "@/types/main";
import type { DropdownOption } from "naive-ui";
import { useDataStore } from "@/stores";
import { uploadCloudSong, userCloud } from "@/api/cloud";
import { formatSongsList } from "@/utils/format";
import {
  clearUploadQueue,
  fileKey,
  readUploadQueue,
  removeUploadTask,
  saveUploadTask,
  type CloudUploadTask,
} from "@/utils/uploadQueue";
import { fuzzySearch, renderIcon } from "@/utils/helper";
import { openBatchList } from "@/utils/modal";
import { usePlayerController } from "@/core/player/PlayerController";

const router = useRouter();
const dataStore = useDataStore();
const player = usePlayerController();

// 是否激活
const isActivated = ref<boolean>(false);

// 云盘数据
const loading = ref<boolean>(false);
const cloudCount = ref<number>(0);
const cloudData = ref<SongType[]>(dataStore.cloudPlayList);
const cloudSize = ref<{ size: number; maxSize: number }>({ size: 0, maxSize: 0 });

// 模糊搜索数据
const searchValue = ref<string>("");
const searchData = ref<SongType[]>([]);

// 列表歌曲
const listDataShow = computed<SongType[]>(() => {
  if (searchValue.value && searchData.value.length) return searchData.value;
  return cloudData.value;
});

// 加载状态
const showLoading = computed(() => cloudData.value.length === 0 && loading.value);

// 是否处于云盘页面
const isCloudPage = computed<boolean>(() => router.currentRoute.value.name === "cloud");

// 更多操作
const moreOptions = computed<DropdownOption[]>(() => [
  {
    label: "批量操作",
    key: "batch",
    props: {
      onClick: () => openBatchList(cloudData.value, false),
    },
    icon: renderIcon("Batch"),
  },
]);

// 获取全部云盘歌曲
const getAllCloudMusic = async () => {
  loading.value = true;
  // 必要数据
  let offset: number = 0;
  const limit: number = 500;
  const listData: SongType[] = [];
  // 循环获取
  do {
    const result = await userCloud(limit, offset);
    const songData = formatSongsList(result.data);
    // 歌曲总数
    cloudCount.value = result.count;
    // 云盘空间
    cloudSize.value = {
      size: Number((result.size / Math.pow(1024, 3)).toFixed(2)),
      maxSize: Number((result.maxSize / Math.pow(1024, 3)).toFixed(0)),
    };
    // 更新数据
    listData.push(...songData);
    cloudData.value = listData;
    offset += limit;
  } while (offset < cloudCount.value && isCloudPage.value);
  // 更新云盘数据
  dataStore.setCloudPlayList(cloudData.value);
  loading.value = false;
};

watchDebounced(
  () => [searchValue.value, cloudData.value],
  () => {
    const search = searchValue.value.trim();
    if (!search || search === "" || !cloudData.value.length) return;
    // 获取搜索结果
    const result = fuzzySearch(search, cloudData.value);
    searchData.value = result;
  },
  { debounce: 300, maxWait: 1000 },
);

// 处理删除歌曲
const handleRemoveSong = (ids: number[]) => {
  // 从云盘数据中删除指定ID的歌曲
  const updatedCloudData = cloudData.value.filter((song) => !ids.includes(song.id));
  cloudData.value = updatedCloudData;
  // 同步更新store中的数据
  dataStore.setCloudPlayList(updatedCloudData);
  // listVersion.value++;
};

// ================= 上传到云盘 =================
/** 文件选择框 */
const fileInputRef = ref<HTMLInputElement | null>(null);
/** 是否正在上传（串行上传，避免并发挤占带宽/触发风控） */
const isUploading = ref<boolean>(false);
/** 当前文件上传进度（0~100） */
const uploadPercent = ref<number>(0);
/** 是否为续传模式（点击「继续上传」后为 true） */
const resumeMode = ref<boolean>(false);
/** 未完成的上传任务（本地队列，刷新后仍在） */
const pendingTasks = ref<CloudUploadTask[]>([]);
/**
 * 单文件大小上限（仅前端提示；网易云侧仍会按其规则校验）
 * 说明：MD5 需整文件读入内存，500MB 时内存峰值过高，故收敛至 200MB
 */
const UPLOAD_MAX_MB = 200;

/** 打开文件选择框 */
const triggerUpload = () => {
  if (isUploading.value) return;
  resumeMode.value = false;
  fileInputRef.value?.click();
};

/** 打开文件选择框（续传模式：仅处理未完成任务） */
const resumeUpload = () => {
  if (isUploading.value || !pendingTasks.value.length) return;
  resumeMode.value = true;
  fileInputRef.value?.click();
};

/** 未完成任务剩余体积文案 */
const pendingSizeText = computed(() => {
  const bytes = pendingTasks.value.reduce(
    (sum, task) => sum + Math.max(0, task.fileSize - task.uploaded),
    0,
  );
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)}MB`
    : `${Math.max(1, Math.round(bytes / 1024))}KB`;
});

/** 放弃未完成任务（清空本地队列） */
const handleDismissQueue = () => {
  clearUploadQueue();
  pendingTasks.value = [];
};

/** 上传失败码 → 可读文案 */
const uploadErrorMessage = (result: unknown): string => {
  const data = (result ?? {}) as Record<string, unknown>;
  const code = Number(data.code);
  if (code === -110 || code === -447) return "需要登录或会员权限不足";
  if (code === -460) return "网易云风控（出口 IP 受限），请稍后重试或更换网络";
  if (code === 301) return "登录状态已失效，请重新登录";
  if (code === 403) return "权限不足";
  if (code === 250) return "云盘空间不足";
  const message = data.message ?? data.msg;
  if (typeof message === "string" && message) return message;
  return `错误码 ${Number.isFinite(code) ? code : "未知"}`;
};

/**
 * 逐个上传所选文件（串行）
 * @param files 待上传文件列表
 * @param mode 上传模式：new 新上传；resume 断点续传（仅处理队列中已存在的任务）
 */
const uploadFiles = async (files: File[], mode: "new" | "resume" = "new") => {
  if (!files.length || isUploading.value) return;
  const queue = readUploadQueue();
  isUploading.value = true;
  let okCount = 0;
  let failCount = 0;
  for (const file of files) {
    const resumeTask =
      mode === "resume" ? queue.find((task) => task.key === fileKey(file)) : undefined;
    if (mode === "resume" && !resumeTask) {
      window.$message.warning(`${file.name} 没有对应的未完成任务，已跳过`);
      continue;
    }
    if (file.size > UPLOAD_MAX_MB * 1024 * 1024) {
      failCount++;
      window.$message.warning(`${file.name} 超过 ${UPLOAD_MAX_MB}MB，已跳过`);
      continue;
    }
    uploadPercent.value = resumeTask?.fileSize
      ? Math.round((resumeTask.uploaded / resumeTask.fileSize) * 100)
      : 0;
    try {
      const result = await uploadCloudSong(
        file,
        (percent) => {
          uploadPercent.value = percent;
        },
        {
          resume: resumeTask,
          // 凭据与每片断点即时落盘，刷新后可续传
          onTask: (task) => saveUploadTask(task),
        },
      );
      if (Number(result?.code) === 200) {
        okCount++;
        removeUploadTask(fileKey(file));
        // complete 接口把 songId 放在 data 中；未匹配曲库时为空
        // （可在云盘内用「云盘歌曲纠正」处理）
        const data = (result?.data ?? {}) as Record<string, unknown>;
        const unmatched = !(data.songId ?? result?.songId);
        window.$message.success(
          `${file.name} 上传成功${unmatched ? "（未匹配曲库，可在云盘内纠正）" : ""}`,
        );
      } else {
        failCount++;
        window.$message.error(`${file.name} 上传失败：${uploadErrorMessage(result)}`);
      }
    } catch (error: unknown) {
      failCount++;
      const message = error instanceof Error ? error.message : "网络错误";
      window.$message.error(`${file.name} 上传失败：${message}`);
    }
  }
  isUploading.value = false;
  uploadPercent.value = 0;
  // 同步本地队列（失败任务保留，供下次断点续传）
  pendingTasks.value = readUploadQueue();
  // 有成功项才刷新列表（避免无谓的整盘拉取）
  if (okCount > 0) {
    await getAllCloudMusic();
  }
  if (okCount > 0 && failCount > 0) {
    window.$message.info(`上传完成：成功 ${okCount}，失败 ${failCount}`);
  }
};

/** 文件选择回调 */
const handleFileChange = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files || []);
  // 清空 value，保证同一文件可被重复选择
  input.value = "";
  const mode = resumeMode.value ? "resume" : "new";
  resumeMode.value = false;
  await uploadFiles(files, mode);
};

onActivated(() => {
  if (!isActivated.value) {
    isActivated.value = true;
  } else {
    getAllCloudMusic();
  }
  // 同步未完成上传（刷新/切换路由后仍可续传）
  pendingTasks.value = readUploadQueue();
});

onMounted(() => {
  getAllCloudMusic();
  pendingTasks.value = readUploadQueue();
});
</script>

<style lang="scss" scoped>
.cloud {
  display: flex;
  flex-direction: column;
  .resume-tip {
    margin-bottom: 12px;
    .resume-btn {
      margin-left: 8px;
    }
  }
  .title {
    display: flex;
    align-items: flex-end;
    line-height: normal;
    margin-top: 12px;
    margin-bottom: 20px;
    height: 40px;
    .keyword {
      font-size: 30px;
      font-weight: bold;
      margin-right: 12px;
      line-height: normal;
    }
    .status {
      font-size: 15px;
      font-weight: normal;
      line-height: 30px;
      .item {
        display: flex;
        align-items: center;
        opacity: 0.9;
        .n-icon {
          margin-right: 4px;
        }
      }
      .n-progress {
        --n-fill-color: var(--primary-hex);
        margin-left: 4px;
        cursor: pointer;
        :deep(.n-progress-graph) {
          width: 80px;
        }
        .space {
          display: inline-block;
          font-size: 12px;
          transform: translateX(-5px);
          opacity: 0;
          transition:
            opacity 0.3s,
            transform 0.3s;
        }
        &:hover {
          .space {
            opacity: 1;
            transform: translateX(0);
          }
        }
      }
    }
  }
  .menu {
    width: 100%;
    margin-bottom: 20px;
    height: 40px;
    .n-button {
      height: 40px;
    }
    .more {
      width: 40px;
    }
    .search {
      height: 40px;
      width: 130px;
      display: flex;
      align-items: center;
      border-radius: 25px;
      transition: all 0.3s var(--n-bezier);
      &.n-input--focus {
        width: 200px;
      }
    }
  }
  .song-list {
    flex: 1;
    overflow: hidden;
    max-height: calc((var(--layout-height) - 132) * 1px);
  }
}
</style>
