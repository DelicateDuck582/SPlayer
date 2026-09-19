import { useSettingStore } from "@/stores";
import { isElectron } from "@/utils/env";
import { SettingConfig } from "@/types/settings";
import { computed, ref, h, markRaw } from "vue";
import { debounce } from "lodash-es";
import { NA } from "naive-ui";
import { disableDiscordRpc, enableDiscordRpc, updateDiscordConfig } from "@/core/player/PlayerIpc";
import { getAuthToken, getAuthUrl, getSession } from "@/api/lastfm";
import StreamingServerList from "../components/StreamingServerList.vue";
import {
  DEFAULT_API_BASE,
  getApiBase,
  normalizeApiBase,
  rememberApiBase,
  testApiBase,
} from "@/utils/request";
import {
  DEFAULT_KUGOU_API_BASE,
  getKugouApiBase,
  normalizeKugouApiBase,
  testKugouApiBase,
} from "@/api/kugou";
import { openKugouLogin } from "@/utils/modal";
import { getKugouCookieValue, isKugouLogin, kugouLogout } from "@/utils/kugouAuth";

export const useNetworkSettings = (): SettingConfig => {
  const settingStore = useSettingStore();
  const testProxyLoading = ref<boolean>(false);

  // --- Network Proxy Logic (from other.ts) ---
  const proxyConfig = computed(() => ({
    protocol: settingStore.proxyProtocol,
    server: settingStore.proxyServe,
    port: settingStore.proxyPort,
  }));

  const setProxy = debounce(() => {
    if (
      settingStore.proxyProtocol === "off" ||
      !settingStore.proxyServe ||
      !settingStore.proxyPort
    ) {
      window.electron.ipcRenderer.send("remove-proxy");
      window.$message.success("成功关闭网络代理");
      return;
    }
    window.electron.ipcRenderer.send("set-proxy", proxyConfig.value);
    window.$message.success("网络代理配置完成，请重启软件");
  }, 300);

  const testProxy = async () => {
    testProxyLoading.value = true;
    const result = await window.electron.ipcRenderer.invoke("test-proxy", proxyConfig.value);
    if (result) {
      window.$message.success("该代理可正常使用");
    } else {
      window.$message.error("代理测试失败，请重试");
    }
    testProxyLoading.value = false;
  };

  // --- API 源切换逻辑（运行时切换，无需重新构建） ---
  const apiTestLoading = ref<boolean>(false);

  /** 应用 API 源：空值表示恢复默认源 */
  const applyApiBase = (value: string) => {
    const url = normalizeApiBase(value);
    settingStore.apiBaseUrl = url;
    if (url) rememberApiBase(url);
    window.$message.success(url ? `已切换 API 源：${url}` : "已恢复默认 API 源");
  };

  /** 测试当前 API 源连通性，成功后写入快速切换列表 */
  const handleTestApiBase = async () => {
    apiTestLoading.value = true;
    const { ok, message } = await testApiBase(settingStore.apiBaseUrl);
    apiTestLoading.value = false;
    if (ok) {
      rememberApiBase(settingStore.apiBaseUrl || DEFAULT_API_BASE);
      window.$message.success(message);
    } else {
      window.$message.error(message);
    }
  };

  // --- 音乐源 / 酷狗 API（运行时切换，无需重新构建） ---
  const kugouTestLoading = ref<boolean>(false);

  /** 应用酷狗 API 地址：空值表示使用构建时默认地址 */
  const applyKugouApiBase = (value: string) => {
    settingStore.kugouApiBase = normalizeKugouApiBase(value);
    window.$message.success(
      settingStore.kugouApiBase
        ? `已切换酷狗 API：${settingStore.kugouApiBase}`
        : `已恢复默认酷狗 API：${DEFAULT_KUGOU_API_BASE}`,
    );
  };

  /** 测试酷狗 API 连通性（匿名请求热搜，不消耗登录态） */
  const handleTestKugouApiBase = async () => {
    kugouTestLoading.value = true;
    const { ok, message } = await testKugouApiBase(settingStore.kugouApiBase);
    kugouTestLoading.value = false;
    if (ok) window.$message.success(message);
    else window.$message.error(message);
  };

  // --- Discord RPC Logic (from third.ts) ---
  const handleDiscordConfigUpdate = () => {
    if (!settingStore.discordRpc.enabled) return;
    updateDiscordConfig({
      showWhenPaused: settingStore.discordRpc.showWhenPaused,
      displayMode: settingStore.discordRpc.displayMode,
    });
  };

  const handleDiscordEnabledUpdate = (val: boolean) => {
    settingStore.discordRpc.enabled = val;
    if (val) {
      enableDiscordRpc();
      handleDiscordConfigUpdate();
    } else {
      disableDiscordRpc();
    }
  };

  // --- WebSocket Logic (from third.ts) ---
  const socketPort = ref(25885);
  const socketEnabled = ref(false);
  const socketPortSaved = ref<number | null>(null);

  const initSocketConfig = async () => {
    if (!isElectron) return;
    const wsOptions = await window.api.store.get("websocket");
    const portFromStore = wsOptions?.port ?? 25885;
    socketPort.value = portFromStore;
    socketPortSaved.value = portFromStore;
    socketEnabled.value = wsOptions?.enabled ?? false;
  };

  const saveSocketConfig = async () => {
    if (!isElectron) return;
    await window.api.store.set("websocket", {
      enabled: socketEnabled.value,
      port: socketPort.value,
    });
  };

  const handleSocketEnabledUpdate = async (value: boolean) => {
    if (!isElectron) {
      socketEnabled.value = value;
      await saveSocketConfig();
      return;
    }
    if (value) {
      if (socketPort.value !== socketPortSaved.value) {
        window.$message.warning("请先测试并保存端口配置后再启用 WebSocket");
        return;
      }
      const result = await window.electron.ipcRenderer.invoke("socket-start");
      if (result?.success) {
        socketEnabled.value = true;
        await saveSocketConfig();
        window.$message.success("WebSocket 服务已启动");
      } else {
        window.$message.error(result?.message ?? "WebSocket 启动失败");
        socketEnabled.value = false;
      }
    } else {
      const result = await window.electron.ipcRenderer.invoke("socket-stop");
      if (result?.success) {
        socketEnabled.value = false;
        await saveSocketConfig();
        window.$message.success("WebSocket 服务已关闭");
      } else {
        window.$message.error(result?.message ?? "WebSocket 关闭失败");
        socketEnabled.value = true;
      }
    }
  };

  const testSocketPort = async () => {
    if (!isElectron) return;
    if (!socketPort.value) {
      window.$message.error("请输入端口号");
      return;
    }
    try {
      const result = await window.electron.ipcRenderer.invoke("socket-test-port", socketPort.value);
      if (result?.success) {
        await saveSocketConfig();
        socketPortSaved.value = socketPort.value;
        window.$message.success("已保存 WebSocket 配置");
      } else {
        window.$message.error(result?.message ?? "该端口不可用，请更换端口");
      }
    } catch (e) {
      console.error(e);
    }
  };

  // --- Last.fm Logic (from third.ts) ---
  const lastfmAuthLoading = ref(false);

  const connectLastfm = async () => {
    try {
      lastfmAuthLoading.value = true;
      const tokenResponse = await getAuthToken();
      if (!tokenResponse.token) throw new Error("无法获取认证令牌");
      const token = tokenResponse.token;
      const authUrl = getAuthUrl(token);

      if (typeof window !== "undefined") {
        const authWindow = window.open(authUrl, "_blank", "width=800,height=600");
        const checkAuth = setInterval(async () => {
          if (authWindow?.closed) {
            clearInterval(checkAuth);
            if (lastfmAuthLoading.value) {
              lastfmAuthLoading.value = false;
              window.$message.warning("授权已取消");
            }
            return;
          }
          try {
            const sessionResponse = await getSession(token);
            if (sessionResponse.session) {
              clearInterval(checkAuth);
              authWindow?.close();
              settingStore.lastfm.sessionKey = sessionResponse.session.key;
              settingStore.lastfm.username = sessionResponse.session.name;
              window.$message.success(`已成功连接到 Last.fm 账号: ${sessionResponse.session.name}`);
              lastfmAuthLoading.value = false;
            }
          } catch {
            // 用户还未授权，继续等待
          }
        }, 2000);

        setTimeout(() => {
          clearInterval(checkAuth);
          if (lastfmAuthLoading.value) {
            lastfmAuthLoading.value = false;
            window.$message.warning("授权超时，请重试");
          }
        }, 30000);
      }
    } catch (error: any) {
      console.error("Last.fm 连接失败:", error);
      window.$message.error(`连接失败: ${error.message || "未知错误"}`);
      lastfmAuthLoading.value = false;
    }
  };

  const disconnectLastfm = () => {
    window.$dialog.warning({
      title: "断开连接",
      content: "确定要断开与 Last.fm 的连接吗？",
      positiveText: "确定",
      negativeText: "取消",
      onPositiveClick: () => {
        settingStore.lastfm.sessionKey = "";
        settingStore.lastfm.username = "";
        window.$message.success("已断开与 Last.fm 的连接");
      },
    });
  };

  const onActivate = () => {
    initSocketConfig();
  };

  return {
    onActivate,
    groups: [
      {
        title: "流媒体服务",
        items: [
          {
            key: "streamingEnabled",
            label: "启用流媒体",
            type: "switch",
            description: "开启后可使用并管理 Navidrome、Jellyfin 等流媒体服务",
            value: computed({
              get: () => settingStore.streamingEnabled,
              set: (v) => (settingStore.streamingEnabled = v),
            }),
          },
          {
            key: "serverList",
            label: "服务器管理",
            type: "custom",
            description: "在此添加和管理您的流媒体服务器",
            noWrapper: true,
            component: markRaw(StreamingServerList),
          },
        ],
      },
      {
        title: "音乐源",
        items: [
          {
            key: "musicSource",
            label: "音乐源",
            type: "select",
            description: computed(() =>
              settingStore.musicSource === "kugou"
                ? `当前：酷狗音乐（API：${getKugouApiBase()}）`
                : `当前：网易云音乐（API：${getApiBase()}）`,
            ),
            options: [
              { label: "网易云音乐", value: "netease" },
              { label: "酷狗音乐", value: "kugou" },
            ],
            keywords: ["源", "音乐源", "酷狗", "网易云", "kugou", "切换"],
            value: computed({
              get: () => settingStore.musicSource,
              set: (v: "netease" | "kugou") => {
                settingStore.musicSource = v;
                window.$message.success(
                  v === "kugou"
                    ? "已切换音乐源：酷狗音乐（搜索 / 取链 / 歌词走酷狗）"
                    : "已切换音乐源：网易云音乐",
                );
              },
            }),
          },
          {
            key: "kugouApiBase",
            label: "酷狗 API 服务地址",
            type: "text-input",
            show: computed(() => settingStore.musicSource === "kugou"),
            description: computed(
              () =>
                `留空使用默认地址（${DEFAULT_KUGOU_API_BASE || "未配置"}）；当前生效：${getKugouApiBase()}`,
            ),
            keywords: ["酷狗", "api", "地址", "kugou", "vercel"],
            componentProps: {
              placeholder: "https://kugou-api.duckgame-play.top",
              clearable: true,
            },
            value: computed({
              get: () => settingStore.kugouApiBase,
              set: (v: string) => applyKugouApiBase(v),
            }),
          },
          {
            key: "kugouCookie",
            label: "酷狗 Cookie（可选）",
            type: "text-input",
            show: computed(() => settingStore.musicSource === "kugou"),
            description:
              "格式 token=xxx; userid=xxx。点「查看头像/用户区头像」或下方按钮用 Cookie 登录后会自动填入；酷狗对匿名请求有云端风控：不填时「歌曲搜索 / 取播放地址 / 歌词」会被拒绝（152 / 20028）；仅本地保存，且只放在请求体中发送",
            keywords: ["酷狗", "cookie", "登录", "token", "kugou"],
            componentProps: {
              type: "password",
              showPasswordOn: "click" as const,
              placeholder: "token=xxx; userid=xxx",
              clearable: true,
            },
            value: computed({
              get: () => settingStore.kugouCookie,
              set: (v: string) => (settingStore.kugouCookie = String(v ?? "").trim()),
            }),
          },
          {
            key: "kugouLogin",
            label: "酷狗账号",
            type: "button",
            show: computed(() => settingStore.musicSource === "kugou"),
            description: computed(() =>
              isKugouLogin()
                ? `已登录：${settingStore.kugouUser?.nickname || getKugouCookieValue("userid") || "酷狗用户"}（可重新登录 / 切换账号）`
                : "未登录：点击后用 Cookie 登录（与点击左侧头像登录等效）",
            ),
            keywords: ["酷狗", "登录", "账号", "cookie", "kugou", "头像"],
            buttonLabel: "登录 / 切换账号",
            action: () => openKugouLogin(),
            componentProps: { type: "primary" },
          },
          {
            key: "kugouLogout",
            label: "退出酷狗登录",
            type: "button",
            show: computed(() => settingStore.musicSource === "kugou" && isKugouLogin()),
            description: "清除本机保存的酷狗 Cookie 与账号信息（不影响网易云登录态）",
            keywords: ["酷狗", "退出", "登出", "logout", "kugou"],
            buttonLabel: "退出登录",
            action: () => kugouLogout(),
          },
          {
            key: "kugouApiTest",
            label: "测试酷狗 API",
            type: "button",
            show: computed(() => settingStore.musicSource === "kugou"),
            description: "匿名请求酷狗热搜接口（/search/hot），验证 API 服务是否可达",
            keywords: ["酷狗", "测试", "连通", "kugou"],
            buttonLabel: "测试连接",
            action: handleTestKugouApiBase,
            componentProps: computed(() => ({ loading: kugouTestLoading.value, type: "primary" })),
          },
          // ---- 网易云 API 设置（仅「网易云音乐」源显示）----
          {
            key: "apiSource",
            label: "API 源",
            show: computed(() => settingStore.musicSource === "netease"),
            type: "select",
            description: computed(
              () => `当前生效：${getApiBase()}${settingStore.apiBaseUrl ? "" : "（默认源）"}`,
            ),
            options: computed(() => {
              const options: { label: string; value: string }[] = [
                { label: `默认（${DEFAULT_API_BASE || "未配置"}）`, value: "" },
              ];
              const history = settingStore.apiBaseUrlHistory || [];
              const current = settingStore.apiBaseUrl;
              // 手填但尚未记录的地址也放进列表，避免下拉框显示空白
              if (current && !history.includes(current)) {
                options.push({ label: `${current}（当前）`, value: current });
              }
              options.push(...history.map((url) => ({ label: url, value: url })));
              return options;
            }),
            keywords: ["api", "接口", "源", "网易云", "服务器", "切换"],
            value: computed({
              get: () => settingStore.apiBaseUrl,
              set: (v: string) => applyApiBase(v),
            }),
          },
          {
            key: "apiSourceCustom",
            label: "自定义 API 地址",
            show: computed(() => settingStore.musicSource === "netease"),
            type: "text-input",
            description:
              "留空使用默认源；可填自建 API（如 api-enhanced）或 npm 版 NeteaseCloudMusicApi 的 Vercel 部署地址；切换后立即生效，无需重启或重建",
            keywords: ["api", "地址", "url", "自建", "vercel"],
            componentProps: {
              placeholder: "https://your-api.example.com",
              clearable: true,
            },
            value: computed({
              get: () => settingStore.apiBaseUrl,
              set: (v: string) => (settingStore.apiBaseUrl = normalizeApiBase(v)),
            }),
          },
          {
            key: "apiSourceTest",
            label: "测试 API 源",
            show: computed(() => settingStore.musicSource === "netease"),
            type: "button",
            description:
              "匿名请求所选源的 /login/status；成功后写入「API 源」列表，便于多源快速切换",
            keywords: ["api", "测试", "连通", "ping"],
            buttonLabel: "测试并记录",
            action: handleTestApiBase,
            componentProps: computed(() => ({ loading: apiTestLoading.value, type: "primary" })),
          },
          {
            key: "apiSourceReset",
            label: "恢复默认 API 源",
            show: computed(
              () => !!settingStore.apiBaseUrl && settingStore.musicSource === "netease",
            ),
            type: "button",
            description: `回到构建时配置的默认地址（${DEFAULT_API_BASE || "未配置"}）`,
            keywords: ["api", "重置", "默认"],
            buttonLabel: "恢复默认",
            action: () => applyApiBase(""),
          },
        ],
      },
      {
        title: "网络代理",
        items: [
          {
            key: "proxyProtocol",
            label: "网络代理",
            show: isElectron,
            type: "select",
            description: "修改后请点击保存或重启软件以应用",
            options: [
              { label: "关闭代理", value: "off" },
              { label: "HTTP 代理", value: "HTTP" },
              { label: "HTTPS 代理", value: "HTTPS" },
            ],
            value: computed({
              get: () => settingStore.proxyProtocol,
              set: (v) => (settingStore.proxyProtocol = v),
            }),
            extraButton: {
              label: "保存并应用",
              action: setProxy,
              type: "primary",
              secondary: true,
              strong: true,
            },
          },
          {
            key: "proxyServe",
            label: "代理服务器地址",
            show: isElectron,
            type: "text-input",
            description: "请填写代理服务器地址，如 127.0.0.1",
            disabled: computed(() => settingStore.proxyProtocol === "off"),
            prefix: computed(() =>
              settingStore.proxyProtocol === "off" ? "-" : settingStore.proxyProtocol,
            ),
            componentProps: {
              placeholder: "请填写代理服务器地址",
            },
            value: computed({
              get: () => settingStore.proxyServe,
              set: (v) => (settingStore.proxyServe = v),
            }),
          },
          {
            key: "proxyPort",
            label: "代理服务器端口",
            show: isElectron,
            type: "input-number",
            description: "请填写代理服务器端口，如 80",
            disabled: computed(() => settingStore.proxyProtocol === "off"),
            componentProps: {
              min: 1,
              max: 65535,
              showButton: false,
              placeholder: "请填写代理服务器端口",
            },
            value: computed({
              get: () => settingStore.proxyPort,
              set: (v) => (settingStore.proxyPort = v),
            }),
          },
          {
            key: "proxyTest",
            label: "测试代理",
            show: isElectron,
            type: "button",
            description: "测试代理配置是否可正常连通",
            buttonLabel: "测试代理",
            action: testProxy,
            condition: () => settingStore.proxyProtocol !== "off",
            componentProps: computed(() => ({
              loading: testProxyLoading.value,
              type: "primary",
            })),
          },
          {
            key: "useRealIP",
            label: "使用真实 IP 地址",
            type: "switch",
            description: "在海外或部分地区可能会受到限制，可开启此处尝试解决",
            value: computed({
              get: () => settingStore.useRealIP,
              set: (v) => (settingStore.useRealIP = v),
            }),
          },
          {
            key: "realIP",
            label: "真实 IP 地址",
            type: "text-input",
            description: "可在此处输入国内 IP，不填写则为随机",
            disabled: computed(() => !settingStore.useRealIP),
            prefix: "IP",
            componentProps: { placeholder: "127.0.0.1" },
            value: computed({
              get: () => settingStore.realIP,
              set: (v) => (settingStore.realIP = v),
            }),
          },
        ],
      },
      {
        title: "第三方集成",
        items: [
          {
            key: "smtcOpen",
            label: isElectron ? "开启系统音频集成" : "开启浏览器媒体会话",
            type: "switch",
            description: isElectron
              ? "与系统集成以显示媒体元数据，支持高清封面显示"
              : "向浏览器发送 Media Session 媒体元数据",
            value: computed({
              get: () => settingStore.smtcOpen,
              set: (v) => (settingStore.smtcOpen = v),
            }),
          },
          {
            key: "lastfm_enabled",
            label: "启用 Last.fm",
            type: "switch",
            description: "开启后可记录播放历史到 Last.fm",
            value: computed({
              get: () => settingStore.lastfm.enabled,
              set: (v) => (settingStore.lastfm.enabled = v),
            }),
            children: [
              {
                key: "lastfm_apikey",
                label: "API Key",
                type: "text-input",
                description: () =>
                  h("div", null, [
                    h("div", null, [
                      "在 ",
                      h(
                        NA,
                        {
                          href: "https://www.last.fm/zh/api/account/create",
                          target: "_blank",
                        },
                        { default: () => "Last.fm 创建应用" },
                      ),
                      " 获取，只有「程序名称」是必要的",
                    ]),
                    h("div", null, [
                      "如果已经创建过，则可以在 ",
                      h(
                        NA,
                        {
                          href: "https://www.last.fm/zh/api/accounts",
                          target: "_blank",
                        },
                        { default: () => "Last.fm API 应用程序" },
                      ),
                      " 处查看",
                    ]),
                  ]),
                value: computed({
                  get: () => settingStore.lastfm.apiKey,
                  set: (v) => (settingStore.lastfm.apiKey = v),
                }),
              },
              {
                key: "lastfm_secret",
                label: "API Secret",
                type: "text-input",
                description: "Shared Secret，用于签名验证",
                componentProps: { type: "password", showPasswordOn: "click" },
                value: computed({
                  get: () => settingStore.lastfm.apiSecret,
                  set: (v) => (settingStore.lastfm.apiSecret = v),
                }),
              },
              {
                key: "lastfm_connect",
                label: computed(() =>
                  !settingStore.lastfm.sessionKey ? "连接 Last.fm 账号" : "已连接账号",
                ),
                type: "button",
                description: computed(() =>
                  !settingStore.lastfm.sessionKey
                    ? "首次使用需要授权连接"
                    : settingStore.lastfm.username,
                ),
                buttonLabel: computed(() =>
                  !settingStore.lastfm.sessionKey ? "连接账号" : "断开连接",
                ),
                action: () =>
                  !settingStore.lastfm.sessionKey ? connectLastfm() : disconnectLastfm(),
                componentProps: computed(() =>
                  !settingStore.lastfm.sessionKey
                    ? {
                        type: "primary",
                        loading: lastfmAuthLoading.value,
                        disabled: !settingStore.isLastfmConfigured,
                      }
                    : { type: "error" },
                ),
              },
              {
                key: "lastfm_scrobble",
                label: "Scrobble（播放记录）",
                type: "switch",
                description: "自动记录播放历史到 Last.fm",
                condition: () => !!settingStore.lastfm.sessionKey,
                value: computed({
                  get: () => settingStore.lastfm.scrobbleEnabled,
                  set: (v) => (settingStore.lastfm.scrobbleEnabled = v),
                }),
              },
              {
                key: "lastfm_nowplaying",
                label: "正在播放状态",
                type: "switch",
                description: "向 Last.fm 同步正在播放的歌曲",
                condition: () => !!settingStore.lastfm.sessionKey,
                value: computed({
                  get: () => settingStore.lastfm.nowPlayingEnabled,
                  set: (v) => (settingStore.lastfm.nowPlayingEnabled = v),
                }),
              },
            ],
          },
        ],
      },
      {
        title: "Discord RPC",
        show: isElectron,
        items: [
          {
            key: "discord_enabled",
            label: "启用 Discord RPC",
            type: "switch",
            description: "在 Discord 状态中显示正在播放的歌曲",
            value: computed({
              get: () => settingStore.discordRpc.enabled,
              set: (v) => handleDiscordEnabledUpdate(v),
            }),
            children: [
              {
                key: "discord_paused",
                label: "暂停时显示",
                type: "switch",
                description: "暂停播放时是否保留 Discord 状态",
                value: computed({
                  get: () => settingStore.discordRpc.showWhenPaused,
                  set: (v) => {
                    settingStore.discordRpc.showWhenPaused = v;
                    handleDiscordConfigUpdate();
                  },
                }),
              },
              {
                key: "discord_mode",
                label: "简略状态显示",
                type: "select",
                description: "不打开详细信息面板时，在用户名下方显示的小字",
                options: [
                  { label: "应用名", value: "Name" },
                  { label: "歌曲名", value: "Details" },
                  { label: "歌手名", value: "State" },
                ],
                value: computed({
                  get: () => settingStore.discordRpc.displayMode,
                  set: (v) => {
                    settingStore.discordRpc.displayMode = v;
                    handleDiscordConfigUpdate();
                  },
                }),
              },
            ],
          },
        ],
      },
      {
        title: "WebSocket 配置",
        show: isElectron,
        items: [
          {
            key: "socket_enabled",
            label: "启用 WebSocket",
            type: "switch",
            description: "开启后可通过 WebSocket 获取状态或控制播放器",
            value: computed({
              get: () => socketEnabled.value,
              set: (v) => handleSocketEnabledUpdate(v),
            }),
          },
          {
            key: "socket_port",
            label: "WebSocket 端口",
            type: "input-number",
            description: "更改后需要测试并保存才能生效",
            componentProps: { min: 1, max: 65535, showButton: false, placeholder: "请输入端口号" },
            disabled: computed(() => socketEnabled.value),
            value: computed({
              get: () => socketPort.value,
              set: (v) => (socketPort.value = v || 25885),
            }),
          },
          {
            key: "socket_test",
            label: "测试端口配置",
            type: "button",
            buttonLabel: "测试并保存",
            show: computed(() => socketPort.value !== socketPortSaved.value),
            action: testSocketPort,
            componentProps: { type: "primary" },
          },
        ],
      },
    ],
  };
};
