# DeskRun

Windows 11 极轻量级快速启动器，`Alt + Space` 唤起 → 搜索 → 启动。闲置内存约 9 MB。

技术栈：Rust + Tauri 2 + SolidJS + Vite + Tailwind CSS 4

目标平台：仅 Windows 11

---

## 项目结构

```
src/                    # SolidJS 前端 (TypeScript)
  App.tsx               # 顶层入口，所有状态管理和事件处理
  types.ts              # 前端类型定义（通过 Tauri invoke 与 Rust 模型对应）
  index.css             # design token 单一真源（@theme）+ 基础层
  tauri-shim.ts         # 仅 DEV：浏览器里替身 Tauri IPC，生产构建被 tree-shake
  dev-fixture.ts        # 仅 DEV：浏览器调试用的假数据（items/groups/discovery）
  components/
    LauncherShell.tsx    # 外壳布局 + 拖拽覆盖层
    SearchBar.tsx        # 搜索栏 + 添加按钮 + 设置入口
    GroupTabs.tsx        # 分组标签页（含收藏、最近、发现等内置视图）
    ItemGrid.tsx         # 网格/列表视图容器 + 键盘导航 + 拖拽排序
    ItemCard.tsx         # 单个启动项卡片（图标、名称、hover 预览等）
    ItemContextMenu.tsx  # 右键上下文菜单
    ItemEditorDialog.tsx # 创建/编辑条目的对话框
    DiscoveryPanel.tsx   # App Discovery 扫描面板
    SettingsPanel.tsx    # 设置面板
  lib/
    commands.ts          # 所有 invoke() 调用封装，一一对应 Rust #[tauri::command]
    search.ts            # 搜索索引构建 + 拼音匹配 + 搜索评分 + 偏好加权
    clipboard.ts         # 剪贴板复制（用于 Copy Command）
    command-preview.ts   # CMD 预览文本生成
src-tauri/
  src/
    lib.rs               # Tauri 启动入口，插件注册，命令注册，窗口事件处理
    main.rs              # Windows 主入口
    app_state.rs         # 全局 AppState (Mutex<StorageState>)
    commands.rs          # 所有 #[tauri::command] 实现，调用 storage/launcher/hotkey
    models.rs            # Rust 端数据结构 (LaunchItem, Group, Settings 等)，与 TS types.ts 对应
    storage.rs           # JSON 持久化：items.json settings.json icons/ 的读写 + 配置迁移
    launcher.rs          # 实际启动逻辑：exe/link/folder/url/command 的分发执行
    hotkey.rs            # 全局热键注册 + 窗口显示/隐藏 + 窗口尺寸管理
    discovery.rs         # App Discovery 扫描（开始菜单、桌面、注册表）
    icons.rs             # Windows 图标提取 + 自定义图标导入 + 缓存管理
    tray.rs              # 系统托盘
```

---

## 前端核心约定

### 数据流
- `App.tsx` 是唯一的状态持有者，所有 `createSignal` 在 App 内定义
- 通过 `getBootstrapData()` 一次性加载全部初始数据（items + groups + settings + windowSizeLimits + configDirectory）
- 每个修改操作后通过返回值局部更新对应 signal，避免全量刷新
- 搜索索引 `searchIndex` 是 `createMemo`，自动响应 `items()` 变化

### 搜索机制
- 前端搜索，非后端搜索。`searchIndex` 为每个 item 预计算：
  - 英文归一化（`normalizedName`、`normalizedCombined`）
  - 全拼（`pinyinFullName`、`pinyinFullCombined`）
  - 首字母（`pinyinInitialsName`、`pinyinInitialsCombined`）
- 评分层级：精确 > 前缀 > 包含，名称 > 全拼 > 备注 > 组合 > 首字母
- 偏好加权（最高 +50）：isFavorite +14, lastLaunchedAt(7天 +12 / 30天 +8) +6, launchCount(max 12)

### 视图模式
- `grid` 模式：列数由 `ItemGrid` 用 `ResizeObserver` 实测（`auto-fill minmax(200px, 1fr)`），方向键左右 ±1、上下 = 当前实测列数（`App.tsx` 的 `gridColumns` signal）
- `list` 模式：按分组分区显示，方向键上下 ±1
- 内置视图 ID：`__favorites__`、`__recent__`、`__discovery__`

### 视觉系统
- **所有颜色、字号、圆角、阴影一律取自 `src/index.css` 的 `@theme` token，不写裸 hex 或任意透明度值**（如 `bg-[#161820]`、`text-white/84`）
- 表面三档：`canvas`（窗口底板）→ `surface`（面板/凹槽）→ `raised`（卡片/浮层）
- 文字四档：`fg` / `fg-muted` / `fg-subtle` / `fg-faint`；发丝线 `line` / `line-strong`
- 字号七档：`text-micro|meta|data|label|body|title|display`（各自内建行高）
- 圆角三档：`rounded-sharp|panel|window`；z 阶梯用 `z-sticky|chrome|float|scrim|overlay|menu|toast`
- **只有一个强调色 `signal`（琥珀）**，只用于选中态和唯一主操作；`danger` 仅用于删除和错误
- **机器数据（命令、路径、时间戳）用 `font-mono`**，人类数据用默认 sans
- **不使用大写加字距的眉标**，层级靠字号/字重/颜色
- **不使用 `backdrop-filter`**——透明窗口上的模糊会持续消耗 GPU/显存，与 9MB 目标冲突
- 选中态与 hover 态必须视觉可分：选中用 signal，hover 只用中性的 `fill`

### 组件通信
- 所有回调通过 props 向下传递，没有 context/provider
- `App.tsx` 定义所有处理函数（`handleLaunch`、`handleDelete`、`handleReorder` 等）

---

## Rust 后端核心约定

### 状态管理
- `AppState` = `Arc<Mutex<StorageState>>`，通过 Tauri State 管理
- `StorageState` 持有所有内存数据 + 文件路径，读写操作先改内存再 `persist_items()`/`persist_settings()`
- `StorageState::normalize()` 保证数据一致性（排序、枚举校验）

### Tauri 命令模式
- 每个 `#[tauri::command]` 在 `commands.rs` 中定义，`lib.rs` 中注册
- 前端通过 `invoke("<command_name>", { params })` 调用
- 错误通过 `Result<T, String>` 返回，`to_string()` 转 anyhow error

### 启动执行
- `launcher.rs` 根据 `LaunchItemKind` 分发到不同执行器
- command 类型通过 `cmd.exe /C` 或 `/K`（keepOpen）执行，拼接固定参数 + 运行时参数

### 持久化
- `items.json` + `settings.json` 存储于 `AppData\Roaming\com.deskrun.desktop\`
- 支持自定义配置目录（`config-location.json` 记录自定义路径）
- 配置迁移时 remap 图标路径

### Discovery
- 扫描来源：开始菜单、桌面 .lnk、注册表卸载项
- 返回 `DiscoveryCandidate` 列表，前端勾选后批量导入

---

## 开发命令

```bash
npm install              # 安装前端依赖
npm run tauri dev        # 开发模式（热重载）
npm run dev              # 仅前端，在浏览器里跑（走 tauri-shim + dev-fixture，见下）
npm run tauri build      # 生产构建
npm run clean            # 清理构建产物
```

调样式时优先用 `npm run dev`：`tauri-shim.ts` 让 App 在浏览器里能挂载，`dev-fixture.ts` 提供假数据，
所以 grid/list/discovery/编辑器/设置都能直接看和改，不必等 Rust 重编译。
涉及窗口行为的部分（拖动、resize、托盘、实际启动、失焦隐藏）必须在 `npm run tauri dev` 里验。

注意 `npm run build` 只跑 vite，**不做类型检查**；`npx tsc --noEmit` 目前有 3 个历史遗留错误
（`LauncherShell.tsx` 的 `ResizeDirection` 导入与 `onMouseDownCapture`，均早于视觉重构）。

---

## 关键约束

- **不要引入复杂的第三方状态管理** — App.tsx 单一状态树足够
- **不要在后端做搜索** — 前端拼音搜索是明确的设计决策
- **数据模型严格对应** — TS `types.ts` 中的接口必须与 Rust `models.rs` 中的 struct 字段名对齐（camelCase / serde rename_all）
- **存储安全** — 先改内存再写盘，写入失败不会导致内存状态不一致
- **SCOPE IS SMALL** — v1 不做自动扫描、插件系统、云同步、跨平台、PowerShell 命令
- **未来方向见 TODO.md** — DeskRun 定位从 app launcher 升级为"桌面效率入口"，计划支持截图/OCR/剪贴板历史等扩展模块
