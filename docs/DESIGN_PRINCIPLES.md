# OneTouch 产品形态与 macOS 稳定性原则

OneTouch 的完整视觉语言、颜色令牌、字体、材质、组件状态、无障碍规则与素材提示词，统一以仓库根目录的 [`design.md`](../design.md) 为唯一真源。本文件只记录不可被视觉改造改变的产品形态与 macOS 稳定性边界。

## 菜单栏应用形态

- OneTouch 是纯 macOS 菜单栏应用，不是普通桌面窗口应用；不得增加 Dock 图标、居中主窗口、独立控制窗口、标题栏或红黄绿按钮。
- 主控制面板必须保持锚定到 `NSStatusItem.button` 真实屏幕坐标的无标题栏 `NSPanel`，只由菜单栏点击或明确快捷键打开。
- 没有有效菜单栏锚点时，修复状态项并返回错误；不得回退为未锚定窗口。
- 启动、登录启动、再次打开运行中的应用与辅助功能授权成功后，只确保菜单栏图标可见，不自动展示主控制面板。
- 底栏结构固定为“设置靠左、自定义正中、退出靠右”；控制项超过 8 个时保持面板密度并使用原生滚动。

## AppKit 外壳与控件

- 窗口、玻璃外壳、系统开关、菜单、工具栏、搜索、拖拽和快捷键继续直接使用 AppKit 原生组件与语义参数。
- macOS 26 及以上的主面板外壳使用 `NSGlassEffectViewStyleRegular` 并保持 `tintColor = nil`；旧系统回退到 `NSVisualEffectMaterialPopover`。对系统玻璃外壳不额外叠加硬编码 RGB、透明度或自定义模糊强度。
- 主面板只在标题/控制列表、控制列表/底栏两个分组边界使用原生 `NSBoxSeparator`；不以 CSS、图片或 CALayer 伪造系统玻璃外壳。
- 设置页继续使用 `NSWindow`、`NSTabViewController`、`NSPopUpButton`、`NSSwitch`、`NSTableView` 与 `NSSearchField`；WebView 仅作为浏览器与非 macOS 预览回退。
- 原生语义回退中，功能标题使用 `systemFontSize`，次级说明使用 `smallSystemFontSize`，品牌标题最多使用 Medium；Peach Star Magic 内容层的圆体层级以 [`design.md`](../design.md) 为准。
- 菜单栏图标使用随系统外观变化的单枚四角星模板图标；蜜桃星辉徽章只用于主面板标题与关于页，不替换正式应用图标。

## 权限、身份与数据

- 辅助功能引导只负责申请和确认权限；成功提示结束后关闭引导，不调用主面板展示函数。
- 正式 bundle ID 固定为 `design.ryan.onetouch.menubar`；配置域继续使用 `design.ryan.switchboard.menubar.v2`。
- 首次创建新 bundle ID 的 WebView 前，完成旧 WebKit 数据的一次性迁移；视觉改造不得重置语言、控制项、排序、快捷键、计时器或登录启动设置。
- 只使用公开 `statusItemWithLength:`，不重新引入状态项私有 API、排序优先级、`autosaveName` 或循环 remove/recreate。
- 状态项可用性必须以真实可见的屏幕锚点为准；对象存在或进程存活不能替代坐标与视觉验证。

## 回归门槛

- 视觉改造不得更改 React–Rust–Objective-C 的公开模型结构、原生计时器菜单行为或已有系统操作语义。
- 浅色、深色、高对比度、减少透明度和减少动态效果均需可用；具体表现与对比度要求见 [`design.md`](../design.md)。
- 完整 production `.app` 必须验证菜单栏可见、面板真实锚定、点击外部关闭、再次打开不弹面板、授权成功不弹面板，以及全程无 Dock 图标和普通桌面窗口。
