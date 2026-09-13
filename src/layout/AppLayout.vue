<template>
  <div id="app-layout">
    <!-- 背景图 -->
    <Transition name="fade">
      <div
        v-if="
          (statusStore.themeBackgroundMode === 'image' ||
            statusStore.themeBackgroundMode === 'video') &&
          statusStore.backgroundImageUrl
        "
        :key="statusStore.backgroundImageUrl"
        class="background-container"
      >
        <div
          v-if="statusStore.themeBackgroundMode === 'image'"
          class="background-image"
          :style="{
            backgroundImage: `url(${statusStore.backgroundImageUrl})`,
            transform: `scale(${statusStore.backgroundConfig.scale})`,
            filter: `blur(${statusStore.backgroundConfig.blur}px)`,
          }"
        />
        <video
          v-else-if="statusStore.themeBackgroundMode === 'video'"
          class="background-image"
          :src="statusStore.backgroundImageUrl"
          autoplay
          loop
          muted
          :style="{
            objectFit: 'cover',
            transform: `scale(${statusStore.backgroundConfig.scale})`,
            filter: `blur(${statusStore.backgroundConfig.blur}px)`,
          }"
        />
        <div
          class="background-mask"
          :style="{
            backgroundColor: `rgba(0, 0, 0, ${statusStore.backgroundConfig.maskOpacity / 100})`,
          }"
        />
      </div>
    </Transition>
    <!-- 主框架 -->
    <n-layout
      id="main"
      :class="{
        'show-player': musicStore.isHasPlayer && statusStore.showPlayBar,
        'show-full-player': statusStore.showFullPlayer,
      }"
      has-sider
    >
      <!-- 侧边栏 -->
      <n-layout-sider
        v-if="isDesktop"
        id="main-sider"
        :style="{
          height:
            musicStore.isHasPlayer && statusStore.showPlayBar
              ? 'calc(var(--vh-full) - 80px)'
              : 'var(--vh-full)',
        }"
        :content-style="{
          overflow: 'hidden',
          height: '100%',
          padding: '0',
        }"
        :native-scrollbar="false"
        :collapsed="statusStore.menuCollapsed"
        :collapsed-width="64"
        :width="240"
        collapse-mode="width"
        show-trigger="bar"
        bordered
        @collapse="statusStore.menuCollapsed = true"
        @expand="statusStore.menuCollapsed = false"
      >
        <Sider />
      </n-layout-sider>
      <n-layout id="main-layout">
        <!-- 导航栏 -->
        <Nav id="main-header" />
        <n-layout
          ref="contentRef"
          id="main-content"
          :native-scrollbar="false"
          :style="{
            '--layout-height': contentHeight,
          }"
          :content-style="{
            display: 'grid',
            // 关键修复：显式给出「可收缩」的列。
            // 只写 display:grid 时，隐式列宽按 max-content 计算，
            // 宽内容（发现页长简介、标签栏等）会把列撑破视口，
            // 手机端被 overflow 裁剪后内容不可见（实测发现页容器 404px > 可用 345px）。
            gridTemplateColumns: 'minmax(0, 1fr)',
            gridTemplateRows: '1fr',
            minHeight: '100%',
            padding: isMobile ? '0 16px' : '0 24px',
          }"
          position="absolute"
          embedded
        >
          <!-- 路由页面 -->
          <RouterView v-slot="{ Component }">
            <Transition :name="`router-${settingStore.routeAnimation}`" mode="out-in">
              <KeepAlive v-if="settingStore.useKeepAlive" :max="20" :exclude="['layout']">
                <component :is="Component" class="router-view" />
              </KeepAlive>
              <component v-else :is="Component" class="router-view" />
            </Transition>
          </RouterView>
          <!-- 回顶 -->
          <n-back-top :right="40" :bottom="120">
            <SvgIcon :size="22" name="Up" />
          </n-back-top>
        </n-layout>
      </n-layout>
    </n-layout>
    <!-- 播放列表 -->
    <SongPlayList />
    <!-- 下载列表 -->
    <DownloadList />
    <!-- 全局播放器 -->
    <MainPlayer />
    <!-- 全屏播放器 -->
    <PlayerProvider>
      <FullPlayer />
    </PlayerProvider>
  </div>
</template>

<script setup lang="ts">
import { useMusicStore, useStatusStore, useSettingStore, useDataStore } from "@/stores";
import { useBlobURLManager } from "@/core/resource/BlobURLManager";
import { isChunkRecovering } from "@/utils/chunkRecovery";
import { isElectron } from "@/utils/env";
import { useMobile } from "@/composables/useMobile";
import { useInit } from "@/composables/useInit";

const musicStore = useMusicStore();
const statusStore = useStatusStore();
const settingStore = useSettingStore();
const dataStore = useDataStore();

const blobURLManager = useBlobURLManager();

const { isDesktop, isMobile } = useMobile();

// 主内容
const contentRef = ref<HTMLElement | null>(null);

// 主内容高度
const { height: contentHeight } = useElementSize(contentRef);

// 加载背景图
const loadBackgroundImage = async () => {
  if (statusStore.backgroundImageUrl) return;
  if (statusStore.themeBackgroundMode === "image" || statusStore.themeBackgroundMode === "video") {
    const blob = await dataStore.getBackgroundImage();
    if (blob) {
      const arrayBuffer = await blob.arrayBuffer();
      statusStore.backgroundImageUrl = blobURLManager.createBlobURL(
        arrayBuffer,
        blob.type,
        "background-image",
      );
    }
  }
};

watchEffect(() => {
  statusStore.mainContentHeight = contentHeight.value;
});

// 初始化
useInit();

onMounted(() => {
  loadBackgroundImage();
  if (!isElectron) {
    window.addEventListener("beforeunload", (event) => {
      // 释放所有 blob URL（blob 不会随页面自动释放，需显式回收）
      blobURLManager.revokeAllBlobURLs();
      // 1) 资源版本更新触发的自动刷新：不能弹确认框，否则刷新会被浏览器拦截
      if (isChunkRecovering()) return;
      // 2) 仅在有下载任务进行中时提示，避免每次关闭/刷新页面都弹出无意义的确认框
      if (!dataStore.downloadingSongs.length) return;
      event.preventDefault();
      event.returnValue = "";
    });
  }
});
</script>

<style lang="scss" scoped>
#app-layout {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
  /* 安全区适配（配合 index.html 的 viewport-fit=cover）：
     避开刘海 / 灵动岛（上）与 Home 指示条（下），避免底部播放条被系统手势区遮挡；
     桌面端与不支持 env() 的浏览器取值为 0，不影响原布局。 */
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
}

.background-container {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: var(--vh-full);
  z-index: -1;
  pointer-events: none;
  overflow: hidden;
  .background-image {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
    transform-origin: center center;
  }
  .background-mask {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
  }
}

#main {
  flex: 1;
  height: 100%;
  transition:
    transform 0.3s var(--n-bezier),
    opacity 0.3s var(--n-bezier);
  #main-layout {
    // background-color: rgba(var(--background), 0.58);
    background-color: rgba(var(--background));
  }
  #main-content {
    top: 70px;
    background-color: transparent;
    transition: bottom 0.3s;
    .router-view {
      position: relative;
      height: 100%;
      /* 网格 / 弹性子项默认 min-width: auto，会阻止收缩并导致横向溢出 */
      min-width: 0;
      &.n-result {
        display: flex;
        flex-direction: column;
        justify-content: center;
      }
    }
  }
  &.show-player {
    #main-content {
      bottom: 80px;
    }
  }
  &.show-full-player {
    opacity: 0;
    transform: scale(0.9);
    #main-header {
      -webkit-app-region: no-drag;
    }
  }
}
</style>
