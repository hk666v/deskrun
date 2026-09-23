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
- 通过 `getBootstrapData()` 一次性加载全部初始数据（items + groups + settings + configDirectory + startupWarning）
- 每个修改操作后通过返回值局部更新对应 signal，避免全量刷新
- 搜索索引 `searchIndex` 是 `createMemo`，自动响应 `items()` 变化

### 搜索机制
- 前端搜索，非后端搜索。`searchIndex` 为每个 item 预计算：
  - 英文归一化（`normalizedName`、`normalizedCombined`）
  - 全拼（`pinyinFullName`、`pinyinFullCombined`）
  - 首字母（`pinyinInitialsName`、`pinyinInitialsCombined`）
- 评分层级：精确 > 前缀 > 包含，名称 > 全拼 > 备注 > 组合 > 首字母
- 偏好加权（最高 +50）：isFavorite +14, lastLaunchedAt(7天 +12 / 30天 +8) +6, launchCount(max 12)
- **搜不到时不留死胡同**：`lib/query-actions.ts` 给出可执行的兜底（打开 URL / 网页搜索 / 进制转换），
  回车运行第一条。它只在 `visibleItems()` 为空时出现——真实条目永远优先于对查询意图的猜测。
  裸数字按十进制处理，只有 `0x`/`h` 后缀算十六进制；`1b` 这类有歧义的写法一律不猜

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
- **只有一个强调色 `signal`（琥珀）**，只用于选中态、唯一主操作，以及搜索命中高亮；`danger` 仅用于删除和错误。
  命中高亮是唯一在选中态之外用它地方——不标出匹配位置，拼音搜索的结果看起来就像 bug
- **机器数据（命令、路径、时间戳）用 `font-mono`**，人类数据用默认 sans
- **不使用大写加字距的眉标**，层级靠字号/字重/颜色
- **不使用 `backdrop-filter`**——透明窗口上的模糊会持续消耗 GPU/显存，与 9MB 目标冲突
- 选中态与 hover 态必须视觉可分：选中用 signal，hover 只用中性的 `fill`

### 组件通信
- 所有回调通过 props 向下传递，没有 context/provider
- `App.tsx` 定义所有处理函数（`handleLaunch`、`handleDelete`、`handleReorder` 等）

### 全局键盘的分层约定
`App.tsx` 的 `handleAppKeyDown` 挂在 document 捕获阶段，优先级从高到低：

1. IME 组合中（`isComposing` / keyCode 229）→ 完全放行
2. 焦点在 `[data-inline-editor]` 内 → 完全放行（内联编辑器自己处理 Enter/Escape）
3. Escape → 按层关闭：右键菜单 → 对话框 → 设置 → 都没有才隐藏窗口
4. 搜索框里的 Enter → 启动选中项；无匹配时执行第一条兜底动作
5. **Shift+F10 或菜单键 → 打开选中条目的右键菜单**，光标位置取自 `[data-item-id]`
   对应的卡片（`ItemCard` 的两个布局分支都必须带这个属性）
6. 有浮层打开 → 放行（浮层拥有键盘）
7. **方向键的归属要分开判断**（这一步曾经写错，两头都堵死过）：
   - `←` `→`：在 `input/textarea/select/contenteditable` 里一律放行给光标
   - `↑` `↓`：**归结果列表**，除非焦点在 `textarea`（换行）、`select` 或 `input[type=number]`（改值）里
   - 单行输入框没有垂直光标可移动，所以上下键是空着的——启动器最常见的操作就是
     "打完字按 ↓ 选结果"，把它堵掉等于方向键哪儿都用不了
8. 焦点在 `<button>` 内 → 只对 Enter 放行（按钮靠原生激活），**方向键仍然处理**。
   点击分组标签或卡片后焦点停在按钮上，此时方向键必须照常工作
9. 否则处理 Enter

**右键菜单自己的方向键/回车在 `ItemContextMenu` 内部处理**（`entries` memo 是数据驱动的，
方向键在其中循环，`aria-activedescendant` 跟随高亮）。菜单打开时会主动获取焦点，关闭后由 App 归还给搜索框。

**新增内联编辑器时必须加 `data-inline-editor`**，否则在输入框里按 Escape 会直接把整个启动器隐藏，
而不是取消编辑。

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
- **`confidence` 表达的是"我们怎么找到这个 target 的"，不是"这个应用有多值得导入"**。
  它由 `RegistryTargetMatch` 决定（`Declared`/`NameMatch` → medium，`Guessed` → low），
  不能再用"DisplayIcon 字段是否存在"来推断——残留的 DisplayIcon 会掉进猜测分支却仍被标成 medium
- **默认只勾选 `high`**（即开始菜单/桌面上 Windows 自己呈现为程序的快捷方式）。注册表来的条目
  一律默认不选：`Guessed` 那条是在安装目录里随手挑的，可能根本不是主程序
- `already_exists` 在扫描时算一次，导入后由前端就地更新（后端导入时也会再查一遍兜底）

### 不变量（改动前请先确认没有破坏）
- **写盘一律走 `storage::write_json`**：它写临时文件 + `sync_all` + `rename`。直接 `fs::write`
  会让断电/崩溃留下半截 JSON
- **配置文件解析失败必须隔离**：`read_json` 会把坏文件改名成 `*.corrupt-<时间戳>.json` 并返回
  `None`。失败绝不能冒泡到 `setup`——`windows_subsystem = "windows"` 下 panic 没有任何输出，
  用户只会看到"双击了没反应"
- **打开文件/URL/文件夹一律走 `tauri_plugin_opener`**，不要拼 `cmd /C start` 命令行：cmd 会把
  目标里的 `&` 当命令分隔符，既是功能 bug（带多个 query 参数的 URL 打不开）也是注入面
- **提权只能走 `ShellExecuteW` 的 `runas` 动词**（`launcher::elevate_target`）：已经运行的进程无法
  自行提权，也没有别的办法触发 UAC。它的失败是小整数错误码而非 last-error，5 表示用户拒绝了 UAC，
  要明确告诉用户而不是假装启动成功
- **热键先注册新的、成功后再注销旧的**（`hotkey::register_hotkey`）。顺序反了会让用户改一次
  热键就彻底失联
- **耗时命令必须 `spawn_blocking`**：Tauri 的 `#[tauri::command]` 默认在 IPC 路径上同步执行，
  扫描注册表和批量提取图标会冻住整个窗口
- **列表类操作批量写盘**：`create_item` 会写盘，批量导入请用 `create_item_in_memory` 再统一
  `persist_items()` 一次
- **改内存前先完成所有可能失败的步骤**：`update_item` 先校验、先解析图标，再落到存储上
- **窗口尺寸一律用逻辑像素**：`settings.json` 存的是逻辑值，前端传的也是 `innerSize() / scaleFactor`，
  所以 `WindowSizeLimits` 必须换算成逻辑值（见 `hotkey::window_scale`）。混入物理值会在 150%/200%
  缩放的显示器上把宽度上限压到接近最小值，表现为"拖不动窗口"
- **窗口尺寸没有设置项**：靠鼠标拖四边/四角调整，变化由 `sync_window_size` 记录。热区在
  `LauncherShell` 里是 16px 边 / 20px 角——可见面板外面有 gutter，所以实际落在面板内的只有约 10px，
  不能再调小
- **窗口位置默认跟随鼠标所在显示器**（`follow_cursor_monitor`，默认开）。双显示器下"记住上次位置"
  等于启动器永远弹在同一块屏上；只有关掉这个开关才用记住的坐标

---

## 开发命令

```bash
npm install              # 安装前端依赖
npm run tauri dev        # 开发模式（热重载）
npm run dev              # 仅前端，在浏览器里跑（走 tauri-shim + dev-fixture，见下）
npm run tauri build      # 生产构建
npm run typecheck        # tsc --noEmit，前端类型检查
npm run test             # typecheck + cargo test
npm run lint:rust        # clippy，警告视为错误
npm run clean            # 清理构建产物
```

CI（`.github/workflows/ci.yml`）跑 typecheck / vite build / vitest / cargo test / clippy /
`cargo fmt --check`，外加版本号三处一致性检查。**提交前跑 `npm run test` 和 `npm run lint:rust`**，
`cargo fmt` 是强制的。

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
