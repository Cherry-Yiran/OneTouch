# Apple 官方组件来源

OneTouch 组合 Apple 公开的 AppKit 组件，不复刻或调用 macOS 自带应用的私有界面。

- [`NSPanel`](https://developer.apple.com/documentation/appkit/nspanel)：主浮窗外壳、窗口层级、焦点、阴影和开合行为
- [`NSGlassEffectView`](https://developer.apple.com/documentation/appkit/nsglasseffectview)：macOS 26 及以上的标准 Regular 动态玻璃
- [`NSVisualEffectView`](https://developer.apple.com/documentation/appkit/nsvisualeffectview)：旧系统的公开 Popover 材质回退
- [`NSSwitch`](https://developer.apple.com/documentation/appkit/nsswitch)：开关控制
- [`NSButton`](https://developer.apple.com/documentation/appkit/nsbutton)：操作与底部导航按钮
- [`NSMenu`](https://developer.apple.com/documentation/appkit/nsmenu)：时长与选项菜单
- [`NSTextField`](https://developer.apple.com/documentation/appkit/nstextfield)：标题与状态文字
- [`NSStackView`](https://developer.apple.com/documentation/appkit/nsstackview)：主浮窗内容排列
- [`NSImage`](https://developer.apple.com/documentation/appkit/nsimage)：SF Symbols
- [`NSTabViewController`](https://developer.apple.com/documentation/appkit/nstabviewcontroller)：设置页标签结构
- [`NSPopUpButton`](https://developer.apple.com/documentation/appkit/nspopupbutton)：原生选项选择
- [`NSTableView`](https://developer.apple.com/documentation/appkit/nstableview)：设置页控制项列表
- [`NSGridView`](https://developer.apple.com/documentation/appkit/nsgridview)：设置页表单对齐
- [`NSSearchField`](https://developer.apple.com/documentation/appkit/nssearchfield)：控制项搜索

Apple 的 [Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass) 建议使用标准 SwiftUI、UIKit 或 AppKit 组件，让界面在新系统上自动获得最新外观。OneTouch 因此不手工模拟 Liquid Glass 参数。
