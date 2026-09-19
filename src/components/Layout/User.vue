<template>
  <n-popover
    :show="userMenuShow"
    style="padding: 12px; max-width: 240px"
    trigger="manual"
    @clickoutside="userMenuShow = false"
  >
    <template #trigger>
      <div
        class="user"
        :style="{ pointerEvents: userMenuShow ? 'none' : 'auto' }"
        @click="openMenu"
      >
        <div class="avatar">
          <n-avatar
            v-if="loggedIn"
            :src="displayAvatar"
            fallback-src="/images/avatar.jpg?asset"
            round
          />
          <n-avatar v-else round>
            <SvgIcon name="Person" :depth="3" size="26" />
          </n-avatar>
        </div>
        <n-flex v-if="isDesktop" :wrap="false" class="user-data" size="small">
          <n-text class="name text-hidden">
            {{ displayName }}
          </n-text>
          <!-- VIP -->
          <img v-if="loggedIn && displayVip" class="vip-img" src="/images/vip.png?asset" />
          <SvgIcon :class="['down', { open: userMenuShow }]" name="DropDown" :depth="3" />
        </n-flex>
      </div>
    </template>
    <div class="user-menu" @click="userMenuShow = false">
      <!-- 用户信息 -->
      <n-flex class="user-info" align="center" justify="center" vertical>
        <n-text class="nickname text-hidden">{{ displayName }}</n-text>
        <n-flex align="center" size="small">
          <n-tag :bordered="false" size="small" round type="warning">Lv.{{ displayLevel }}</n-tag>
          <n-tag v-if="isThirdPartyMode" :bordered="false" size="small" round type="info">
            {{ sourceTag }}
          </n-tag>
          <!-- VIP -->
          <img v-if="loggedIn && displayVip" class="vip-img" src="/images/vip.png?asset" />
        </n-flex>
      </n-flex>
      <n-divider />
      <!-- 喜欢数量（仅网易云源） -->
      <div v-if="!isThirdPartyMode && dataStore.loginType !== 'uid'" class="like-num">
        <div
          v-for="(item, index) in userLikeData"
          :key="index"
          class="num-item"
          @click="router.push({ name: item.name })"
        >
          <n-number-animation :from="0" :to="item.value" />
          <n-text :depth="3">{{ item.label }}</n-text>
        </div>
      </div>
      <n-flex v-else-if="!isThirdPartyMode" align="center" vertical>
        <n-text>UID 登录模式</n-text>
        <n-text :depth="3">部分功能暂不可用</n-text>
      </n-flex>
      <n-divider />
      <!-- 多账号 -->
      <div
        class="account-list"
        v-if="!isThirdPartyMode && dataStore.userLoginStatus && dataStore.loginType !== 'uid'"
      >
        <n-text class="subtitle" :depth="3">切换账号</n-text>
        <div
          v-for="account in otherAccounts"
          :key="account.userId"
          class="account-item"
          @click="handleSwitchAccount(account.userId)"
        >
          <n-avatar :src="account.avatarUrl" round size="small" />
          <div class="account-name text-hidden">{{ account.name }}</div>
          <div class="delete-btn" @click.stop="handleRemoveAccount(account.userId)">
            <SvgIcon name="Close" />
          </div>
        </div>
        <n-button class="add-account" ghost block @click="handleAddAccount">
          <template #icon>
            <SvgIcon name="Add" />
          </template>
          添加账号
        </n-button>
      </div>
      <n-divider v-if="loggedIn && !isThirdPartyMode" />
      <!-- 退出登录 -->
      <n-button :focusable="false" class="logout" strong secondary round @click="isLogout">
        <template #icon>
          <SvgIcon name="Power" />
        </template>
        退出登录
      </n-button>
    </div>
  </n-popover>
</template>

<script setup lang="ts">
import { useDataStore, useSettingStore } from "@/stores";
import { openKugouLogin, openQqLogin, openUserLogin } from "@/utils/modal";
import { getLoginState } from "@/api/login";
import {
  updateUserData,
  updateSpecialUserData,
  toLogout,
  isLogin,
  refreshLoginData,
  saveCurrentAccount,
  switchAccount,
  removeAccount,
} from "@/utils/auth";
import { useMobile } from "@/composables/useMobile";
import {
  isKugouLogin,
  kugouLogout,
  refreshKugouLoginIfNeeded,
  refreshKugouUser,
} from "@/utils/kugouAuth";
import { isQqLogin, qqLogout, refreshQqUser } from "@/utils/qqAuth";

const router = useRouter();
const dataStore = useDataStore();
const settingStore = useSettingStore();

const { isDesktop } = useMobile();

// 用户菜单展示
const userMenuShow = ref<boolean>(false);

/** 当前音乐源 */
const sourceMode = computed<string>(() => settingStore.musicSource);

/** 是否第三方源（酷狗 / QQ：账号体系独立于网易云） */
const isThirdPartyMode = computed<boolean>(() => sourceMode.value !== "netease");

/** 当前音乐源是否为酷狗 */
const isKugouMode = computed<boolean>(() => sourceMode.value === "kugou");

/** 当前音乐源是否为 QQ 音乐 */
const isQqMode = computed<boolean>(() => sourceMode.value === "qq");

/** 酷狗是否已登录（读取 kugouCookie 以建立响应式依赖） */
const kugouLoggedIn = computed<boolean>(() => {
  void settingStore.kugouCookie;
  return isKugouLogin();
});

/** QQ 音乐是否已登录（读取 qqCookie 以建立响应式依赖） */
const qqLoggedIn = computed<boolean>(() => {
  void settingStore.qqCookie;
  return isQqLogin();
});

/** 第三方源是否已登录（按当前源取值） */
const thirdPartyLoggedIn = computed<boolean>(() =>
  isKugouMode.value ? kugouLoggedIn.value : qqLoggedIn.value,
);

/** 是否已登录（按当前音乐源取值） */
const loggedIn = computed<boolean>(() =>
  isThirdPartyMode.value ? thirdPartyLoggedIn.value : dataStore.userLoginStatus,
);

/** 展示用头像 */
const displayAvatar = computed<string>(() => {
  if (isKugouMode.value) return settingStore.kugouUser?.avatar || "";
  if (isQqMode.value) return settingStore.qqUser?.avatar || "";
  return dataStore.userData?.avatarUrl || "";
});

/** 展示用昵称 */
const displayName = computed<string>(() => {
  if (isThirdPartyMode.value) {
    if (!thirdPartyLoggedIn.value) return "未登录";
    if (isKugouMode.value) {
      return settingStore.kugouUser?.nickname || settingStore.kugouUser?.userid || "酷狗用户";
    }
    return settingStore.qqUser?.nickname || settingStore.qqUser?.uin || "QQ 音乐用户";
  }
  return dataStore.userLoginStatus ? dataStore.userData.name || "未知用户名" : "未登录";
});

/** 展示用等级（QQ 音乐接口暂无等级字段，恒为 0） */
const displayLevel = computed<number>(() => {
  if (isKugouMode.value) return settingStore.kugouUser?.level ?? 0;
  if (isQqMode.value) return 0;
  return dataStore.userData.level ?? 0;
});

/** 是否 VIP */
const displayVip = computed<boolean>(() => {
  if (isKugouMode.value) return (settingStore.kugouUser?.vipType ?? 0) !== 0;
  if (isQqMode.value) return (settingStore.qqUser?.vipType ?? 0) !== 0;
  return dataStore.userData.vipType !== 0;
});

/** 源标记文案 */
const sourceTag = computed<string>(() => (isQqMode.value ? "QQ 音乐源" : "酷狗源"));

/** 打开当前第三方源的登录弹窗 */
const openThirdPartyLogin = () => {
  if (isQqMode.value) openQqLogin(() => refreshQqUser());
  else openKugouLogin(() => refreshKugouUser());
};

// 开启用户菜单
const openMenu = () => {
  // 第三方源：未登录 → 打开对应平台登录弹窗；已登录 → 展开账号菜单
  if (isThirdPartyMode.value) {
    if (thirdPartyLoggedIn.value) {
      userMenuShow.value = !userMenuShow.value;
    } else {
      openThirdPartyLogin();
    }
    return;
  }
  if (dataStore.userLoginStatus) {
    userMenuShow.value = !userMenuShow.value;
  } else {
    openUserLogin();
  }
};

// 用户喜欢数据
const userLikeData = computed(() => {
  return [
    {
      label: "歌单",
      name: "like-playlists",
      value: dataStore.userLikeData.playlists.length,
    },
    {
      label: "专辑",
      name: "like-albums",
      value: dataStore.userLikeData.albums.length,
    },
    {
      label: "歌手",
      name: "like-artists",
      value: dataStore.userLikeData.artists.length,
    },
  ];
});

// 检查登录状态
const checkLoginStatus = async () => {
  // 第三方源：校验对应平台的 Cookie 是否仍有效（不触碰网易云登录态）
  if (isThirdPartyMode.value) {
    if (!thirdPartyLoggedIn.value) return;
    if (isKugouMode.value) {
      // 与网易云一致：超过 3 天未刷新则自动刷新登录（换新令牌）
      await refreshKugouLoginIfNeeded();
      const user = await refreshKugouUser();
      if (!user) {
        window.$message.warning("酷狗登录已过期，请重新登录", { duration: 2000 });
        openThirdPartyLogin();
      }
      return;
    }
    const qqUser = await refreshQqUser();
    if (!qqUser) {
      window.$message.warning("QQ 音乐登录已失效，请重新登录", { duration: 2000 });
      openThirdPartyLogin();
    }
    return;
  }
  // 若为 UID 登录
  if (dataStore.loginType === "uid") {
    await updateSpecialUserData();
    return;
  }
  // 获取登录状态
  const loginState = await getLoginState();
  // 登录正常
  if (loginState.data?.profile && Object.keys(loginState.data?.profile)?.length) {
    dataStore.userLoginStatus = true;
    // 刷新登录
    await refreshLoginData();
    // 获取用户信息
    await updateUserData();
  }
  // 若还有用户数据，则登录过期
  else if (dataStore.userData.userId !== 0) {
    dataStore.userLoginStatus = false;
    dataStore.userData.userId = 0;
    window.$message.warning("登录已过期，请重新登录", { duration: 2000 });
    openUserLogin();
  }
};

// 其他账号列表（排除当前登录的）
const otherAccounts = computed(() => {
  return dataStore.userList.filter((u) => u.userId !== dataStore.userData.userId);
});

// 切换账号
const handleSwitchAccount = async (userId: number) => {
  userMenuShow.value = false;
  await switchAccount(userId);
};

// 移除账号
const handleRemoveAccount = (userId: number) => {
  removeAccount(userId);
};

// 添加新账号 (保存当前 -> 开启强制登录 -> 成功后自动切换)
const handleAddAccount = async () => {
  // 限制账号数量
  if (dataStore.userList.length >= 3) {
    window.$message.warning("最多只能保留 3 个账号");
    return;
  }

  // 1先保存当前账号状态 (快照)
  saveCurrentAccount();

  userMenuShow.value = false;

  // 打开登录框 (强制模式, 不登出当前用户以保持 cookies 直到新登录成功, 禁用 UID 登录)
  openUserLogin(
    false,
    true,
    async () => {
      // 登录成功回调
      // 此时新 cookies 已设置，store 已更新
      window.$message.loading("正在更新数据...");
      try {
        await updateUserData();
        window.$message.success("登录成功");
        // router.push("/");
      } catch (error) {
        console.error("Login update failed", error);
      }
    },
    true,
  );
};

// 退出登录
const isLogout = () => {
  // 第三方源：退出对应平台登录（不影响网易云登录态）
  if (isThirdPartyMode.value) {
    if (!thirdPartyLoggedIn.value) {
      openThirdPartyLogin();
      return;
    }
    const sourceName = isQqMode.value ? "QQ 音乐" : "酷狗";
    window.$dialog.warning({
      title: `退出${sourceName}登录`,
      content: `确认清除本机保存的${sourceName} Cookie 与账号信息？`,
      positiveText: "确认登出",
      negativeText: "取消",
      onPositiveClick: () => {
        userMenuShow.value = false;
        if (isQqMode.value) qqLogout();
        else kugouLogout();
      },
    });
    return;
  }
  if (!isLogin()) {
    openUserLogin();
    return;
  }
  window.$dialog.warning({
    title: "退出登录",
    content: "确认退出当前用户登录？",
    positiveText: "确认登出",
    negativeText: "取消",
    onPositiveClick: () => {
      // 退出时保存当前账号，方便下次登录
      saveCurrentAccount();
      toLogout();
    },
  });
};

onBeforeMount(() => {
  checkLoginStatus();
});
</script>

<style lang="scss" scoped>
.user {
  display: flex;
  align-items: center;
  height: 34px;
  border-radius: 25px;
  background-color: rgba(var(--primary), 0.08);
  transition: background-color 0.3s;
  cursor: pointer;
  -webkit-app-region: no-drag;
  .avatar {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    min-width: 38px;
    border-radius: 50%;
    border: 2px solid rgba(var(--primary), 0.28);
    .n-avatar {
      width: 100%;
      height: 100%;
    }
  }
  .user-data {
    display: flex;
    align-items: center;
    padding-left: 8px;
    max-width: 200px;
    .down {
      font-size: 26px;
      margin-right: 4px;
      transition: transform 0.3s;
      &.open {
        transform: rotate(180deg);
      }
    }
  }
  &:hover {
    background-color: rgba(var(--primary), 0.28);
  }
  &:active {
    background-color: rgba(var(--primary), 0.12);
  }
}
.vip-img {
  height: 18px;
}
.user-menu {
  display: flex;
  justify-content: center;
  flex-direction: column;
  .user-info {
    .nickname {
      font-weight: bold;
      max-width: 220px;
    }
    .n-tag {
      height: 18px;
      font-size: 12px;
      pointer-events: none;
    }
  }
  .like-num {
    display: flex;
    justify-content: space-around;
    .num-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      font-size: 16px;
      font-weight: bold;
      cursor: pointer;
      .n-text {
        font-size: 12px;
        font-weight: normal;
        margin-top: 4px;
      }
    }
  }
  .account-list {
    .subtitle {
      font-size: 12px;
      text-align: center;
      margin-bottom: 8px;
      display: block;
    }
    .account-item {
      display: flex;
      align-items: center;
      padding: 6px 8px;
      margin-bottom: 8px;
      border-radius: 8px;
      cursor: pointer;
      transition: background-color 0.2s;
      position: relative;
      .account-name {
        margin-left: 8px;
        font-size: 13px;
        flex: 1;
      }
      .delete-btn {
        opacity: 0;
        padding: 4px;
        border-radius: 4px;
        display: flex;
        align-items: center;
        transition:
          background-color 0.2s,
          color 0.2s;
        &:hover {
          background-color: rgba(var(--primary), 0.1);
          color: var(--primary-color);
        }
      }
      &:hover {
        background-color: rgba(var(--primary), 0.08);
        .delete-btn {
          opacity: 1;
        }
      }
      /* 触屏设备没有 hover：删除按钮需常显，否则手机上无法移除账号 */
      @media (hover: none) {
        .delete-btn {
          opacity: 1;
        }
      }
    }
    .add-account {
      border-radius: 8px;
    }
  }
  .n-divider {
    margin: 12px 0;
  }
}
</style>
