<template>
  <div class="home-page-section-manager">
    <n-card :content-style="cardContentStyle" class="greeting-item">
      <n-text class="name">显示主页问好</n-text>
      <n-switch v-model:value="settingStore.showHomeGreeting" :round="false" />
    </n-card>

    <n-text depth="3" class="hint">
      顶部卡片仅支持显示开关；推荐栏目支持拖动排序。栏目名称与内容会随「设置 → 网络 →
      音乐源」当前选择的平台变化（如酷狗 / QQ 的专属歌单、新碟上架）。
    </n-text>

    <n-text depth="3" class="group-title">顶部卡片</n-text>
    <div class="sortable-list">
      <n-card
        v-for="item in cardSections"
        :key="item.key"
        :content-style="cardContentStyle"
        class="sortable-item"
      >
        <n-text class="name">{{ displayName(item.key, item.name) }}</n-text>
        <n-switch v-model:value="item.visible" :round="false" />
      </n-card>
    </div>

    <n-text depth="3" class="group-title">推荐栏目（可拖动排序）</n-text>
    <div ref="sortableRef" class="sortable-list">
      <n-card
        v-for="item in listSections"
        :key="item.key"
        :content-style="cardContentStyle"
        class="sortable-item"
      >
        <SvgIcon :depth="3" name="Menu" />
        <n-text class="name">{{ displayName(item.key, item.name) }}</n-text>
        <n-switch v-model:value="item.visible" :round="false" />
      </n-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useSettingStore } from "@/stores";
import { useSortable } from "@vueuse/integrations/useSortable";
import type { Options } from "sortablejs";
import SvgIcon from "@/components/Global/SvgIcon.vue";
import { sectionTitle, type HomeSectionKey } from "@/api/recommend";

const settingStore = useSettingStore();

const sortableRef = ref<HTMLElement | null>(null);

/** 顶部卡片键（仅显示开关，不参与排序） */
const CARD_KEYS: HomeSectionKey[] = ["daily", "like", "fm"];

/** 卡片内容样式（顶部问好卡片与栏目卡片保持一致） */
const cardContentStyle = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  padding: "16px",
};

/** 顶部卡片 */
const cardSections = computed(() =>
  settingStore.homePageSections.filter((item) => CARD_KEYS.includes(item.key as HomeSectionKey)),
);

/** 推荐栏目（按 order 升序，支持拖拽排序） */
const listSections = computed(() =>
  settingStore.homePageSections
    .filter((item) => !CARD_KEYS.includes(item.key as HomeSectionKey))
    .sort((a, b) => a.order - b.order),
);

/** 栏目显示名（随音乐源变化） */
const displayName = (key: string, fallback: string) =>
  sectionTitle(key as HomeSectionKey, fallback);

// 更新排序值（仅对推荐栏目重新编号）
const updateSortOrder = () => {
  listSections.value.forEach((item, index) => {
    item.order = index;
  });
};

// 拖拽排序
useSortable(sortableRef, listSections, {
  animation: 150,
  handle: ".n-icon",
  onEnd: updateSortOrder,
} as Options);

onMounted(() => {
  // 初始化排序值
  updateSortOrder();
});
</script>

<style scoped lang="scss">
.home-page-section-manager {
  .hint {
    display: block;
    margin-top: 12px;
    font-size: 12px;
    line-height: 1.7;
  }
  .group-title {
    display: block;
    margin: 16px 0 8px 0;
    font-size: 12px;
  }
  .greeting-item {
    border-radius: 8px;
    margin-bottom: 12px;
    .name {
      font-size: 16px;
      line-height: normal;
    }
    .n-switch {
      margin-left: auto;
    }
  }
  .sortable-list {
    margin-top: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    .sortable-item {
      border-radius: 8px;
      .n-icon {
        font-size: 16px;
        cursor: move;
      }
      .name {
        font-size: 16px;
        line-height: normal;
      }
      .n-switch {
        margin-left: auto;
      }
    }
  }
}
</style>
