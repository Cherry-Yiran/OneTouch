# OneTouch

OneTouch 是一款 macOS 菜单栏快捷控制工具，把常用系统开关集中到一个轻量弹窗中。界面使用 React，原生外壳与系统能力使用 Tauri 2、Rust 和 Objective-C 实现，支持简体中文与 English。

## 功能

- 最多选择 8 个控制项，并实时拖动排序
- 应用内直接选择和切换屏幕分辨率
- 深色模式、保持唤醒、专注模式定时关闭
- 隐藏桌面图标、桌面小组件、Dock 和 Finder 隐藏文件
- 台前调度、Night Shift、原彩显示、低电量与高能耗模式
- 通用蓝牙耳机连接与电量信息
- Music 与 Spotify 播放控制
- 麦克风静音、屏幕清洁、键盘锁定与锁屏
- 清理 Xcode 缓存、清空废纸篓与剪贴板
- 推出外置物理磁盘，并支持磁盘保护名单
- 登录时启动
- 为任意控制项录制全局快捷键

一次性操作和持续开关使用统一的开关交互。支持定时或额外设置的项目，可长按或右键同一个开关进入对应面板。

## 开发环境

- macOS 13 或更高版本
- Node.js 与 pnpm
- Rust stable toolchain
- Tauri 2 所需的 Apple Command Line Tools

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

OneTouch 是菜单栏应用，不显示 Dock 图标。点击顶部菜单栏中的白色开关图标打开控制面板：

- 短按开关立即切换或执行
- 长按深色模式、保持唤醒或专注模式开关可设置定时关闭
- 长按“推出外置磁盘”可设置受保护的磁盘
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

