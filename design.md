# Design System: OneTouch

> 本文档基于当前 AppKit 实现、React 浏览器预览、README 长期规则和现有布局测试整理。macOS 原生表面是产品规范；Web 预览是调试与演示层，不能反向定义原生视觉。

## 1. Visual Theme & Atmosphere

OneTouch 的核心气质是“安静、原生、立即可用”：它不是一个缩小的 Dashboard，而是菜单栏的轻量延伸。主面板应像 macOS 自己提供的临时控制表面——尺寸紧凑、信息层级清楚、系统材质可感知，但没有额外品牌装饰抢占注意力。品牌只通过单开关标志、产品名和一致的交互节奏出现；真正承担状态表达的是系统强调色、语义文字颜色和原生控件。

布局以操作效率而非内容展示为中心。每行都是“图标 + 两级文案 + 固定右侧控件列”，默认不使用卡片、行分割线或大字号标题。主面板最多显示 8 行的固定视口，更多项目只滚动中段，标题与底部操作保持稳定。设置窗口同样遵循紧凑的 macOS Preference 模式，并让不同 pane 的高度跟随内容变化。

浏览器预览采用更具展示性的深色玻璃场景：深黑紫背景、青柠强调色、彩色桌面壁纸与明显的玻璃阴影。这套语言用于说明层级和交互，不应移植为 AppKit 的硬编码颜色、模糊或阴影。

### Key Characteristics

- 原生优先：系统材质、语义色、系统字体、SF Symbols 和 AppKit 控件共同定义视觉。
- 紧凑清晰：360pt 菜单面板、55pt 行高、固定控件列、仅两处组间分隔。
- 状态即交互：持续开关和一次性动作共享 `NSSwitch` 语言，处理中状态直接体现在控件上。
- 品牌克制：单开关 template 标志保持中性；功能激活态使用用户的系统强调色。
- 主题自适应：浅色、深色、增强对比度和菜单栏外观由系统自动处理。
- Web 展示层独立：深色玻璃与 `#C8F542` 只属于浏览器预览。

## 2. Color Palette & Roles

原生界面不定义固定色板。下表中的 AppKit 语义值是实现契约，会随系统外观、用户强调色和辅助功能设置变化。

| Role | Semantic Name | Value | Usage |
| --- | --- | --- | --- |
| Primary action / active | System Accent | `NSColor.controlAccentColor` · Web preview `#C8F542` | 激活的功能图标、`NSSwitch` 和设置页选中态；hex 仅用于预览板 |
| Primary text | Label | `NSColor.labelColor` · Web preview `#F5F5F5` | 标题、控制项名称、主要内容 |
| Secondary text | Secondary Label | `NSColor.secondaryLabelColor` · Web preview `#8D8D95` | 状态、说明、未激活图标 |
| Disabled text | Tertiary Label | `NSColor.tertiaryLabelColor` · Web preview `#777780` | 不可用能力和弱化内容 |
| Error | System Red | `NSColor.systemRedColor` · Web preview `#FF5F57` | 权限、更新或系统操作错误 |
| Main surface, macOS 26+ | Regular Glass | untinted system glass · Web preview `#121216` | 主控制面板背景 |
| Main surface, older macOS | Popover Material | system popover · Web preview `#121216` | macOS 13–25 回退背景 |
| Window surface | System Window | AppKit default · Web preview `#131317` | 原生设置窗口和各 pane |
| Separator | System Separator | `NSBoxSeparator` · Web preview `#2B2B30` | 只用于两个主面板分组边界 |

### Primary

- 功能状态的强调色来自 `NSColor.controlAccentColor`，必须尊重用户选择，不固定为品牌青柠或系统蓝。
- 品牌标志是 template image，`contentTintColor = nil`，由 AppKit 在菜单栏、玻璃、浅色和深色环境中自动选择可读颜色。

### Interactive

- `NSSwitch`、圆角按钮、搜索框、下拉菜单和工具栏选中态全部由 AppKit 提供 hover、pressed、focus、disabled 和 selected 颜色。
- 底栏按钮使用 `showsBorderOnlyWhileMouseInside = YES`：默认透明，指针进入后才显示系统 bezel。
- 键盘焦点不能用固定品牌描边替代系统 focus ring。

### Neutral Scale

- 原生不维护自定义灰阶；主要、次要、三级标签分别使用 `labelColor`、`secondaryLabelColor`、`tertiaryLabelColor`。
- 不可用状态同时降低文本/图标语义等级并禁用控件，不单靠透明度表达。
- Web 预览观察值：主文本 `#F5F5F5`、中性图标 `#A1A1AA`、次级文案 `#8D8D95`、画布 `#09090B`。

### Surface & Overlay

- **Native glass:** macOS 26+ 使用未染色的 Regular Glass；不叠加旧模糊层或自绘背景。
- **Native fallback:** macOS 13–25 使用 active、behind-window 的 Popover Visual Effect。
- **Settings:** 标准 `NSWindow` 表面，不添加人造卡片底色或自定义阴影。
- **Web preview:** `rgba(18, 18, 22, .72)` 玻璃面板，外层画布 `#09090B`；仅供预览。

## 3. Theme Modes

### Light Mode

- Background: 由系统窗口外观自动决定；设计板参考 `#F5F5F7`。
- Surface: 透明材质保持系统层次；设计板参考 `#FFFFFF`。
- Text: `labelColor` 自动切换为深色；设计板参考 `#1D1D1F`。
- Accent: 保持用户的 `controlAccentColor`；设计板参考系统蓝 `#007AFF` 仅用于说明动态角色。
- Notes: template 品牌标志必须保持 `contentTintColor = nil`；用真实浅色系统外观检查可读性。

### Dark Mode

- Background: 使用同一个系统材质；Web 设计板参考 `#09090B`。
- Surface: 由系统自动得到暗色玻璃；Web 设计板参考 `#121216`。
- Text: `labelColor` 自动切换为浅色；Web 设计板参考 `#F5F5F5`。
- Accent: 继续尊重用户强调色；Web 设计板参考 `#C8F542`，不得用于原生固定 tint。
- Notes: 不把 Web 预览的 `#C8F542`、黑紫画布或自定义阴影带入原生界面。

### Shadows & Depth

- **Main panel:** `NSPanel.hasShadow = YES`，由系统根据材质和当前 Space 绘制。
- **Settings window:** 标准 document-window 动效与系统窗口阴影。
- **Focus:** 使用 AppKit focus ring，不另加 glow。
- **Web preview only:** 面板边框 `rgba(255,255,255,.19)`，阴影约为内侧高光加 `0 20px 52px rgba(0,0,0,.68)`。

## 4. Typography Rules

### Font Family

- Primary: macOS 原生界面统一使用 `NSFont.systemFont`，中文由系统回退到苹方；不要捆绑字体。
- Web preview: `Geist`, `SF Pro Display`, `PingFang SC`, `Helvetica Neue`, `system-ui` 依次回退。
- Monospace: 产品 UI 没有常规等宽字体需求；快捷键显示使用原生按钮和系统符号。
- OpenType Features: 使用系统默认；不自定义数字样式、连字或字距特性。

### Hierarchy

| Role | Font | Size | Weight | Line Height | Letter Spacing | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Product title | System | 15pt | Medium | System | Default | 主面板 `OneTouch`，品牌层级上限 |
| Product subtitle | System | 11.5pt | Regular | System | Default | 标题下方的“快捷控制” |
| Control title | System | `NSFont.systemFontSize` | Regular | System | Default | 每行主要文案，不固定放大 |
| Control status | System | `NSFont.smallSystemFontSize` | Regular | System | Default | 状态、提示和错误信息 |
| Footer text action | System | 13pt | Regular | System | Default | 居中的“自定义”按钮 |
| Row choice button | System | 12pt | Medium | System | Default | 分辨率等非开关操作 |
| Settings body | System | System default | Regular | System | Default | 原生 label、table 和 form |
| About title | System | 18pt | Medium | System | Default | 关于页唯一较大的名称 |
| Web preview control title | Geist/System | 13px | 400 | Normal | -0.01em | 仅 Web 回退 |
| Web preview status | Geist/System | 10–10.5px | 400 | ~1.25 | Default | 仅 Web 回退 |

### Principles

- 通过系统字号、语义颜色和空间建立层级，不通过粗体堆叠强调。
- 列表标题与状态最多一行，尾部截断，始终给右侧控件留出空间。
- 品牌标题可用 Medium；功能标题、状态、按钮默认 Regular。
- 中英文必须在同一宽度约束下成立，不能为某一种语言单独破坏控件列。

## 5. Component Stylings

### Buttons and Links

- **Primary CTA:** OneTouch 没有全局品牌色主按钮。需要确认或执行时使用标准 `NSButton` rounded bezel，标题直接描述动作，如“检查更新…”或“下载并安装”。
- **Secondary CTA:** 主面板底栏与 GitHub 按钮使用 `NSBezelStyleAccessoryBarAction`；默认不抢眼，hover 时由 AppKit 显示边框/背景。
- **Icon buttons:** 设置与退出使用 SF Symbols、44pt 宽布局槽、32pt 高按钮；工具提示提供文本名称。
- **Text links:** 外部 GitHub 入口仍表现为原生按钮并由 `NSWorkspace` 打开，不在 AppKit 中自绘网页式下划线。
- **Hover and active feel:** 指针、按下、非活跃和主题状态完全交给 AppKit。Web 回退使用约 140–250ms 的短过渡。

### Cards and Containers

- **Surface style:** 主面板是一个原生系统材质，不在内部嵌套卡片。
- **Radius:** 原生窗口圆角由系统决定，不在 CALayer 中重复绘制。
- **Border:** 不自绘外框；两个组间边界使用真正的 `NSBoxSeparator`。
- **Shadow or elevation:** 窗口级系统阴影；行、表单和列表不加独立阴影。
- **Internal spacing:** 主面板左右 16pt，图标与文案间 10pt，文案与控件列至少 10pt。

### Inputs and Interactive Controls

- **Switch:** 小号 `NSSwitch` 放在 64pt 固定尾部列并右对齐。开关状态由系统强调色表达。
- **Action as switch:** 一次性操作启动时开、锁定并显示处理中状态，完成后关；不增加另一套 action button 或确认态。
- **Choice/settings:** 不适合开关的行使用 small rounded `NSButton`，仍占用相同尾部列。
- **Forms:** 通用设置用 `NSGridView` 对齐右侧标签与左侧控件；语言使用 184pt `NSPopUpButton`，登录启动使用 regular `NSSwitch`。
- **Search/list:** 自定义和快捷键页使用原生 `NSSearchField`、inset `NSTableView`、34pt 行高。
- **Focus behavior:** 保留系统键盘焦点、Tab 顺序和 VoiceOver 名称；不要移除 focus ring。

### Navigation

- **Menu bar entry:** 24pt 状态项，显示 16pt 单开关 template image，整个区域可点击。
- **Main panel footer:** 设置靠左、自定义居中、退出靠右，不因文案宽度重新均分或聚拢。
- **Settings toolbar:** 四个固定 pane——通用、自定义、快捷键、关于；使用 `NSWindowToolbarStylePreference`、图标与标签、系统选中态。
- **Window title:** 标题栏显示当前 pane 名称并随 toolbar 选择同步，不在内容区重复绘制标题。

### Image Treatment

- 主产品 UI 不使用摄影、插画或产品截图。
- 功能图标优先使用 16pt、Regular weight 的 SF Symbols。
- 应用与菜单栏品牌标志使用同一个白/黑自适应的单开关 template 轮廓；不使用双开关 `switch.2`。
- 关于页应用图标为 56×56pt，保留系统应用图标表现。

### Distinctive Components

- **Native control row:** 55pt 高，16pt 左边距，24pt 图标槽，10pt 间隔，两级单行文案，64pt 固定尾部控件列。
- **Timed switch menu:** 关闭状态点击深色模式、保持唤醒或专注模式的开关，显示至少 154pt 宽的原生 `NSMenu`；“不定时”前有系统分隔项。
- **Scrollable control viewport:** 0–8 项时窗口随行数收缩；超过 8 项后只让中段 `NSScrollView` 滚动，头尾保持固定。
- **Customisation table:** mini checkbox 表示是否显示，SF Symbol + 名称居中于 34pt 行，拖动手柄在尾部；搜索时禁止排序。
- **Shortcut row:** 录制按钮最小宽 72pt；只有已有快捷键时才把清除按钮加入布局。
- **About updater:** 更新按钮按 idle/checking/available/downloading/installing/restarting 切换文案与 enabled 状态，状态说明仅在有内容时占位。

## 6. Layout Principles

### Spacing System

- Base unit: 2pt；主要布局节奏为 8pt/10pt/16pt/20pt。
- Repeated spacing values: 1pt, 6pt, 8pt, 10pt, 14pt, 16pt, 20pt。
- 主面板中的固定几何值是交互契约，不应为了视觉微调随意改动。

### Grid & Container

- **Main popover:** 固定 360pt 宽；高度 = 58pt header + 1pt separator + `min(rowCount, 8) × 55pt` + 1pt separator + 58pt footer。
- **Row grid:** 16pt inset → 24pt icon → 10pt gap → flexible copy → ≥10pt gap → 64pt control column → 16pt inset。
- **Settings:** 所有 pane 400pt 内容宽。通用 144pt 高，自定义/快捷键 420pt 高，关于 244pt 高。
- **Settings lists:** 20pt 顶部说明/搜索区域水平边距；表格本身横向铺满窗口以保留原生 inset 风格。
- **Secondary flows:** 继续使用主面板内容宽度与头/尾层级，不创建第二套浮窗视觉。

### Whitespace Philosophy

- 留白服务扫描和触达，不追求营销页面式的大面积空白。
- 标题、列表、底栏是三个稳定区块；滚动只影响列表。
- 右侧控件列必须保持视觉直线，长文案宁可截断也不能推动控件。
- 设置页 pane 根据内容改变高度，但宽度和顶部 toolbar 不跳变。

### Border Radius Scale

- Micro: 控件内部圆角由 AppKit 控件样式决定；Web preview 为 7px。
- Standard: rounded button/accessory bar action 使用系统 radius；Web preview 为 10px。
- Large: 主面板与设置窗口使用系统窗口圆角；Web preview 为 18px。
- Pill: `NSSwitch` 轨道的系统胶囊形状；Web preview 为 999px。
- Web preview only: 7px tray、9px mark/select、10px footer button、17–18px windows、24px demo stage。

## 7. Depth & Elevation

| Level | Treatment | Use |
| --- | --- | --- |
| Flat | 无自定义背景、边框或阴影 | 控制行、设置表格行、普通标签 |
| Separator | AppKit `NSBoxSeparator` | 主面板两个组间边界 |
| Material | Regular Glass / Popover Visual Effect | 主控制面板 |
| Window | 系统窗口阴影与标准 toolbar | 设置窗口 |
| Menu | 原生 `NSMenu` 层级 | 定时时长选择 |
| Focus | 系统 focus ring | 键盘导航和输入控件 |

### Depth Principles

- **Surface hierarchy:** 状态项 → 主面板 → 临时原生菜单；设置窗口是独立的长期任务表面。
- **Shadow language:** 只使用窗口级系统阴影，不对行、图标或表单卡片逐层加阴影。
- **Blur, glass, or overlay behavior:** 仅窗口根表面使用系统玻璃/视觉材质；内容视图透明。
- **When depth is used versus avoided:** 深度区分窗口与系统菜单，不区分同一列表中的功能优先级。

## 8. Do's and Don'ts

### Do

- 使用 AppKit 语义颜色、系统字体、SF Symbols、原生控件和公开的系统视觉能力。
- 保持 360pt 主面板、55pt 行、固定右侧控件列以及头尾不滚动的结构。
- 在浅色、深色、不同系统强调色、增强对比度和多显示器菜单栏上验证。
- 让状态文案清楚区分已开启、已关闭、未知、不可用、处理中、完成和错误。
- 同时维护简体中文与 English，并让动词直接描述行为。
- 复用现有原生控件实例更新状态，保留 AppKit 动画连续性。

### Don't

- 不把 Web 预览的青柠 `#C8F542`、黑色背景、固定透明度、模糊或 glow 移植到 AppKit。
- 不使用自绘 `CALayer`/CSS/图片模拟系统圆角、边框、箭头、阴影或开合动画。
- 不用 `NSPopover` 或伪造 popover 箭头；主表面是无箭头 `NSPanel`。
- 不给每一行加分割线、卡片背景、badge 或额外状态装饰。
- 不用 Semibold/Bold 或更大字号代替合理的空间与语义色层级。
- 不让隐藏控件继续占位，不让按钮侵入文案区，不把底栏改成自动均分布局。
- 不在关于页加入产品介绍、权限说明或其他非身份内容。
- 不把“未知”显示成“关闭”，也不为一次性动作增加二次确认。

## 9. Responsive Behavior

OneTouch 是 macOS 桌面工具，原生窗口使用 pt 级固定布局而非常规网页断点。这里的“响应式”主要指内容数量、系统外观、屏幕可用区域和 Web 回退。

### Breakpoints

| Name | Width | Key Changes |
| --- | --- | --- |
| Native popover | 360pt | 宽度固定；根据状态项真实坐标定位并限制在当前屏幕 `visibleFrame` 内 |
| Native settings | 400pt content | 宽度固定；pane 切换时仅高度在 144/420/244pt 间动画 |
| Web compact | ≤640px | demo stage 铺满视口、隐藏次要菜单栏文字、popover 保留约 12px 外边距、行高约 62px |
| Web desktop | >640px | 1180px 最大 demo stage、360px popover、930×654px 设置预览窗口 |

### Touch Targets

- 原生底栏图标按钮布局槽为 44×32pt，控制行本身 55pt 高；开关由系统提供命中区域。
- Web compact 将开关增至约 44×26px，并保持 55–62px 行高。
- 键盘、VoiceOver 和鼠标是同等重要的输入路径；长按能力必须同时有右键/Context Menu 键路径。

### Collapsing Strategy

- **Desktop behavior:** 主面板固定 360pt，靠状态项锚定；设置窗口固定 400pt 内容宽。
- **Content growth:** 超过 8 个控制项后只滚动列表；header/footer 不折叠、不消失。
- **Small screen behavior:** 原生面板保持尺寸，但通过 `visibleFrame` 约束位置；不要按网页方式重排控件列。
- **Web mobile behavior:** 隐藏模拟菜单栏的非必要文字，面板接近全宽，文本继续单行截断。
- **Breakpoint-driven component changes:** 只发生在浏览器回退；AppKit 控件尺寸由系统和明确常量控制。
- **Touch target and spacing adjustments:** Web compact 可增大行高和开关；原生保持系统控件标准。

## 10. Agent Prompt Guide

### Quick Color Reference

- Primary CTA: 原生使用当前 `NSColor.controlAccentColor`；Web 设计板参考 `#C8F542`。
- Background: untinted Regular Glass / Popover Visual Effect；Web 设计板 `#09090B`。
- Elevated surface: 系统动态材质；Web 设计板 `#121216`。
- Heading text: `NSColor.labelColor`；Web 设计板 `#F5F5F5`。
- Body text: `NSColor.secondaryLabelColor`；Web 设计板 `#8D8D95`。
- Ring / border: 系统 separator / focus ring；Web 设计板 `#2B2B30`。
- Accent / focus: 用户的系统强调色；Web 设计板 `#C8F542`。

### Quick Summary

为 OneTouch 设计时，把它当作 macOS 菜单栏的原生控制表面，而不是品牌 Dashboard。使用 360pt 无箭头 `NSPanel`、系统玻璃或 popover 材质、系统字体、SF Symbols、语义色和原生控件。每个 55pt 控制行固定为图标、两级文案和右侧控件列；最多 8 行，更多内容仅滚动中段。品牌标志保持 template 中性，功能状态使用用户的系统强调色。设置页使用 400pt 宽的原生 Preference toolbar 和紧凑列表。Web 的青柠玻璃视觉只用于预览。

### Example Component Prompts

- **Main panel:** “实现 OneTouch 的 macOS 原生菜单栏面板：360pt 无箭头 NSPanel，macOS 26 使用未染色 Regular Glass，旧系统使用 Popover Visual Effect；58pt 标题、最多 8×55pt 控制行、58pt 底栏，只在三块区域之间使用两个 NSBoxSeparator。”
- **Control row:** “创建 55pt 高 AppKit 控制行：16pt 左边距、24pt SF Symbol、10pt 间隔、Regular 系统标题和 small system status、64pt 固定右侧列；持续状态与一次性动作都使用 small NSSwitch。”
- **Settings:** “创建 400pt 内容宽的 macOS Preference window，使用 NSTabViewController toolbar，pane 为通用/自定义/快捷键/关于，保留原生图标标签、选中态、hover、窗口标题和按内容变化的高度。”
- **Footer:** “在主面板底部放三个 AppKit accessory-bar action：设置 44pt 靠左、自定义弹性居中、退出 44pt 靠右，高 32pt、间隔 8pt，默认透明并只在鼠标进入时显示系统 bezel。”
- **Web preview:** “只为浏览器演示创建深色 macOS 场景，使用 #09090B 画布、rgba(18,18,22,.72) 玻璃和 #C8F542 强调色；明确标注它不是原生视觉 token。”

### Ready-to-Use Prompt

请在 OneTouch 现有架构内实现一个新控制能力。macOS 原生界面优先使用 AppKit 系统材质、语义色、系统字体、SF Symbol 和标准控件；保持 360pt 主面板、55pt 行高、64pt 右侧控制列、最多 8 行后只滚动中段，以及固定的设置/自定义/退出底栏。同步 React 状态模型、nativeBridge、Rust/Tauri 命令和 Objective-C helper，补齐简体中文与 English、浏览器安全回退、不可用/未知/权限/处理中状态和对应测试。不要把 Web 预览的固定颜色或玻璃参数带入原生界面。

### Iteration Guide

1. 先确认改动属于状态语义、布局还是新的系统能力；能不新增视觉语言就不新增。
2. 用原生组件完成主路径，再为 Web/非 macOS 写语义等价的回退。
3. 检查固定控件列、8 行滚动、窗口锚点和中英文截断。
4. 在浅/深模式、不同强调色、成功/未知/不可用/错误状态下复核。
5. 最后才微调 Web 预览，并保持其 token 与 AppKit 规范隔离。

## Optional Appendix: Interaction Patterns

- **Open/close:** 点击状态项切换面板；面板水平居中贴合菜单栏下沿。外部点击或 Esc 关闭，打开原生菜单时不误关。
- **Window motion:** 主面板使用 `NSWindowAnimationBehaviorUtilityWindow`；设置使用 document-window 动效。不开发表面级自定义开合动画。
- **Toggle:** 状态变更复用同一个 `NSSwitch` 并通过 animator 更新，避免 thumb 跳变或玻璃层重建。
- **Timed control:** 关闭状态点击开关直接出现时长菜单；取消菜单时开关恢复关闭。
- **One-time action:** 开关在处理期间开启并锁定，至少提供清晰进度；完成后关闭并短暂展示结果。
- **Long press:** 推出磁盘等二级操作在 Web 回退使用约 480ms 长按，并提供右键和键盘上下文菜单替代。
- **Reorder:** 自定义列表支持鼠标拖动和键盘上下箭头；搜索过滤时不允许拖动以避免排序歧义。
- **Reduced motion:** Web 回退尊重 `prefers-reduced-motion`，禁用或缩短排序/过渡动画。

## Optional Appendix: Content & Messaging Patterns

- **Headline pattern:** 名词或功能名，不写营销口号，如“OneTouch / 快捷控制”。
- **Control title:** 短名词短语，如“保持唤醒”“清空废纸篓”“屏幕分辨率”。
- **Status line:** 说明当前状态、结果或下一步，优先 6–16 个中文字；不重复标题。
- **Action labels:** 使用直接动词，如“打开”“选择”“录制”“重试”“下载并安装”。
- **Error voice:** 冷静、具体、可恢复；指出所需权限或不支持原因，不责怪用户。
- **Bilingual tone:** 中文自然简洁，英文同样直接；不要逐字翻译造成冗长。

## Optional Appendix: Observed Pages

- **Native main panel (`src-tauri/src/macos_helper.m`):** 材质、尺寸、控件、语义色、窗口行为和主布局的最高证据。
- **Native settings (`src-tauri/src/macos_helper.m`):** Preference toolbar、400pt pane、表单、列表、快捷键和关于页规则。
- **Browser preview (`http://127.0.0.1:1420/`):** 在 1440×1000 和 390×844 视口观察了 DOM、computed styles、控制列表、设置页与 compact 布局。
- **README and tests:** 长期产品约束、可访问行为与布局常量的回归契约。

## Optional Appendix: Evidence Notes

- **Observed:** 原生主面板宽 360pt；header/footer 各 58pt；行高 55pt；左右 inset 16pt；尾部控制列 64pt；可见容量 8。
- **Observed:** 设置内容宽 400pt，pane 高度 144/420/244pt，水平 inset 20pt，列表行高 34pt，快捷键按钮最小宽 72pt。
- **Observed:** macOS 26 使用 untinted Regular Glass，旧系统使用 Popover Visual Effect；品牌 template image 不指定 tint。
- **Observed:** Web 桌面预览主面板约 360px，compact 预览约 366px；Web 根 token 包含 `#C8F542`、`#141417`、`#0D0D0F` 和 250ms cubic-bezier 过渡。
- **Inferred:** OneTouch 的长期识别度应来自“系统原生程度 + 固定高效布局 + 单开关标志”，而不是一套固定品牌色板。
- **Evidence gap:** 浏览器自动化无法读取真实 AppKit 的系统动态颜色像素；浅色/深色、强调色、增强对比度和真实 Liquid Glass 仍需在原生构建中人工验证。
