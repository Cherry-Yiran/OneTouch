# OneTouch 项目约束

本文件适用于整个仓库。修改 OneTouch 前必须先阅读并遵守以下规则。

## 产品形态是不变量

- OneTouch 是纯 macOS 菜单栏应用，不是普通桌面窗口应用。
- 应用启动、登录启动和再次打开正在运行的应用时，只确保进程运行且菜单栏图标可见；不得自动展示主控制面板。
- 主控制面板必须保持原有的、锚定到 `NSStatusItem.button` 的无标题栏 `NSPanel` 形态，只能由用户点击菜单栏图标或明确的快捷键操作打开。
- 禁止增加居中窗口、独立窗口、detached 模式、标题栏、红黄绿按钮、Dock 图标或任何普通窗口兜底。
- 没有有效菜单栏屏幕锚点时，必须修复菜单栏状态项并返回错误；不得用独立窗口替代菜单栏面板。

## 辅助功能授权流程是不变量

- 辅助功能引导只负责申请和确认权限。
- 授权成功后保留短暂成功提示，然后关闭引导并确保菜单栏图标可用。
- 授权成功、引导关闭和 `RunEvent::Reopen` 路径不得调用 `show_popover`、`SBShowNativePopover` 或其他主面板展示函数。
- 不得修改现有权限申请方式、签名/TCC 语义或拖拽引导，除非用户明确要求。

## 菜单栏状态项约束

- 正式应用 bundle ID 固定为 `design.ryan.onetouch.menubar`。旧 ID `design.ryan.onetouch` 在 macOS 26 实机上已出现无法通过 defaults、LaunchServices 注销或 Control Center 重启清除的 scene 状态项布局损坏；不得在没有全新系统对照证据时改回旧 ID。
- 用户配置继续保存在 `design.ryan.switchboard.menubar.v2`，不得因 bundle ID 迁移重置控制项、排序、计时器或其他设置。
- 菜单栏图标“可用”必须以真实屏幕锚点为准，不能只检查 `NSStatusItem`、button 或 window 对象是否存在。
- 必须识别 macOS 把状态项放入屏幕外 holding 区域的情况；对象存在不等于用户可见。
- 状态项恢复不得循环 remove/recreate，不得设置 `autosaveName`，不得强制 `visible = YES` 触发 macOS 26 的隐藏布局问题。
- 禁止重新引入 `_setDropPriority:`、私有 insert priority、system insert order、`neverClip` behavior、`NSSceneStatusItem` 私有初始化或缩窄 item 的反复试错；正式实现只使用公开 `statusItemWithLength:`。
- 不得把状态项位于 holding 区一律归因于辅助功能授权流程或菜单栏物理溢出；必须用旧/新 bundle ID、真实坐标和视觉截图做单变量对照。
- 修复状态项时必须保留图标、按钮 target/action 和点击回调；图标恢复后，下一次点击仍应打开原有锚定面板。
- 任何状态项优先级或私有 API 调整都必须在菜单栏拥挤的同一环境中用实际坐标验证，禁止仅凭 API 返回值或进程存活判断成功。

## 构建与测试约束

- 可用 `cargo test` 做 Rust 测试，但禁止把裸 `cargo build` 或裸 `cargo build --release` 产物当作可交付的 macOS 应用；它可能仍依赖开发服务器并导致空白/卡在“正在读取系统状态”。
- 实机测试包必须通过完整 Tauri production build 生成，并关闭本地 updater artifacts：
  `pnpm exec tauri build --bundles app --config '{"bundle":{"createUpdaterArtifacts":false}}'`
- 交付用户测试前至少运行：
  `pnpm test:ui`
  `cargo test --manifest-path src-tauri/Cargo.toml`
  `pnpm build`
- 修改签名后的测试包可能需要重新授权辅助功能；必须明确区分签名/TCC 重置和应用逻辑故障。
- 禁止同时构建、注册或启动多个使用正式 bundle ID 的 `.app` 副本。诊断包必须使用唯一临时 bundle ID，测试完成后注销；否则会污染 LaunchServices 和 macOS 26 的状态项 scene 记录。

## 必须完成的回归验证

- 首次启动：授权引导正常出现，菜单栏图标存在。
- 拖拽授权成功：短暂成功提示后引导关闭，不自动打开主面板。
- 正常锚点：点击菜单栏图标弹出完整功能面板，点击外部收起。
- 再次打开运行中的应用：只确保菜单栏图标存在，不自动打开面板。
- 已授权启动、关闭后重启、登录启动：只显示菜单栏图标。
- 从旧 bundle ID 迁移：新包首次运行会要求重新授权一次；授权后继续读取原有用户配置，登录启动由用户在新包中重新确认。
- 菜单栏拥挤：OneTouch 状态项的真实坐标必须位于可见菜单栏，不能位于屏幕边角或屏幕外 holding 区域。
- 全程不得出现 Dock 图标、居中控制窗口、标题栏、红黄绿按钮或缺少功能的空面板。

## 防止重复回归的工作方式

- 修复前先复现并记录证据；一次只验证一个原因，不得在没有证据时来回切换实现。
- 每个修复都要同时覆盖：菜单栏图标是否真实可见、面板是否锚定、面板功能是否完整、授权后是否误弹面板。
- 不得把“编译成功”“测试通过”“进程仍在”“状态项对象存在”表述为问题已修好。
- 只有完整 production `.app` 在真实运行环境中通过上述回归验证后，才能告诉用户可以测试或问题已经修复。
- 如果本次改动重新引入历史禁止项，立即停止交付并先撤销该回归。
