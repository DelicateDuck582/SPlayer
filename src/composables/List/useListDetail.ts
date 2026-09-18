import type { CoverType, SongType } from "@/types/main";
import { useMediaQuery } from "@vueuse/core";
import { useStatusStore } from "@/stores";
import { useMobile } from "@/composables/useMobile";

/**
 * 头部预留高度
 * 必须与 ListDetail.vue 中 .detail 的高度、main.scss 中
 * --list-header-height / --list-header-height-small 的取值保持一致
 */
const getHeaderHeight = (options: {
  isShortViewport: boolean;
  isSmall: boolean;
  isSmallScreen: boolean;
  small: boolean;
}): number => {
  if (options.isShortViewport) return options.small ? 96 : 120;
  if (options.isSmall) return options.small ? 128 : 210;
  if (options.isSmallScreen) return options.small ? 120 : 180;
  return options.small ? 120 : 240;
};

/**
 * 列表详情逻辑
 */
export const useListDetail = () => {
  const statusStore = useStatusStore();
  const { isSmall, isSmallScreen } = useMobile();
  // 矮视口（横屏手机 / 低矮横向窗口）：头部会被压缩，预留高度需同步
  const isShortViewport = useMediaQuery("(max-height: 600px) and (orientation: landscape)");

  const detailData = ref<CoverType | null>(null);
  const listData = shallowRef<SongType[]>([]);
  const loading = ref<boolean>(true);

  /**
   * 计算列表高度
   */
  const getSongListHeight = (listScrolling: boolean) => {
    const normalHeight = getHeaderHeight({
      isShortViewport: isShortViewport.value,
      isSmall: isSmall.value,
      isSmallScreen: isSmallScreen.value,
      small: false,
    });
    const smallHeight = getHeaderHeight({
      isShortViewport: isShortViewport.value,
      isSmall: isSmall.value,
      isSmallScreen: isSmallScreen.value,
      small: true,
    });
    // 兜底：矮视口下主内容高度可能小于头部高度（横屏实测 258 - 240 = 18px，
    // n-scrollbar 可视高度 0px，歌单完全滑不动），保证列表至少有可滑动的高度
    return Math.max(
      statusStore.mainContentHeight - (listScrolling ? smallHeight : normalHeight),
      160,
    );
  };

  /**
   * 重置数据
   */
  const resetData = (resetList: boolean = true) => {
    detailData.value = null;
    if (resetList) {
      listData.value = [];
    }
  };

  /**
   * 设置详情数据
   */
  const setDetailData = (data: CoverType | null) => {
    detailData.value = data;
  };

  /**
   * 设置列表数据
   */
  const setListData = (data: SongType[]) => {
    listData.value = data;
  };

  /**
   * 追加列表数据
   */
  const appendListData = (data: SongType[]) => {
    listData.value = [...listData.value, ...data];
  };

  /**
   * 设置加载状态
   */
  const setLoading = (value: boolean) => {
    loading.value = value;
  };

  return {
    detailData,
    listData,
    loading,
    getSongListHeight,
    resetData,
    setDetailData,
    setListData,
    appendListData,
    setLoading,
  };
};
