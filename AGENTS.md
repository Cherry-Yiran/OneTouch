# OneTouch Agent Guide

本文件适用于整个仓库。目标是让后续 Agent 在不破坏 macOS 原生体验、系统能力和发布链路的前提下，快速做出可验证的改动。

## 1. 项目定位

OneTouch 是一款仅驻留在 macOS 菜单栏的快捷控制工具。主控制面板和设置窗口在 macOS 上由 AppKit 原生绘制；React/Vite 负责状态编排、文案、浏览器预览及非 macOS 回退；Rust/Tauri 负责命令、生命周期和跨层桥接；Objective-C 负责 AppKit、Core Graphics、IOBluetooth 和部分系统集成。

设计和行为的优先级如下：

1. 用户在当前任务中的明确要求。
2. `README.md` 的“界面长期规则”。
3. `design.md` 的可复用设计规范。
4. 现有测试锁定的交互与布局契约。
5. 浏览器预览的 CSS 表现。

浏览器预览不是 macOS 产品界面的最终真相。当 Web CSS 与 AppKit 实现不一致时，以 `src-tauri/src/macos_helper.m` 和上述长期规则为准。

## 2. 仓库地图

| 路径 | 职责 |
| --- | --- |
| `src/App.jsx` | 控制项目录、中英文案、应用状态、计时器、更新流程及原生模型组装 |
| `src/Preferences.jsx` | Web/回退设置页、拖动排序、快捷键录制与无障碍交互 |
| `src/*Panel.jsx` | 分辨率、计时、磁盘保护等二级面板 |
| `src/*Model.js`、`src/controlInteractions.js` | 可独立测试的纯业务逻辑 |
| `src/nativeBridge.js` | React 与 Tauri 命令/事件之间的唯一 JS 桥接层，并提供浏览器预览数据 |
| `src/styles.css` | 浏览器预览和非 macOS 回退样式，不应用来模拟原生 AppKit 控件 |
| `src-tauri/src/lib.rs` | Tauri 命令、系统状态读取、操作执行、窗口和托盘生命周期 |
| `src-tauri/src/macos_helper.m` | AppKit 原生菜单栏图标、主面板、设置页和 macOS 专属能力 |
| `src-tauri/tauri.conf.json` | 应用标识、版本、打包与更新器配置 |
| `.github/workflows/release.yml` | `v*` 标签触发的测试、签名、打包和发布流程 |

## 3. 常用命令

```bash
pnpm install
pnpm dev
pnpm test:ui
pnpm build
cargo test --manifest-path src-tauri/Cargo.toml
pnpm native:dev
pnpm native:build
```

- 日常 JS 逻辑改动至少运行 `pnpm test:ui`。
- React、CSS 或资源改动同时运行 `pnpm build`。
- Rust、Objective-C、Tauri 配置或跨层协议改动同时运行 `cargo test --manifest-path src-tauri/Cargo.toml`。
- 涉及真实窗口、菜单栏定位、权限、蓝牙、显示器或系统开关时，测试不能替代 `pnpm native:dev` 的人工验证。
- 浏览器预览固定使用 `http://127.0.0.1:1420`；原生开发也依赖这个端口。

## 4. 修改原则

### 4.1 先保持原生

- macOS 已有对应能力时，使用 AppKit 的原生材质、语义颜色、控件和动效。
- 不在原生面板上添加硬编码 RGB、透明度、自绘圆角、边框、阴影、模糊或尖角。
- macOS 26 及以上主面板使用 untinted `NSGlassEffectViewStyleRegular`；旧系统回退到 `NSVisualEffectMaterialPopover`。
- 主面板是无箭头 `NSPanel`，锚定真实 `NSStatusItem.button`，水平居中并贴合菜单栏下沿。
- 原生开关使用 `NSSwitch`，图标使用 SF Symbols，普通文本使用系统字体与语义色。
- 设置窗口使用 `NSWindowToolbarStylePreference`、`NSTabViewController`、`NSGridView`、`NSSearchField`、`NSTableView` 等系统组件。

### 4.2 保持跨层契约

- 新增或修改原生能力时，按 `App.jsx` → `nativeBridge.js` → Tauri command/event → `lib.rs` → `macos_helper.m` 的调用链检查所有层。
- JS 侧传输对象使用 `camelCase`；Rust 序列化结构使用 `#[serde(rename_all = "camelCase")]` 保持一致。
- 原生回调和事件名是协议，不要只改单侧字符串。
- `nativeBridge.js` 必须继续为浏览器模式提供安全、确定性的回退结果。
- 原生主面板仅在行结构或语言变化时重建；状态更新应复用既有 `NSSwitch`，保留系统动画和窗口层级。

### 4.3 控制项语义

- 持续状态使用 `toggle`；一次性操作使用 `action`；应用内选择使用 `choice`；跳转系统设置使用 `settings`。
- 持续状态和一次性操作都显示开关。一次性操作只在处理中保持开启，完成后自动关闭，不增加二次确认。
- 定时控制在关闭状态点击开关后直接显示原生时长菜单。
- 控件永远占用固定的右侧控制列，不能挤入标题和状态文案区域。
- 控制项可见数量没有上限；超过 8 项时主面板固定高度，仅列表区域原生滚动。
- 隐藏的附件控件不参与布局；不要用透明或 `hidden` 视图预留空白。

### 4.4 状态、持久化和失败处理

- 尽量把新增规则写成 `src/` 下的纯函数，再由 React 或原生层调用，以便用 Node 内建测试覆盖。
- 不更改既有 localStorage key、控制项 ID 或持久化结构，除非同时实现向后兼容迁移。
- 系统能力可能处于 unavailable、unknown、pending、error 或 known 状态；不要把“未知”误当成“关闭”。
- 仅在确实需要某项能力时触发 macOS 权限请求。失败信息要给出可恢复路径，并保持中英文一致。
- 调用外部进程必须使用明确的绝对系统路径、参数数组、超时和可读错误；不要拼接未经验证的 shell 字符串。

## 5. UI 与文案约束

- 所有产品界面同时维护简体中文和 English。修改控制项文案时检查 `COPY`、`PREFERENCES_COPY` 以及传给原生模型的 `strings`。
- 主面板标题最多使用 Medium；列表标题和次级说明使用 Regular。不要用 Semibold/Bold 补偿层级问题。
- 主面板只在“标题/列表”和“列表/底栏”两个分组边界使用原生 `NSBoxSeparator`；行之间不加分割线。
- 底栏固定为设置靠左、自定义居中、退出靠右。三个按钮由 AppKit 管理 hover、pressed、inactive 和主题状态。
- 菜单栏图标和主面板品牌标志使用同一个单开关 template image，并由系统外观决定颜色；功能选中态使用 `NSColor.controlAccentColor`。
- 设置页四个 pane 的内容宽度统一为 400pt；通用页高 144pt，列表页高 420pt，关于页高 244pt；共用 20pt 水平边距和 34pt 列表行高。
- “关于”页只放应用图标、名称、版本、更新按钮/状态与 GitHub 按钮。
- Web 预览可使用 `src/styles.css` 中的深色玻璃和青柠强调色，但不要把这些硬编码值移植到 AppKit。

更完整的视觉、布局、动效与主题规则见 `design.md`。

## 6. React 与 CSS 约定

- 保持现有函数组件、hooks 和 ESM 风格；纯逻辑优先拆出 model 文件。
- 无障碍属性是行为契约：开关保留 `role="switch"`/`aria-checked`，标签页保留完整 tab 关系，拖动排序同时支持键盘。
- 尊重 `prefers-reduced-motion`；新增动效必须有无动效路径。
- CSS 类名延续按组件/状态组织的命名，例如 `.switch-row.is-pending`。不要引入另一套全局工具类系统。
- 小屏预览只用于检查回退页面的裁切和触控可达性；不要据此改变原生窗口的固定 pt 尺寸。

## 7. Rust 与 Objective-C 约定

- 保持 `#[cfg(target_os = "macos")]` 与非 macOS 回退成对存在，使 Rust 测试和浏览器预览仍可运行。
- 新 API 使用 `@available` 或版本判断保护，最低支持 macOS 13。
- AppKit 对象的创建和更新必须在主线程执行；耗时的系统命令不能阻塞 UI。
- Objective-C helper 已承载多个系统框架。修改时缩小范围，保留 ARC/Core Foundation 所有权平衡和既有事件监听清理。
- 不用私有视觉实现复刻系统界面。若系统能力本身需要非公开或易变接口，必须把 unavailable/error 路径视为正常状态并保持降级安全。

## 8. 测试与验收矩阵

改动完成前按影响范围检查：

| 变更 | 必须验证 |
| --- | --- |
| 纯 model/状态逻辑 | 对应 `src/*.test.js` + `pnpm test:ui` |
| React/文案/交互 | `pnpm test:ui`、`pnpm build`、中英文、键盘操作 |
| CSS/Web 回退 | `pnpm build`、桌面与约 390px 宽预览、reduced motion |
| AppKit 布局 | UI 源码契约测试、`cargo test`、真实浅色/深色与系统强调色 |
| 系统开关/权限 | 成功、拒绝、不可用、未知状态和恢复路径 |
| 菜单栏/窗口 | 多显示器、菜单栏锚点、外部点击、Esc、失焦与全屏 Space |
| 设置/持久化 | 重启后语言、顺序、可见项、快捷键、登录启动状态 |
| 更新/发布 | 版本三处一致、无密钥入库、发布配置仅在明确要求时修改 |

部分测试会直接断言源码中的 AppKit 常量和组件选择。布局契约发生有意变化时，同步更新实现、`README.md`、`design.md` 和相应测试；不要为了“让测试通过”而放松长期规则。

## 9. 发布与安全

- 不提交 `.env`、证书、Tauri 更新私钥、Apple 凭据或本地签名文件。
- 不在普通功能改动中顺手修改版本号、更新公钥、发布 endpoint 或 workflow。
- 版本发布需同步 `package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json` 和 `CHANGELOG.md`，并确保锁文件一致。
- 正式发布由 `v*` 标签触发 `.github/workflows/release.yml`；不要在未经明确要求时创建标签或上传 release。

### Git 提交规则

- 只要当前任务产生了代码改动，交付前必须至少创建一次 Git 提交，不得把代码改动仅留在工作区。
- 提交标题统一使用 `<type>: <中文描述>`，冒号后写简洁、准确的中文说明，例如 `feat: 增加屏幕分辨率切换`、`fix: 修复菜单栏面板定位偏移`。
- `type` 使用 Conventional Commits 常见前缀：`feat`、`fix`、`refactor`、`perf`、`test`、`build`、`ci`、`docs` 或 `chore`；根据改动的主要目的选择，不使用含糊前缀。
- 一组不可分割的改动使用一个提交；存在彼此独立的改动时按逻辑拆分，避免按文件机械拆分提交。
- 只暂存并提交当前任务产生的文件，保留用户已有或并发产生的未提交改动，不得顺手纳入提交。
- 创建提交不等于推送；仅在用户明确要求时执行 `git push`、创建标签或发布版本。

## 10. Agent 交付清单

1. 说明修改影响的是原生产品、Web 回退还是两者。
2. 保持用户已有未提交改动，不覆盖无关文件。
3. 运行与风险相称的测试，并准确报告未运行的真实设备验证。
4. 新增控制项或状态时检查中英文、SF Symbol、原生模型、浏览器回退、权限和持久化。
5. 若设计或行为契约改变，同步更新 `README.md`、`design.md` 和测试。
6. 当前任务包含代码改动时，按上述格式创建 Git 提交，并在交付时报告提交哈希。
