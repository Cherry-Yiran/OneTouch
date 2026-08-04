# OneTouch 界面设计原则

OneTouch 的界面目标是接近 macOS 自带菜单栏组件：克制、原生、稳定，并随系统版本与外观自动更新。

## 原生优先

- 凡 macOS 已提供对应能力的表面、材质、颜色、控件和动效，直接使用 AppKit 原生组件与语义参数，不额外叠加硬编码 RGB、透明度或自定义模糊强度。
- 主浮窗使用标准 `NSPanel`；macOS 26 及以上使用 `NSGlassEffectViewStyleRegular`，保持 `tintColor = nil`；旧系统回退到 `NSVisualEffectMaterialPopover`。
- 产品不使用带箭头的 `NSPopover`，也不叠加旧模糊层、自绘颜色或自定义模糊强度。
- 主控制浮窗不显示箭头，也不使用 CSS、CALayer 或图片伪造尖角、圆角、边框、背景、模糊、阴影和开合动画。
- 主面板只在“标题与控制列表”“控制列表与底部操作区”两个分组边界使用 AppKit 原生 `NSBoxSeparator`；控制行之间不加分割线。

## 控件与交互

- 原生按钮的 hover、按下、非活跃与深浅色状态交给 `NSButton`。底栏按钮使用 `showsBorderOnlyWhileMouseInside`，默认透明，悬停时由 AppKit 显示系统背景。
- 功能标题使用 `systemFontSize`，次级说明使用 `smallSystemFontSize`，两者保持 Regular；品牌标题最多使用 Medium。
- 每一行保留固定的右侧控件列；系统开关、操作按钮和加载状态不得挤入文案区域。
- 行高、左右留白和按钮点击区域使用统一尺寸，不用额外角标或另一套交互表达同一状态。
- 隐藏的按钮不得参与布局或占据间距；可选附件只在显示时加入布局。
- 菜单栏图标固定为一个随系统外观变色的单开关模板图标，不提供图标类型选择，不使用双开关符号。
- 主面板品牌开关标志使用系统标签色；功能状态、系统开关与设置页选中态使用系统强调色。

## 主面板

- 主浮窗读取 `NSStatusItem.button` 的真实屏幕坐标，以按钮中点为锚点水平居中，并贴合菜单栏下沿。
- 启动、登录启动、辅助功能授权成功和再次打开应用只确保菜单栏状态项可用，不自动展示主控制浮窗。
- OneTouch 只使用一个公开 AppKit 状态项，不使用私有 `NSSceneStatusItem` 或菜单栏排序接口。
- 底部导航保持“设置靠左、自定义正中、电源靠右”，不使用根据内容重新聚拢的自动均分布局。
- 控制项超过 8 个时，面板保持固定高度并使用原生滚动。

## 设置窗口

- macOS 设置页使用原生 `NSWindow`、`NSTabViewController`、`NSPopUpButton`、`NSSwitch` 和 `NSTableView`；WebView 只作为非 macOS 与浏览器预览回退。
- 表单使用 `NSGridView` 对齐标签与控件；长列表使用 `NSTableViewStyleInset`、原生 `NSSearchField` 和 mini 选择控件。
- 顶部标题由 AppKit 标题栏绘制，并与“通用、自定义、快捷键、关于”四个标签同步。
- 工具栏使用 `NSWindowToolbarStylePreference` 和 `NSTabViewController` 自动生成的原生图标、标签、系统强调色与 hover 状态。
- 四个页面统一使用 400pt 内容宽度、20pt 内容边距和 34pt 列表行高，不因页面切换改变窗口宽度。
- “关于”页只保留应用图标、产品名、版本号、更新按钮和 GitHub 跳转按钮。

## 兼容与身份

- 原生设置界面的调整必须兼容既有语言、登录启动、控制项选择与排序、超过 8 项后的滚动、全局快捷键和本机持久化数据。
- macOS 26 上使用 `design.ryan.onetouch.menubar` 作为当前 bundle ID，并从旧偏好域 `design.ryan.switchboard.menubar.v2` 读取数据。
- WebKit 数据只在首个 WebView 创建前从旧 bundle ID 迁移一次。新身份首次运行需要重新授予辅助功能权限。
- 没有真实菜单栏锚点时，不把控制界面降级为屏幕中心窗口或普通桌面应用窗口。
