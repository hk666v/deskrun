# DeskRun 扩展架构设计草案

## 1. 目标
把 DeskRun 从“应用启动器”平滑升级为“桌面效率入口”，在不破坏现有启动器体验的前提下，支持后续加入：

- 截图
- OCR
- 剪贴板历史
- 颜色取值
- 窗口管理
- 文本片段
- 轻量自动化动作

核心要求：

- 现有启动项体系继续可用
- 新功能可独立接入
- UI 入口统一
- 数据结构可渐进演进
- 不一开始就引入复杂插件系统

---

## 2. 设计原则

### 2.1 核心稳定
启动器主链路始终保持简单：

- 呼出
- 搜索
- 分组
- 启动/执行
- 隐藏

### 2.2 扩展独立
每个新能力都以“模块”方式接入，不直接散落到主流程里。

### 2.3 统一入口
无论是启动 app，还是截图/OCR，用户都通过同一个 DeskRun 主界面触发。

### 2.4 渐进升级
先做“内置模块机制”，后续如果真的需要，再升级成插件系统。

---

## 3. 总体架构

建议拆成 4 层：

### 3.1 Launcher Core
负责基础能力：

- 主窗口
- 搜索
- 分组
- 收藏/最近使用
- 全局热键
- 托盘
- 配置持久化
- 主 UI 状态管理

### 3.2 Item Registry
负责“系统里有哪些可展示、可搜索、可执行的对象”。

统一注册三类对象：

- 用户手动添加的启动项
- Discovery 扫描结果
- 内置工具动作

### 3.3 Executors
负责“对象被点击后如何执行”。

例如：

- AppExecutor
- UrlExecutor
- CommandExecutor
- ActionExecutor

### 3.4 Feature Modules
负责具体扩展能力。

例如：

- ScreenshotModule
- OcrModule
- ClipboardModule
- WindowToolsModule

---

## 4. 数据模型建议

当前 `LaunchItem` 后期建议演进为更通用的 `DeskItem`。

### 4.1 建议的新统一模型

```ts
type DeskItemKind =
  | "app"
  | "folder"
  | "url"
  | "command"
  | "action";

interface DeskItem {
  id: string;
  name: string;
  kind: DeskItemKind;
  groupId: string | null;
  iconPath: string | null;
  note: string | null;
  isFavorite: boolean;
  launchCount: number;
  lastUsedAt: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;

  payload: AppPayload | FolderPayload | UrlPayload | CommandPayload | ActionPayload;
}
```

### 4.2 ActionPayload 示例

```ts
interface ActionPayload {
  actionId: string;
  params?: Record<string, unknown>;
}
```

例如：

```json
{
  "actionId": "screenshot.region"
}
```

或：

```json
{
  "actionId": "ocr.capture",
  "params": {
    "language": "zh-CN"
  }
}
```

### 4.3 兼容策略
首版不用立刻重构所有存量数据，可采用：

- 存储层继续保留现有 `LaunchItem`
- 在前端展示层先做一个 `ViewItem` 适配
- 等 action 模块成熟后再正式迁移到 `DeskItem`

这样风险最低。

---

## 5. 模块注册机制

建议引入一个简单的模块清单，而不是插件市场。

### 5.1 模块定义

```ts
interface DeskModule {
  id: string;
  name: string;
  description: string;
  actions?: ActionDefinition[];
  settings?: ModuleSettingDefinition[];
}
```

### 5.2 ActionDefinition

```ts
interface ActionDefinition {
  id: string;
  name: string;
  description: string;
  icon?: string;
  category: string;
  run: (context: ActionContext) => Promise<void>;
}
```

### 5.3 示例

```ts
const screenshotModule: DeskModule = {
  id: "screenshot",
  name: "Screenshot Tools",
  description: "Screen capture utilities",
  actions: [
    {
      id: "screenshot.region",
      name: "Region Screenshot",
      description: "Capture a selected area",
      category: "Capture",
      run: async () => {}
    },
    {
      id: "screenshot.full",
      name: "Fullscreen Screenshot",
      description: "Capture the full screen",
      category: "Capture",
      run: async () => {}
    }
  ]
};
```

---

## 6. 执行器设计

建议把执行逻辑从“按 item kind if/else”整理成独立 executor。

### 6.1 接口

```ts
interface ItemExecutor {
  canRun(item: DeskItem): boolean;
  run(item: DeskItem): Promise<void>;
}
```

### 6.2 实现

- `AppExecutor`
- `FolderExecutor`
- `UrlExecutor`
- `CommandExecutor`
- `ActionExecutor`

### 6.3 ActionExecutor
`ActionExecutor` 不直接做功能，而是：

- 根据 `actionId`
- 找到对应模块里的 action handler
- 执行 `run()`

这样后续截图/OCR 都不用改主调度逻辑。

---

## 7. UI 设计建议

## 7.1 统一搜索入口
所有内容统一可搜：

- 启动项
- 内置动作
- 扩展工具

用户不需要理解“这是 app 还是动作”。

## 7.2 分组层面
建议保留两类分组：

- 用户分组
- 系统分组

后续可增加一个系统组：

- `Tools`

里面放：

- 截图
- OCR
- 剪贴板
- 取色器

## 7.3 卡片展示差异
动作卡片和 app 卡片保持统一视觉，但允许轻微差异：

- app 显示 target
- command 显示 command preview
- action 显示 action description

例如截图卡片可显示：

- `Region Screenshot`
- `Capture a selected area`

---

## 8. 设置架构建议

不要把所有扩展设置都堆进主 `Settings`。

建议改成：

### 8.1 Core Settings
只放全局内容：

- 热键
- 开机启动
- 窗口大小
- 配置目录
- 显示模式

### 8.2 Module Settings
每个模块单独一块：

- Screenshot
- OCR
- Clipboard

例如截图模块设置：

- 默认保存路径
- 文件名格式
- 是否复制到剪贴板
- 截图后是否预览

---

## 9. 存储设计建议

建议分成三层：

### 9.1 核心数据
- `settings.json`
- `items.json`
- `groups.json`

### 9.2 模块数据
例如：

- `modules/screenshot.json`
- `modules/clipboard.json`

### 9.3 缓存数据
例如：

- `cache/icons/`
- `cache/thumbs/`
- `cache/ocr/`

这样未来加新模块时，不会污染核心配置结构。

---

## 10. 截图模块如何接入

以“截图”举例，推荐这样做。

### 10.1 模块内容
模块提供几个 action：

- 区域截图
- 全屏截图
- 当前窗口截图
- 截图后 OCR

### 10.2 用户入口
有两种接入方式：

1. 内置默认 action
自动出现在 `Tools` 组里

2. 用户可收藏
用户把“区域截图”加到 Favorites

### 10.3 执行流程
例如“区域截图”：

- 用户呼出 DeskRun
- 搜索 `screenshot`
- 点击 `Region Screenshot`
- Rust 调起截图覆盖层
- 选区完成
- 保存文件 / 复制到剪贴板 / 可选预览

### 10.4 为什么这样好
因为它对用户来说仍然只是“执行一个条目”，不会破坏 DeskRun 原本认知模型。

---

## 11. 后续如果要支持插件

现在不建议先做，但架构上可以预留。

### 11.1 未来可扩展点
未来模块注册器可以从：

- 内置静态注册

演进为：

- 扫描本地模块目录
- 加载模块 manifest
- 按约定调用 handler

### 11.2 未来插件 manifest
可以类似：

```json
{
  "id": "screenshot",
  "name": "Screenshot Tools",
  "version": "1.0.0",
  "actions": [
    {
      "id": "screenshot.region",
      "name": "Region Screenshot"
    }
  ]
}
```

但这一步不必现在做。

---

## 12. 推荐实施顺序

### Phase 1
先做架构准备，不上复杂功能：

- 增加 `action` 类型
- 增加 `ActionExecutor`
- 增加模块注册表
- 前端支持展示 action 卡片

### Phase 2
做第一个非启动类功能：

- `ScreenshotModule`

因为最直观，也最容易验证价值。

### Phase 3
继续补通用桌面工具：

- OCR
- Clipboard History
- Color Picker

### Phase 4
再考虑复杂能力：

- 自动化动作链
- 模块 marketplace
- 插件化

---

## 13. 我对 DeskRun 的定位建议

建议项目定位从：

- `Windows launcher`

升级为：

- `Windows productivity launcher`
- `desktop action hub`
- `your command center for apps and tools`

这样未来加入截图、OCR、贴图、剪贴板，都不会显得跑题。

---

## 14. 最简结论

最适合 DeskRun 的扩展方式不是“继续往启动项里堆字段”，而是：

- 保留启动器核心
- 引入统一 `action` 类型
- 用模块注册表管理扩展能力
- 用 executor 执行动作
- 用统一搜索/UI 暴露给用户

这样你后面加“截图”等和 app 启动无关的功能，会非常顺。

如果你愿意，我下一步可以继续给你出一版：

`DeskRun Screenshot Module v1 设计草案`

把“截图功能”单独细化成可实施方案。