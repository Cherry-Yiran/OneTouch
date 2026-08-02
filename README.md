# OneTouch

OneTouch 是一款 macOS 菜单栏快捷控制工具，把常用系统开关集中到一个轻量弹窗中。主浮窗使用 AppKit 原生 `NSPanel`、`NSVisualEffectView`、`NSSwitch`、`NSButton` 和 `NSMenu`；设置与状态控制层使用 React、Tauri 2、Rust 和 Objective-C，支持简体中文与 English。

## 功能

- 控制项选择不设数量上限，并支持实时拖动排序；主面板超过 8 项后保持固定高度并使用原生滚动
- 应用内直接选择和切换屏幕分辨率
- 深色模式、保持唤醒、专注模式定时关闭
- 隐藏桌面图标、桌面小组件、Dock 和 Finder 隐藏文件
- 台前调度、Night Shift、原彩显示、低电量与高能耗模式
- 通用蓝牙耳机连接与电量信息
- Music 与 Spotify 播放控制
- 麦克风静音、屏幕清洁、键盘清洁与锁屏
- 清理 Xcode 缓存、清空废纸篓与剪贴板
- 推出外置物理磁盘，并支持磁盘保护名单
- 登录时启动
- 为任意控制项录制全局快捷键

持续状态和一次性操作都使用系统 `NSSwitch`；一次性操作只在处理期间保持开启，完成后自动关闭。定时控制在点击关闭状态的开关后直接显示 macOS 原生时长菜单。

## 界面长期规则

- 凡 macOS 已提供对应能力的表面、材质、颜色、控件和动效，必须直接使用 AppKit 的原生组件与语义参数；不得额外叠加硬编码 RGB、透明度或自定义模糊强度。只有系统没有对应能力时，才允许经过明确评审后引入自定义视觉参数。
- 主浮窗必须使用标准 `NSPanel`；macOS 26 及以上使用 `NSGlassEffectViewStyleRegular` 的原生动态玻璃，保持 `tintColor = nil`，旧系统才回退到 `NSVisualEffectMaterialPopover`。产品明确不使用带箭头的 `NSPopover`，也不叠加旧模糊层、自绘颜色或自定义模糊强度。
- 原生按钮的 hover、按下、非活跃与深浅色状态必须交给 `NSButton`；底栏的设置、自定义和退出按钮都使用 `showsBorderOnlyWhileMouseInside`，默认透明、悬停时才由 AppKit 显示系统背景，不得自行监听鼠标并绘制边框、底色或透明度。
- 主浮窗使用 macOS 系统字体：功能标题使用 `systemFontSize`，次级说明使用 `smallSystemFontSize`，两者保持 `Regular`，品牌标题最多使用 `Medium`；不得固定放大列表文字，也不得用 `Semibold` 或 `Bold` 代替字号、间距与颜色层级。
- 主浮窗每一行都保留固定的右侧控件列；系统开关、操作按钮和加载状态不得挤入文案区域，所有可操作控件统一右对齐。
- 底部导航始终保持“设置靠左、自定义正中、电源靠右”，不得使用会根据内容重新聚拢的自动均分布局。
- 行高、左右留白和按钮点击区域使用统一尺寸；优先采用 AppKit 原生控件，不用额外角标或另一套交互样式表达同一状态。
- macOS 设置页必须使用原生 `NSWindow`、`NSTabViewController`、`NSPopUpButton`、`NSSwitch` 和 `NSTableView`；WebView 设置页只作为非 macOS 与浏览器预览回退。迁移或调整原生设置界面时必须兼容既有语言、登录启动、无限控制项选择、超过 8 项后的主面板原生滚动、拖动排序、全局快捷键和本机持久化数据。
- 菜单栏图标固定为一个白色单开关模板图标，不提供图标类型选择，不使用 `switch.2` 的双开关符号。
- 设置页的表单使用 `NSGridView` 对齐标签与控件；长列表使用 `NSTableViewStyleInset`、原生 `NSSearchField` 和 mini `NSSwitch`。不要用重复说明文案、人造卡片颜色或自定义阴影代替系统层级。
- 设置页顶部显示由 AppKit 标题栏绘制的当前页面标题；标题必须与当前标签同步为“通用、自定义、快捷键、关于”，不得用额外文本视图模拟标题。
- 设置页工具栏使用 AppKit 专为设置窗口提供的 `NSWindowToolbarStylePreference`，并保留 `NSTabViewController` 自动生成的原生图标、标签、系统强调色选中态和系统 hover；不得通过 `NSToolbarItem.view` 替换成自定义按钮。
- 主面板品牌开关标志固定使用白色；功能状态、系统开关与设置页原生选中态继续使用系统强调色，不得因品牌标志覆盖整个应用的强调色。
- 设置窗口四个页面统一使用 400pt 内容宽度，并共用紧凑的 20pt 内容边距与 34pt 列表行高；不得因页面切换改变宽度，也不得重新引入大面积无效左右留白。快捷键录制按钮只保留满足原生标题和点击区域所需的最小宽度，不得拉成长条。
- 隐藏的按钮不得继续参与布局或占据间距；可选附件只在实际显示时加入原生布局，主按钮始终对齐统一的右侧控制列。
- “关于”页只保留应用图标、产品名、版本号和一个 GitHub 原生跳转按钮；仓库 URL 未提供时按钮保持禁用，产品介绍、权限说明等非身份信息不得占用该页面。
- 主控制浮窗必须读取 `NSStatusItem.button` 的真实屏幕坐标，以按钮中点为锚点水平居中，并直接贴合菜单栏下沿；不得额外添加间隙，也不得使用右上角、主屏幕中心等猜测坐标。
- 主控制浮窗不显示箭头，也不得用 CSS、CALayer 或图片伪造尖角、圆角、边框、背景、模糊、阴影和开合动画；这些视觉行为统一使用 `NSPanel`、`NSVisualEffectView` 和 `NSWindowAnimationBehaviorUtilityWindow` 的公开系统能力。
- 主面板只在“标题与控制列表”“控制列表与底部操作区”两个分组边界使用 AppKit 原生 `NSBoxSeparator`；控制行之间不加分割线，也不得用自绘颜色、CSS 边框或 CALayer 模拟系统分割线。

## 开发环境

- macOS 13 或更高版本
- Node.js 与 pnpm
- Rust stable toolchain
- Tauri 2 所需的 Apple Command Line Tools

## Apple 官方组件来源

主浮窗与设置页只组合 Apple 公开的 AppKit 组件，不复刻“天气”私有界面：

- [`NSPanel`](https://developer.apple.com/documentation/appkit/nspanel)：无箭头主浮窗外壳、窗口层级、焦点、阴影和开合行为
- [`NSGlassEffectView`](https://developer.apple.com/documentation/appkit/nsglasseffectview)：macOS 26 及以上使用标准 Regular 动态玻璃，不添加色彩
- [`NSVisualEffectView`](https://developer.apple.com/documentation/appkit/nsvisualeffectview)：旧系统通过公开的 `NSVisualEffectMaterialPopover` 回退
- [`NSSwitch`](https://developer.apple.com/documentation/appkit/nsswitch)：所有开关
- [`NSButton`](https://developer.apple.com/documentation/appkit/nsbutton)：操作与底部导航按钮
- [`NSMenu`](https://developer.apple.com/documentation/appkit/nsmenu)：保持唤醒等时长选择菜单
- [`NSTextField`](https://developer.apple.com/documentation/appkit/nstextfield)：标题与状态文字
- [`NSStackView`](https://developer.apple.com/documentation/appkit/nsstackview)：主浮窗内容排列
- [`NSImage`](https://developer.apple.com/documentation/appkit/nsimage)：通过 `imageWithSystemSymbolName:` 使用 SF Symbols
- [`NSTabViewController`](https://developer.apple.com/documentation/appkit/nstabviewcontroller)、[`NSPopUpButton`](https://developer.apple.com/documentation/appkit/nspopupbutton)、[`NSTableView`](https://developer.apple.com/documentation/appkit/nstableview)：原生设置页

Apple 的 [Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass) 明确建议使用标准 SwiftUI、UIKit 或 AppKit 组件，让界面在最新系统上自动获得最新外观；因此 OneTouch 不手工模拟 Liquid Glass 参数。

安装依赖：

```bash
pnpm install
```

启动浏览器预览：

```bash
pnpm dev
```

启动原生开发模式：

```bash
pnpm native:dev
```

运行测试：

```bash
pnpm test:ui
cargo test --manifest-path src-tauri/Cargo.toml
```

构建 macOS 应用：

```bash
pnpm native:build
```

构建产物位于：

```text
src-tauri/target/release/bundle/macos/OneTouch.app
```

## 使用说明

OneTouch 是菜单栏应用，不显示 Dock 图标。点击顶部菜单栏中会随系统外观自动变色的开关图标打开控制面板：

- 短按开关立即切换或执行
- 点击深色模式、保持唤醒或专注模式的关闭状态开关，会打开 macOS 原生时长菜单
- “推出磁盘”支持外接物理磁盘和已挂载的 DMG；长按可设置受保护的磁盘
- “键盘清洁”会忽略普通键、修饰键、功能键和媒体键；用鼠标从菜单关闭
- 在“偏好设置 → 自定义”中选择和排序控制项
- 在“偏好设置 → 快捷键”中录制全局快捷键

macOS 只会在具体功能确实需要时请求自动化、辅助功能、蓝牙或专注状态权限。不支持的硬件能力和未安装的应用会直接显示为不可用，不会跳转到无关设置页面。

## 分发说明

仓库中的 Tauri 配置使用本机开发签名身份。其他开发者构建时可以在 `src-tauri/tauri.conf.json` 中移除或替换 `bundle.macOS.signingIdentity`。正式对外分发仍需要 Apple Developer ID 签名与公证。

## 技术栈

- React + Vite
- Tauri 2
- Rust
- Objective-C / AppKit / Core Graphics / IOBluetooth
- dnd-kit
- Lucide
