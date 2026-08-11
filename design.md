# Design System: OneTouch — Peach Star Magic / 蜜桃星辉魔法

> 版本：1.0
> 视觉真源：用户提供的粉橙翼形徽章参考图
> 适用范围：OneTouch 原生 AppKit 主面板、二级内容、设置页、关于页，以及 Web 预览
> 非适用范围：菜单栏模板图标、正式应用图标、辅助功能授权引导、普通桌面窗口

## 1. Visual Theme & Atmosphere

Peach Star Magic 是一套“魔法少女变身道具”式的桌面工具视觉系统。它以奶油暖白为底，将草莓粉、蜜桃橙、蛋奶黄叠成柔和糖果渐变，再用珍珠高光、软浮雕、翼形盾徽、星星和小型丝带制造精致的收藏品感。它不是把界面简单染成粉色，也不是动漫角色主题；核心是让高频 macOS 控制像一组制作细腻、可信赖、可以触摸的魔法道具，同时保持工具应用需要的清晰、紧凑和稳定。

视觉密度保持 OneTouch 既有高效菜单结构：装饰集中在标题、图标底座、开关和状态反馈，不把每一行放进独立大卡片，不让翅膀、星星或光晕侵占文案与点击区域。浅色模式像清晨的奶油糖果盒；深色模式像夜间的莓果首饰盒，保留同一材质逻辑，只替换明度、阴影和环境色。

### Key Characteristics

- 奶油暖白底色承载粉、桃、蛋奶黄的低饱和渐变。
- 珍珠高光、双层描边、内阴影和短距离落影组成软 3D 糖果釉面。
- 翼形星徽是唯一大型品牌母题；小星、心形与丝带只作低密度辅助。
- 所有魔法感服务于状态识别：开启更明亮，处理中有柔光，错误仍保持明确红色语义。
- 系统圆体用于品牌与短标签，正文继续使用清晰的系统字体。
- 甜美但不幼儿化，精致但不奢华，活泼但不闪烁。

## 2. Color Palette & Roles

### Core Semantic Tokens

| Role | Semantic Name | Value | Usage |
| --- | --- | --- | --- |
| App background | Cream Veil | `#FFF8F2` | 浅色主背景、预览画布 |
| Primary surface | Pearl Cream | `#FFFDF9` | 主面板内容层、设置页主体 |
| Raised surface | Blush Porcelain | `#FFF1F4` | 控件底座、选中行、胶囊按钮 |
| Primary action | Strawberry Magic | `#F778A5` | 开启态、主操作、焦点环 |
| Secondary accent | Peach Glow | `#FFAA78` | 渐变尾色、完成态辅助色 |
| Star accent | Custard Gold | `#F6C867` | 星徽描边、徽章高光、完成反馈 |
| Heading text | Cocoa Rose | `#573846` | 浅色标题与高强调文字 |
| Body text | Mulberry Ink | `#745563` | 浅色正文 |
| Muted text | Dusty Mauve | `#A2808D` | 描述、提示、次级标签 |
| Hairline | Sugar Edge | `#F2CCD5` | 浅色分组描边与分隔 |
| Night background | Berry Midnight | `#241A35` | 深色主背景 |
| Night surface | Grape Velvet | `#332442` | 深色主面板内容层 |
| Night raised surface | Plum Candy | `#49304F` | 深色控件底座与选中行 |
| Night primary | Moonlit Pink | `#FF84B1` | 深色开启态与焦点环 |
| Night secondary | Lavender Wish | `#C8B2FF` | 深色图标与辅助高光 |
| Night text | Moon Cream | `#FFF2F7` | 深色标题与正文 |
| Error | Rose Alarm | `#D94763` | 错误文字、错误描边 |
| Success | Apricot Star | `#E89A48` | 完成状态、短暂确认反馈 |

### Primary

- **Strawberry Magic `#F778A5`**：所有可交互主状态的核心色；不得用于大面积背景。
- **Peach Glow `#FFAA78`**：只与 Strawberry Magic 组成方向明确的渐变，不独立承担危险或错误语义。
- **Custard Gold `#F6C867`**：星星、徽章边缘和完成态的点睛色；一个视图内高亮面积不超过 8%。

### Interactive

- 主渐变：`linear-gradient(145deg, #FFB6CB 0%, #F778A5 48%, #FFAA78 100%)`。
- 浅色 hover：背景从 `#FFF1F4` 提升到 `#FFE8EF`，描边切换为 `rgba(247,120,165,.42)`。
- 深色 hover：背景从 `#49304F` 提升到 `#57365A`，描边切换为 `rgba(255,132,177,.48)`。
- 键盘焦点：2px Strawberry Magic / Moonlit Pink 实线环，外扩 2px；不能只依赖阴影。
- 按下态：整体缩放到 `0.98`，高光减弱 35%，落影距离缩短一半。
- 错误态不改用粉色表达，固定使用 Rose Alarm，并保留清晰错误文字。

### Neutral Scale

- 浅色高强调：Cocoa Rose `#573846`。
- 浅色正文：Mulberry Ink `#745563`。
- 浅色弱文字：Dusty Mauve `#A2808D`。
- 深色高强调：Moon Cream `#FFF2F7`。
- 深色正文：`#E7D5E3`。
- 深色弱文字：`#B99FB4`。

### Surface & Overlay

- **Light base:** `linear-gradient(155deg, rgba(255,253,249,.98), rgba(255,238,243,.94))`。
- **Light raised:** `linear-gradient(145deg, #FFFDF9 0%, #FFF0F4 58%, #FFE1D5 100%)`。
- **Dark base:** `linear-gradient(155deg, rgba(51,36,66,.97), rgba(36,26,53,.96))`。
- **Dark raised:** `linear-gradient(145deg, #583859 0%, #49304F 56%, #392842 100%)`。
- **Glass wash:** 系统玻璃仍由 AppKit 提供；主题内容层最多叠加 88% 不透明度，不能伪造窗口外壳。

### Theme Modes

#### Light Mode — Cream Sunrise

- Background: Cream Veil `#FFF8F2`。
- Surface: Pearl Cream `#FFFDF9`。
- Text: Cocoa Rose `#573846` / Mulberry Ink `#745563`。
- Accent: Strawberry Magic `#F778A5` → Peach Glow `#FFAA78`。
- Border: Sugar Edge `#F2CCD5`。
- Notes: 高光接近纯白，阴影带淡玫瑰色而非灰黑色。

#### Dark Mode — Berry Moonlight

- Background: Berry Midnight `#241A35`。
- Surface: Grape Velvet `#332442`。
- Text: Moon Cream `#FFF2F7` / `#E7D5E3`。
- Accent: Moonlit Pink `#FF84B1` → Lavender Wish `#C8B2FF`。
- Border: `rgba(255,210,230,.22)`。
- Notes: 不做黑色版浅色主题；深色仍保留莓果、月光和糖果材质，金色点缀降低约 12% 亮度。

### Shadows & Depth

- **Sugar ring:** `0 0 0 1px rgba(255,255,255,.72) inset, 0 0 0 1px rgba(231,125,160,.26)`。
- **Candy card:** `0 1px 0 rgba(255,255,255,.82) inset, 0 8px 22px rgba(178,92,124,.16)`。
- **Night candy card:** `0 1px 0 rgba(255,255,255,.20) inset, 0 10px 28px rgba(13,7,24,.36)`。
- **Active glow:** `0 0 18px rgba(247,120,165,.28)`；深色使用 `rgba(255,132,177,.34)`。
- **Focus treatment:** 2px 实线焦点环优先于光晕；高对比度模式提升到 3px。

## 3. Typography Rules

### Font Family

- **Primary:** macOS system font；品牌标题、标签和数字优先使用 `NSFontDescriptorSystemDesignRounded` / CSS `ui-rounded`。
- **Chinese fallback:** `PingFang SC`，不得为追求圆润而替换成可读性较差的展示字体。
- **Monospace:** `SFMono-Regular`，只用于快捷键和技术值。
- **OpenType Features:** 数字状态启用 tabular numbers；正文保持系统默认字距。

### Hierarchy

| Role | Font | Size | Weight | Line Height | Letter Spacing | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Brand title | System Rounded | 15px | 650 | 19px | `-0.01em` | OneTouch 标题，最多一行 |
| Panel heading | System Rounded | 14px | 600 | 18px | `-0.005em` | 二级面板和设置页短标题 |
| Row title | System / PingFang SC | 13px | 500 | 17px | `0` | 控制名称，必须清晰克制 |
| Body | System / PingFang SC | 12px | 400 | 17px | `0` | 设置说明和空状态 |
| Caption / status | System / PingFang SC | 10.5px | 400 | 13px | `0.005em` | 控制状态与辅助说明 |
| Button label | System Rounded | 11.5px | 600 | 15px | `0.005em` | 短操作标签 |
| Shortcut | SF Mono | 11px | 500 | 15px | `0` | 快捷键录制与展示 |

### Principles

- 圆体只增加亲和力，不用超粗、描边字或糖果立体字替代真实 UI 文本。
- 同一行最多两级信息；标题与状态之间保持 1–2px 视觉间距。
- 中文说明不得低于 10.5px；文本与背景的普通字号对比度目标至少 4.5:1。
- 所有文字必须由真实文本控件或 DOM 渲染，禁止将文案生成进图片，禁止文字位图。

## 4. Component Stylings

### Buttons and Links

- **Primary CTA:** 32–36px 高，12px 圆角，粉桃渐变与白色高对比文字；只用于真正的提交、确认或正在处理状态。
- **Secondary CTA / utility action:** “录制”“检查更新”等常态工具操作固定使用白色/深莓果表面、1px Sugar Edge 与 Cocoa Rose / Moonlit Pink 文字；hover 变为极浅粉底与粉色描边，禁止回到系统灰或蓝色。
- **Icon button:** 最小 36×36px 点击区域，内部 18px SF Symbol；默认透明，hover/焦点才出现糖果底座。
- **Text links:** 使用 Strawberry Magic / Moonlit Pink，不加永久下划线；键盘焦点必须可见。
- **Hover and active feel:** hover 上浮 1px；按下回落并缩放到 0.98；过渡 160ms。

### Cards and Containers

- **Surface style:** 不透明奶油或莓果内容层覆盖在系统玻璃内；只在分组需要时使用轻量 raised surface。
- **Radius:** 主面板由系统窗口控制；内部组 16px，重点徽章 20–28px，行级底座 10–12px。
- **Border:** 双层糖边只给标题徽章、激活控件与高层容器；普通列表不逐行画完整边框。
- **Shadow or elevation:** 垂直距离不超过 10px，模糊不超过 28px；阴影带粉/紫环境色。
- **Internal spacing:** 8、12、16、20px 为主；标题区允许 24px。

### Inputs and Interactive Controls

- **Toggle:** 44×26px；关闭为珍珠奶油轨道，开启为粉桃或粉紫渐变；20px 珍珠旋钮带顶部高光。
- **Action switch:** 继续使用现有 momentary 语义；处理中旋钮显示低速光泽旋转，完成后短暂出现金色星光。
- **Search field / select:** 统一 28pt 高、12px 圆角；浅色固定白色输入表面，深色使用深莓果输入表面。搜索图标使用 Dusty Mauve / Lavender Wish；表单 label 与输入控件按垂直中心线对齐。
- **Checkbox:** 18px 可视方块置于至少 32×34px 点击区；选中时使用粉色底与奶油勾，不使用 Emoji。
- **Focus behavior:** 所有交互控件均显示真实焦点环；鼠标 hover 不能替代键盘焦点。
- **Selection states:** 选中行使用从粉色 14% 到透明的水平渐变，并在左侧加入 2px 金粉高光。

### Navigation

- 主面板底部固定“设置 / 自定义 / 退出”的左右结构，不重新均分或聚拢。
- 设置页继续使用原生工具栏标签，选中项加入小型粉色光晕和圆润底座。
- 二级内容在同一锚定面板中进入；返回操作保持左上优先，不创建 detached 窗口。

### Image Treatment

- 翼形星徽必须是无文字透明 PNG，轮廓清晰、内部可有柔和高光与浮雕。
- 标题区显示尺寸 40–46pt；关于页显示 56–72pt；不能放大到看见插值边缘。
- 浅色与深色素材必须保持相同轮廓、构图和安全边距，只改变色彩与光照。
- 图片不得包含角色、脸、数字、品牌字样、背景卡片、投射到背景的阴影或水印；明确禁止水印。

### Distinctive Components

- **Winged Star Crest:** 翼形盾徽，中心为四角星与抽象单开关种子形，不出现数字或文字。
- **Candy Icon Medallion:** 28×28px 圆润底座承载 16px SF Symbol；激活态由粉桃渐变和细金边组成。
- **Magic Status Glow:** 只在开启、处理中或刚完成时出现，不能永久让整行发光。
- **Ribbon Footer:** 底栏像一条克制的奶油丝带，用三枚胶囊动作构成，不绘制实体蝴蝶结。

## 5. Layout Principles

### Spacing System

- **Base unit:** 4px。
- **Repeated spacing values:** 4px、8px、12px、16px、20px、24px、32px。
- 360pt 主面板保持 16pt 左右内容边距；图标、文案、控件列间距分别为 10pt、弹性空间、10pt。
- 8 个可见控制项仍是默认容量；超出后滚动，不压缩行高。

### Grid & Container

- 主面板宽度固定 360pt，锚定到 `NSStatusItem.button` 的真实屏幕坐标。
- 控制行沿用图标 / 文案 / 控件三列结构，右侧控制列固定，不侵入文字。
- 设置页继续使用 400pt 内容宽度与原生工具栏；列表页保留滚动和搜索。
- Web 预览只模拟真实产品，不改变生产界面的窗口模型。

### Whitespace Philosophy

- 装饰周围需要呼吸空间，但工具列表不能因“可爱”而松散到降低扫描效率。
- 大型图形只允许出现在标题区与关于页；列表内部只使用小型徽章。
- 空白用于建立层级，不用额外卡片、角标或贴纸填满空间。

### Border Radius Scale

- **Micro:** 8px，用于小标签、快捷键和紧凑反馈。
- **Standard:** 12px，用于按钮、搜索框、开关视觉轨道与行内底座。
- **Grouped:** 16px，用于设置分组和二级列表容器。
- **Large:** 20px，用于主面板内容组、标题徽章容器。
- **Hero:** 28px，用于关于页徽章或大尺寸插画容器。
- **Pill:** 999px，只用于胶囊按钮、状态点和真实 pill 控件。

## 6. Depth & Elevation

| Level | Treatment | Use |
| --- | --- | --- |
| Flat | 无阴影，最多 1px 低对比描边 | 普通文字、未激活列表行 |
| Sugar ring | 双层白色高光与粉色细描边 | 图标底座、开关、搜索框 |
| Candy card | 顶部内高光 + 8–22px 粉色环境阴影 | 标题徽章、设置分组 |
| Floating candy | 1px 内高光 + 10–28px 紫色阴影 | 深色主题高层容器 |
| Focus | 2px 实线粉色环 + 2px 外扩 | 键盘焦点，不与 hover 混淆 |

### Depth Principles

- **Surface hierarchy:** 系统玻璃是窗口外壳，奶油/莓果主题层是内容底，糖果底座是交互层，星徽是品牌最高层。
- **Shadow language:** 阴影短、软、带环境色；禁止大面积黑色投影和悬浮卡片海洋。
- **Blur and glass:** 不重新实现窗口模糊，不给行级元素添加 backdrop blur。
- **When to elevate:** 只在品牌、当前选择、可交互按钮和瞬时反馈上增加深度。

## 7. Do's and Don'ts

### Do

- 用奶油、粉桃、蛋奶黄和莓果紫建立稳定的日夜主题。
- 把星星、翅膀和丝带集中在品牌徽章与少量状态反馈中。
- 保留 SF Symbols 的功能辨识度，并用糖果底座统一风格。
- 确保浅色与深色都有明确文字对比和键盘焦点。
- 用真实 AppKit/DOM 控件承载文字、状态和交互。
- 保留锚定面板、固定控件列、滚动容量与系统无障碍行为。

### Don't

- 不添加普通桌面窗口、居中兜底、标题栏、红黄绿按钮、Dock 图标或未锚定面板。
- 菜单栏只使用单枚四角星 template 图标，不换成彩色徽章，也不修改正式应用图标。
- 不生成动漫人物、脸部、魔法棒角色立绘、数字、`Cute` 文案或水印。
- 不使用廉价霓虹、彩虹渐变、强烈镜面反射或高频闪烁。
- 不把每个控制行做成独立大卡片，不让装饰遮挡文案或缩小点击区。
- 不用 CSS 图形、Emoji、字符画或临时 SVG 假装正式装饰素材。
- 不因视觉改造改变权限申请、TCC、bundle ID、用户配置域或面板打开时机。

## 8. Responsive Behavior

### Breakpoints

| Name | Width | Key Changes |
| --- | --- | --- |
| Native popover | 360pt | 固定三列控制行，超过 8 项纵向滚动 |
| Compact preview | `<700px` | Web 预览贴近视口，设置页隐藏非必要详情列 |
| Desktop preview | `≥700px` | 展示完整 macOS 舞台、锚定面板与设置窗口 |

### Touch Targets

- 鼠标主导界面仍保持至少 32×32pt 点击区域；开关为 44×26pt。
- 底栏图标按钮至少 36×36pt；拖拽把手至少 36×36pt。
- 焦点、hover 和按下不能引起布局跳动。

### Collapsing Strategy

- **Native:** 不响应式改变宽度；只允许列表滚动和文案尾部截断。
- **Web compact:** 保持真实控制结构，缩小舞台装饰而不是控件点击区。
- **Preferences:** 保留 400pt 原生内容宽度；Web 回退在窄屏隐藏辅助详情，不删功能。
- **Theme switching:** 跟随系统外观即时替换语义令牌和徽章资源，不重新创建状态项或窗口。

## 9. Agent Prompt Guide

### Quick Color Reference

- **Primary CTA:** Strawberry Magic `#F778A5` → Peach Glow `#FFAA78`。
- **Light background:** Cream Veil `#FFF8F2`。
- **Dark background:** Berry Midnight `#241A35`。
- **Heading text:** Cocoa Rose `#573846` / Moon Cream `#FFF2F7`。
- **Body text:** Mulberry Ink `#745563` / `#E7D5E3`。
- **Border or ring:** Sugar Edge `#F2CCD5` / `rgba(255,210,230,.22)`。
- **Accent:** Custard Gold `#F6C867` / Lavender Wish `#C8B2FF`。

### Quick Summary

把 OneTouch 设计成一件精致的魔法少女变身道具，而不是普通粉色工具。使用奶油暖白、草莓粉、蜜桃橙和蛋奶黄构成浅色糖果主题；深色切换为莓果紫、月光粉与薰衣草蓝。品牌集中在翼形星徽，功能图标继续使用 SF Symbols，但置于软 3D 糖果底座。所有交互保持紧凑、清晰、可访问，魔法感通过材质与状态出现，而不是靠角色、Emoji 或大面积装饰。

### Example Component Prompts

- **Header:** “为 360pt macOS 菜单栏面板设计紧凑标题区，左侧使用无文字翼形星徽，右侧只保留单行 OneTouch 品牌标题，不显示‘快捷控制’等副标题；奶油粉桃糖果釉面、珍珠高光、清晰深色文字，不改变面板锚定或窗口外壳。”
- **Control row:** “设计 55pt 高的三列控制行：28pt 粉桃软浮雕图标底座、两行真实文本、44×26pt 糖果开关；无独立大卡片，状态清晰，支持错误、加载与禁用。”
- **Settings group:** “设计原生 macOS 设置分组，保留工具栏、搜索和表格行为；使用奶油 raised surface、16px 圆角、细糖边和粉色选中态，不伪造窗口标题栏。”
- **Button or badge:** “设计白色常态表面、深粉文字的紧凑胶囊按钮，hover 仅切换为极浅粉底和粉色描边；处理态才使用粉桃渐变与白字。顶部珍珠高光、短距离玫瑰阴影；真实文本，不使用 3D 字体、Emoji 或闪烁。”

### Ready-to-Use AppKit Prompt

依据 `design.md` 在现有 Objective-C AppKit 视图中实现 Peach Star Magic。保留锚定 `NSPanel`、`NSGlassEffectView` / `NSVisualEffectView`、现有 Auto Layout、NSSwitch/NSButton 行为与状态项逻辑。建立动态浅色/深色语义颜色帮助方法、圆体标题字体、糖果图标底座和主题内容背景；不要增加窗口、Dock 图标、私有 API 或改变权限流程。

### Ready-to-Use React/CSS Prompt

依据 `design.md` 把 Web 预览改成 Peach Star Magic。使用 CSS 自定义属性镜像日夜语义令牌，保留现有 React 结构、控制语义、拖拽、二级面板和无障碍属性。用渐变、描边、高光与短阴影实现糖果材质；装饰仅使用正式生成的徽章 PNG 和现有 Lucide 图标，不使用 Emoji、CSS 插画或临时 SVG。

### Ready-to-Use image2 Prompt

Use case: logo-brand
Asset type: OneTouch in-app header and About-page decorative crest
Input image: the user-provided pink-and-peach winged shield reference is style inspiration only
Primary request: create one compact, symmetrical winged magical crest with a four-point star and a tiny abstract single-switch seed shape at its center
Style/medium: soft 3D candy enamel, pearl highlights, rounded embossed edges, refined magical-girl transformation-item feeling
Composition: centered square asset, generous safe padding, crisp opaque silhouette, no background card
Color palette: strawberry pink, peach orange, custard gold, warm cream; create a matching berry-purple and moonlit-lavender night variant with identical geometry
Constraints: no words, no letters, no numbers, no character, no face, no watermark; no cast shadow; perfectly flat solid `#00FF00` chroma-key background; do not use green in the crest
Avoid: anime character art, toy-store plastic, rainbow neon, sharp metallic spikes, dense ornaments, translucent smoke, glass, glitter noise

### Iteration Guide

1. 先校验窗口形态、布局密度和可读性，再校验粉桃配色。
2. 如果不够“少女感”，优先加强徽章、釉面和珍珠高光，不增加角色或更多卡片。
3. 如果显得幼稚，降低心形与丝带数量，提高奶油留白和边缘精度。
4. 如果深色像普通紫色主题，恢复月光粉高光和薰衣草辅助色，而不是增加霓虹。
5. 每轮只改一个变量，并同时检查浅色、深色与高对比度。

## Optional Appendix: Interaction Patterns

- **Hover:** 160ms ease-out，上浮 1px，描边和高光增强；不改变尺寸。
- **Press:** 120–160ms，缩放至 0.98，阴影收紧，松开后使用轻微回弹。
- **Toggle:** 180–220ms；旋钮平滑移动，高光随状态改变，不做弹跳过冲。
- **Pending:** 图标或旋钮出现低速旋转高光；禁止整行持续闪烁。
- **Complete:** 1400ms 内短暂转为 Apricot Star，并淡回正常状态。
- **Panel transition:** 保留现有系统窗口动画；二级内容使用 160–220ms 淡入与 4px 位移。
- **Reduced motion:** 所有位移和旋转降为不超过 0.01ms 的直接状态切换。

## Optional Appendix: Content & Messaging Patterns

- 文案保持 OneTouch 既有直接、平静和功能导向语气；视觉甜美不意味着文案撒娇。
- 标题使用动作或功能名称，状态行说明当前结果或下一步。
- 不加入“魔法完成”“变身成功”等主题化文案，以免降低工具可信度。
- 中英文信息层级、错误含义与操作标签保持对等。

## Optional Appendix: Evidence Notes

- **Observed reference:** `/var/folders/n5/q0bmv3hd3rv1q8_rkkmbp59w0000gn/T/codex-clipboard-e77e2ac6-8f0b-47fa-a981-bb5f5a6136ea.png`。
- **Directly observed:** 奶油背景、粉橙黄渐变、翼形盾徽、星星/心形小装饰、白色珍珠高光、圆润浮雕、柔和落影。
- **Inferred for OneTouch:** 日夜主题、具体色值、控件材质公式、动效时长与布局数值；这些推断以现有 OneTouch 结构和 macOS 无障碍约束为边界。
- **Existing product evidence:** `src-tauri/src/macos_helper.m` 的原生锚定面板和设置页、`src/App.jsx` 的 Web 回退结构、`src/styles.css` 的现有状态与动效。
