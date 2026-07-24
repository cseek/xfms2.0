# DESIGN.md

> 以清晰、稳定、克制的管理后台为核心，用蓝紫品牌色、深色导航和轻量层级帮助用户快速完成任务；本规范记录现有视觉语言，不要求重绘现有页面。

本文以 `www/css/common.css` 与 `www/login.css` 的现有实现为事实来源。示例中的变量是对现有颜色、尺寸和交互语义的规范化命名；后续页面应复用它们的角色关系，但不得仅为统一命名而改动当前页面外观。

## 1. Visual Theme & Atmosphere

**Style**: 现代、克制的企业级管理后台（登录页带轻量品牌氛围）  
**Keywords**: 清晰、可信、高效、蓝紫强调、深色导航、浅色工作区、紧凑、稳定  
**Tone**: 专业而友好，强调信息层级与操作确定性；不是霓虹赛博风、玻璃拟态或高装饰营销页。  
**Feel**: 像一张置于深色索引栏旁的整洁工作台——入口具有品牌识别，进入系统后让内容和任务成为主角。

**Interaction Tier**: **L1 精致静态**  
**Dependencies**: **CSS only**。不引入 GSAP、滚动库、WebGL、Google Fonts 或任何新依赖。

### 视觉语言分区

- **应用壳层**：黑色固定侧栏、白色头尾栏、浅灰工作区；结构边界明确，适合长时间使用。
- **内容表面**：白色卡片配低对比边框、8px 基础圆角和克制阴影。
- **品牌强调**：后台主要操作使用 `#2563eb`；登录页沿用 `#4d6bfe → #7c5af0` 蓝紫渐变；侧栏选中项沿用亮青色提示。
- **登录场景**：图片背景上放置 400px 白色登录卡；不启用已隐藏的背景光球和卡片光晕。
- **密度**：后台保持中等偏紧凑，登录页适度留白；不使用超大营销标题或不必要的装饰块。
- **形状**：基础控件 8–10px 圆角，登录卡 16px；圆角表达友好，但不做胶囊化泛滥。

## 2. Color Palette & Roles

以下变量覆盖现有两套页面上下文。`-rgb` 伴随值用于 `rgba(var(--token-rgb), alpha)`，避免散落硬编码 RGB。

```css
:root {
  /* Core brand: application shell */
  --color-primary: #2563eb;
  --color-primary-rgb: 37, 99, 235;
  --color-primary-hover: #1d4ed8;
  --color-primary-hover-rgb: 29, 78, 216;
  --color-secondary: #7c3aed;
  --color-secondary-rgb: 124, 58, 237;

  /* Authentication brand */
  --color-auth-primary: #4d6bfe;
  --color-auth-primary-rgb: 77, 107, 254;
  --color-auth-primary-hover: #3755e4;
  --color-auth-primary-hover-rgb: 55, 85, 228;
  --color-auth-secondary: #7c5af0;
  --color-auth-secondary-rgb: 124, 90, 240;
  --color-auth-secondary-hover: #6a47d4;
  --color-auth-secondary-hover-rgb: 106, 71, 212;

  /* Sidebar accent */
  --color-nav-active: #00d9ff;
  --color-nav-active-rgb: 0, 217, 255;

  /* Backgrounds and surfaces */
  --color-bg: #f8fafc;
  --color-bg-rgb: 248, 250, 252;
  --color-surface: #ffffff;
  --color-surface-rgb: 255, 255, 255;
  --color-surface-muted: #f5f6fa;
  --color-surface-muted-rgb: 245, 246, 250;
  --color-surface-readonly: #f3f4f6;
  --color-surface-readonly-rgb: 243, 244, 246;
  --color-sidebar: #000000;
  --color-sidebar-rgb: 0, 0, 0;

  /* Login background stops; together they reproduce the current fallback */
  --color-login-bg-start: #1a0030;
  --color-login-bg-start-rgb: 26, 0, 48;
  --color-login-bg-mid: #0d001a;
  --color-login-bg-mid-rgb: 13, 0, 26;
  --color-login-bg-end: #000000;
  --color-login-bg-end-rgb: 0, 0, 0;
  --background-login: linear-gradient(
    135deg,
    var(--color-login-bg-start) 0%,
    var(--color-login-bg-mid) 50%,
    var(--color-login-bg-end) 100%
  );

  /* Text */
  --color-text: #1e293b;
  --color-text-rgb: 30, 41, 59;
  --color-auth-text: #0f1117;
  --color-auth-text-rgb: 15, 17, 23;
  --color-text-secondary: #64748b;
  --color-text-secondary-rgb: 100, 116, 139;
  --color-auth-text-secondary: #5a5f7d;
  --color-auth-text-secondary-rgb: 90, 95, 125;
  --color-text-muted: #9198b0;
  --color-text-muted-rgb: 145, 152, 176;
  --color-text-on-dark: #cbd5e1;
  --color-text-on-dark-rgb: 203, 213, 225;
  --color-text-on-dark-muted: #94a3b8;
  --color-text-on-dark-muted-rgb: 148, 163, 184;
  --color-on-accent: #ffffff;
  --color-on-accent-rgb: 255, 255, 255;

  /* Borders */
  --color-border: #e2e8f0;
  --color-border-rgb: 226, 232, 240;
  --color-auth-card-border: #e8eaef;
  --color-auth-card-border-rgb: 232, 234, 239;
  --color-input-border: #dde0e8;
  --color-input-border-rgb: 221, 224, 232;

  /* Semantic */
  --color-success: #10b981;
  --color-success-rgb: 16, 185, 129;
  --color-danger: #ef4444;
  --color-danger-rgb: 239, 68, 68;
  --color-warning: #f59e0b;
  --color-warning-rgb: 245, 158, 11;

  /* Shared opacity roles */
  --color-focus-ring: rgba(var(--color-primary-rgb), 0.10);
  --color-auth-focus-ring: rgba(var(--color-auth-primary-rgb), 0.12);
  --color-scrim: rgba(var(--color-sidebar-rgb), 0.50);
  --color-sidebar-hover: rgba(var(--color-surface-rgb), 0.08);
  --color-sidebar-active-bg: rgba(var(--color-nav-active-rgb), 0.15);
  --color-disabled-overlay: rgba(var(--color-surface-rgb), 0.38);
}
```

**Color Rules:**

- Use role-based variables for all new CSS colors; use the RGB companion when opacity is required.
- Preserve the context distinction: application actions use `--color-primary`; authentication actions use `--color-auth-primary` and its existing blue-purple gradient.
- Use the cyan `--color-nav-active` only for navigation selection, not as a general CTA color.
- White text belongs on solid or gradient accent backgrounds; normal body copy uses the dark text tokens.
- Semantic colors communicate state and must not be used as decoration.
- Maintain readable contrast; muted text is for secondary metadata, never for essential instructions or primary actions.
- The login background image remains the primary backdrop; `--background-login` is its fallback, not a replacement mandate.

## 3. Typography Rules

### Font stack and deliberate dependency exception

```css
:root {
  --font-sans: "Segoe UI", -apple-system, BlinkMacSystemFont, system-ui,
    Roboto, "Helvetica Neue", Arial, "Microsoft YaHei", "PingFang SC",
    sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
    "Liberation Mono", monospace;
}
```

**Google Fonts URL: none, deliberately.** The existing product uses a system UI stack and must work without a font download. Therefore this specification intentionally contains no `@import` and introduces no Google Fonts or package dependency. `Inter` may remain in the existing login fallback chain if locally available, but must not be fetched. This explicit exception preserves startup speed, offline availability, platform familiarity, and the current appearance.

| Role | Font | Size | Weight | Line height | Letter spacing |
|---|---|---:|---:|---:|---:|
| Product/large page title | `var(--font-sans)` | 24px / 1.5rem | 600–700 | 1.2 | -0.2px to 0 |
| Section heading | `var(--font-sans)` | 20px / 1.25rem | 600 | 1.3 | 0 |
| Card/subsection heading | `var(--font-sans)` | 18px / 1.125rem | 600–700 | 1.3 | 0 |
| Body | `var(--font-sans)` | 15–16px | 400 | 1.6–1.7 | 0 to 0.02em for Chinese copy |
| Form control / button | `var(--font-sans)` | 15px / 0.9375rem | 400–600 | 1.5 | 0–0.3px |
| Label / navigation | `var(--font-sans)` | 14px / 0.875rem | 500 | 1.5 | 0 |
| Caption / metadata | `var(--font-sans)` | 11.5–13px | 400–500 | 1.4–1.5 | 0.3px maximum |
| Code / identifiers | `var(--font-mono)` | 14px | 400 | 1.6 | 0 |

**Typography Rules:**

- Keep Chinese body copy at 15px or larger, with line-height at least 1.7 for paragraph-length content.
- Reserve 700 weight for product identity and high-priority headings; use 600 for page hierarchy and primary actions.
- Do not communicate hierarchy by color alone; combine weight, size, position, or a selected-state marker.
- Keep labels sentence-case and concise. Avoid all-caps UI copy and wide tracking in Chinese text.
- Truncate only nonessential single-line metadata; wrapping is preferred for instructions and errors.
- **Never introduce** decorative display fonts, serif fonts, handwritten fonts, or a remotely fetched font without a separate approved design change.

**Text Decoration Decision:**

- Page titles and login headings: no gradient and no text shadow. The restrained utility context does not meet the decoration threshold.
- Body, labels, errors, and metadata: no gradient, shadow, or decorative underline.
- Sidebar product wordmark: retain its existing blue-purple gradient as the sole brand-text exception.
- Links: use color plus a conventional underline on hover; never use text glow.

## 4. Component Stylings

The state vocabulary is mandatory for interactive components: **default, hover, active, focus-visible, disabled**. When a semantic HTML element has no native disabled attribute, use `aria-disabled="true"`, remove it from the activation path in JavaScript, and avoid relying on CSS alone for behavior.

### Buttons

```css
.button {
  min-height: 40px;
  padding: 0.625rem 1.25rem;
  border: 1px solid transparent;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  font: 500 0.95rem/1.4 var(--font-sans);
  cursor: pointer;
  transition: background-color 180ms ease, border-color 180ms ease,
    color 180ms ease, box-shadow 180ms ease, transform 180ms ease;
}

/* Default */
.button--primary {
  color: var(--color-on-accent);
  background: var(--color-primary);
}
.button--secondary {
  color: var(--color-text);
  background: var(--color-bg);
  border-color: var(--color-border);
}
.button--danger {
  color: var(--color-on-accent);
  background: var(--color-danger);
}
.button--auth {
  width: 100%;
  color: var(--color-on-accent);
  background: linear-gradient(
    90deg,
    var(--color-auth-primary),
    var(--color-auth-secondary)
  );
  box-shadow: 0 2px 10px rgba(var(--color-auth-primary-rgb), 0.30);
}

/* Hover */
.button--primary:hover { background: var(--color-primary-hover); }
.button--secondary:hover { background: var(--color-border); }
.button--danger:hover { filter: brightness(0.9); }
.button--auth:hover {
  background: linear-gradient(
    90deg,
    var(--color-auth-primary-hover),
    var(--color-auth-secondary-hover)
  );
  box-shadow: 0 4px 18px rgba(var(--color-auth-primary-rgb), 0.42);
  transform: translateY(-1px);
}

/* Active */
.button:active { transform: translateY(0); }
.button--auth:active {
  box-shadow: 0 2px 8px rgba(var(--color-auth-primary-rgb), 0.25);
}

/* Focus */
.button:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
.button--auth:focus-visible { outline-color: var(--color-auth-primary); }

/* Disabled */
.button:disabled,
.button[aria-disabled="true"] {
  opacity: 0.60;
  cursor: not-allowed;
  pointer-events: none;
  transform: none;
  box-shadow: none;
}
```

### Cards and Content Surfaces

```css
.card {
  color: var(--color-text);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  box-shadow: var(--elevation-1);
  transition: border-color 180ms ease, box-shadow 180ms ease;
}

/* Default login variant */
.card--login {
  width: min(400px, 100%);
  padding: 2.5rem 2.25rem 2rem;
  border-color: var(--color-auth-card-border);
  border-radius: 16px;
  box-shadow: var(--elevation-login);
}

/* Hover: preserve the current static card treatment */
.card:hover { border-color: var(--color-border); }
.card--login:hover {
  transform: none;
  box-shadow: var(--elevation-login);
}

/* Active/selected */
.card[aria-selected="true"],
.card.is-active {
  border-color: var(--color-primary);
}

/* Focus */
.card[tabindex]:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

/* Disabled */
.card[aria-disabled="true"] {
  opacity: 0.60;
  cursor: not-allowed;
  pointer-events: none;
}
```

Static cards should not receive `tabindex`, hover elevation, or active styling. Apply interactive states only when the entire card performs an action.

### Navigation

```css
.nav-link {
  min-height: 44px;
  padding: 0.875rem 1.5rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  color: var(--color-text-on-dark);
  background: transparent;
  border-right: 3px solid transparent;
  text-decoration: none;
  transition: background-color 200ms ease, color 200ms ease,
    border-color 200ms ease;
}

/* Hover */
.nav-link:hover {
  color: var(--color-on-accent);
  background: var(--color-sidebar-hover);
}

/* Active/current */
.nav-link.active,
.nav-link[aria-current="page"] {
  color: var(--color-nav-active);
  background: var(--color-sidebar-active-bg);
  border-right-color: var(--color-nav-active);
}

/* Focus */
.nav-link:focus-visible {
  outline: 2px solid var(--color-nav-active);
  outline-offset: -3px;
}

/* Disabled */
.nav-link[aria-disabled="true"] {
  color: var(--color-text-on-dark-muted);
  opacity: 0.45;
  cursor: not-allowed;
  pointer-events: none;
}
```

The sidebar itself remains black, 260px wide on large screens, fixed-height, and independently scrollable through `.sidebar-body`. Submenus reveal by changing `max-height`; the parent arrow rotates 90 degrees in the active/open state.

### Text Links

```css
.text-link {
  color: var(--color-primary);
  text-decoration: none;
  text-underline-offset: 0.18em;
  border-radius: 3px;
  transition: color 180ms ease;
}

.text-link:hover {
  color: var(--color-primary-hover);
  text-decoration: underline;
}
.text-link:active { color: var(--color-primary-hover); }
.text-link:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
.text-link[aria-disabled="true"] {
  color: var(--color-text-muted);
  opacity: 0.60;
  cursor: not-allowed;
  pointer-events: none;
  text-decoration: none;
}
```

Login-page links substitute `--color-auth-primary` and `--color-auth-primary-hover`; the forgotten-password link may begin in secondary text but becomes authentication blue on hover and focus.

### Form Controls

```css
.field {
  min-height: 44px;
  width: 100%;
  padding: 0.75rem 1rem;
  color: var(--color-text);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  font: 400 0.95rem/1.5 var(--font-sans);
  transition: border-color 180ms ease, box-shadow 180ms ease,
    background-color 180ms ease;
}
.field:hover { border-color: var(--color-text-secondary); }
.field:active { border-color: var(--color-primary); }
.field:focus,
.field:focus-visible {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-focus-ring);
}
.field:disabled,
.field[readonly] {
  color: var(--color-text-secondary);
  background: var(--color-surface-readonly);
  border-color: var(--color-border);
  cursor: not-allowed;
}
.field[aria-invalid="true"] {
  border-color: var(--color-danger);
  box-shadow: 0 0 0 3px rgba(var(--color-danger-rgb), 0.10);
}

/* Login input wrapper */
.auth-field {
  min-height: 44px;
  background: var(--color-surface-muted);
  border: 1.5px solid var(--color-input-border);
  border-radius: 10px;
}
.auth-field:hover { border-color: var(--color-auth-text-secondary); }
.auth-field:active { border-color: var(--color-auth-primary); }
.auth-field:focus-within {
  background: var(--color-surface);
  border-color: var(--color-auth-primary);
  box-shadow: 0 0 0 3px var(--color-auth-focus-ring);
}
.auth-field[aria-disabled="true"] {
  opacity: 0.60;
  cursor: not-allowed;
  pointer-events: none;
}
```

### Tags and Badges

```css
.badge {
  min-height: 24px;
  padding: 0.2rem 0.5rem;
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-text-secondary);
  background: var(--color-bg);
  font: 500 0.75rem/1.2 var(--font-sans);
  transition: color 180ms ease, background-color 180ms ease,
    border-color 180ms ease;
}
.badge[href]:hover,
button.badge:hover {
  color: var(--color-primary);
  border-color: var(--color-primary);
}
.badge[href]:active,
button.badge:active { background: var(--color-focus-ring); }
.badge[href]:focus-visible,
button.badge:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
.badge[aria-pressed="true"],
.badge.is-active {
  color: var(--color-on-accent);
  background: var(--color-primary);
  border-color: var(--color-primary);
}
.badge:disabled,
.badge[aria-disabled="true"] {
  opacity: 0.60;
  cursor: not-allowed;
  pointer-events: none;
}
```

A noninteractive badge has only its default appearance and must not simulate hover or focus.

### Language Toggle and Icon Buttons

```css
.icon-button,
.language-option {
  min-width: 44px;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary);
  background: transparent;
  border: 0;
  border-radius: 6px;
  cursor: pointer;
  transition: color 180ms ease, background-color 180ms ease;
}
.icon-button:hover,
.language-option:hover {
  color: var(--color-auth-primary);
  background: rgba(var(--color-auth-primary-rgb), 0.08);
}
.icon-button:active,
.language-option:active {
  background: rgba(var(--color-auth-primary-rgb), 0.12);
}
.icon-button:focus-visible,
.language-option:focus-visible {
  outline: 2px solid var(--color-auth-primary);
  outline-offset: 2px;
}
.language-option.active,
.language-option[aria-pressed="true"] {
  color: var(--color-auth-primary);
  background: transparent;
  font-weight: 600;
}
.icon-button:disabled,
.language-option:disabled,
.language-option[aria-disabled="true"] {
  opacity: 0.45;
  cursor: not-allowed;
  pointer-events: none;
}
```

### Modal and Dropdown

```css
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  color: var(--color-text);
  background: var(--color-scrim);
  opacity: 0;
  visibility: hidden;
  transition: opacity 300ms ease, visibility 300ms ease;
}
.modal-overlay.active {
  opacity: 1;
  visibility: visible;
}
.modal {
  width: 100%;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--color-surface);
  border-radius: 8px;
  box-shadow: var(--elevation-modal);
  transform: translateY(20px);
  transition: transform 300ms ease;
}
.modal-overlay.active .modal { transform: translateY(0); }
.modal:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
.modal[aria-disabled="true"] {
  opacity: 0.60;
  pointer-events: none;
}

.dropdown-item {
  min-height: 44px;
  padding: 0.65rem 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text);
  background: var(--color-surface);
  cursor: pointer;
}
.dropdown-item:hover { background: var(--color-bg); }
.dropdown-item:active,
.dropdown-item.active { background: var(--color-border); }
.dropdown-item:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: -3px;
}
.dropdown-item:disabled,
.dropdown-item[aria-disabled="true"] {
  opacity: 0.50;
  cursor: not-allowed;
  pointer-events: none;
}
```

Modal active/open is a container state rather than a pressed state. Its close control follows the icon-button state contract. Dropdown danger actions use `--color-danger` for text while retaining the same interaction mechanics.

## 5. Layout Principles

### Application shell contract

```css
:root {
  --layout-sidebar-width: 260px;
  --layout-header-height: 64px;
  --layout-content-gap: 16px;
  --layout-radius: 8px;
  --layout-content-max: none;
}

html,
body,
.app-shell {
  width: 100%;
  height: 100%;
}
body,
.app-shell {
  overflow: hidden;
}
.app-shell {
  display: flex;
}
.sidebar {
  width: var(--layout-sidebar-width);
  height: 100vh;
  flex: 0 0 var(--layout-sidebar-width);
}
.content-wrapper {
  min-width: 0;
  height: 100vh;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.app-header,
.app-footer {
  height: var(--layout-header-height);
  margin-inline: var(--layout-content-gap);
  flex: 0 0 var(--layout-header-height);
}
.content-area {
  min-width: 0;
  min-height: 0;
  flex: 1;
  margin: var(--layout-content-gap);
  overflow: hidden;
}
.route-view {
  width: 100%;
  height: 100%;
  overflow: auto;
  overscroll-behavior: contain;
}
```

- The application is a fixed `100vh` shell. **The document body must not scroll.**
- `.route-view` is the canonical vertical and horizontal content scroller; page modules must not create a second full-height scroller inside it.
- `.sidebar-body` may scroll independently between a fixed sidebar header and footer.
- Modal chrome stays fixed; only the designated modal body or `.form-scroll-box` may scroll when content exceeds available height.
- The content wrapper and content area require `min-width: 0` / `min-height: 0` so flex children shrink without accidental overflow.
- Wide data tables may use a local horizontal scroller, but must not force the shell or body wider than the viewport.

### Login layout contract

```css
.login-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 1.5rem;
  background: var(--background-login);
  background-image: url("images/login-bg.jpg");
  background-size: cover;
  background-position: center;
  background-attachment: fixed;
}
.login-card { width: min(400px, 100%); }
```

On short screens, login content may scroll vertically rather than being clipped; centering must not prevent access to the first or last field.

### Container, grid, and spacing

- **Application content max width**: fluid within `.route-view`; no artificial global cap because tables and operational screens need available width.
- **Reading/narrow content**: 720px maximum where long prose is present.
- **Login card**: 400px maximum.
- **Default outer gap**: 16px; compact mobile gap: 12px then 8px.
- **Card padding**: 20–24px; login card: 36px horizontal and 40px top on desktop.
- **Spacing scale**: 4, 8, 12, 16, 20, 24, 32, 40, 48px. Use multiples from this scale rather than one-off values.

```css
.content-grid {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 1rem;
}
.content-grid > * { min-width: 0; }
.span-12 { grid-column: span 12; }
.span-8 { grid-column: span 8; }
.span-6 { grid-column: span 6; }
.span-4 { grid-column: span 4; }
```

## 6. Depth & Elevation

Depth clarifies containment and temporary layers. It must not make every surface appear to float.

```css
:root {
  --elevation-0: none;
  --elevation-1: 0 2px 6px -1px rgba(var(--color-sidebar-rgb), 0.07),
    0 4px 12px -1px rgba(var(--color-sidebar-rgb), 0.10);
  --elevation-header: 0 1px 4px rgba(var(--color-sidebar-rgb), 0.07),
    0 4px 16px rgba(var(--color-sidebar-rgb), 0.10);
  --elevation-content: 0 2px 6px rgba(var(--color-sidebar-rgb), 0.07),
    0 8px 24px rgba(var(--color-sidebar-rgb), 0.10);
  --elevation-sidebar: 1px 0 0 rgba(var(--color-surface-rgb), 0.04),
    4px 0 16px rgba(var(--color-sidebar-rgb), 0.25);
  --elevation-dropdown: 0 4px 16px rgba(var(--color-sidebar-rgb), 0.12);
  --elevation-login: 0 1px 3px rgba(var(--color-sidebar-rgb), 0.05),
    0 10px 30px rgba(var(--color-sidebar-rgb), 0.08);
  --elevation-modal: 0 20px 25px -5px rgba(var(--color-sidebar-rgb), 0.10);
}
```

| Level | Treatment | Use |
|---|---|---|
| Flat | `--elevation-0` + border | Inputs, passive badges, nested panels, table cells |
| Subtle | `--elevation-1` | Ordinary cards where separation from the page background is needed |
| Shell | `--elevation-header`, `--elevation-content`, `--elevation-sidebar` | Existing header/footer, route frame, and dark sidebar |
| Floating | `--elevation-dropdown`, `--elevation-login` | Dropdown menus and login card |
| Modal | `--elevation-modal` + scrim | Dialogs and blocking overlays only |

- A border is preferred before adding a shadow to nested content.
- Do not stack two strong shadows at the same hierarchy level.
- Hover elevation is reserved for genuinely clickable items; the login card remains visually static.
- Shadows remain neutral black with low alpha; do not introduce colored ambient glows except the existing small login logo/button accents.

## 7. Animation & Interaction

**Motion Philosophy**: Functional, short, and quiet. Animate only opacity, transform, color, border, and shadow; movement confirms state rather than entertaining.  
**Tier**: **L1 精致静态**  
**Dependencies**: **none; CSS only**.

### Timing tokens

```css
:root {
  --motion-fast: 120ms;
  --motion-base: 180ms;
  --motion-slow: 300ms;
  --ease-standard: ease;
  --ease-enter: cubic-bezier(0.16, 1, 0.3, 1);
}
```

- Hover/focus feedback: 120–200ms.
- Submenu, modal, overlay, and message entry: 300ms maximum.
- Loading spinner: 800ms linear loop, shown only during a real pending operation.
- No parallax, scroll-driven animation, smooth-scroll dependency, custom cursor, or continuously moving background.

### CSS-only entrance

Use only for a newly mounted route panel, modal, dropdown, or transient message. Do not replay it when ordinary content scrolls into view.

```css
@keyframes l1-fade-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.l1-enter {
  animation: l1-fade-in var(--motion-slow) var(--ease-enter) both;
}
```

### Loading and disclosure

```css
@keyframes spin {
  to { transform: rotate(360deg); }
}
.spinner { animation: spin 800ms linear infinite; }

.disclosure-icon {
  transition: transform var(--motion-base) var(--ease-standard);
}
[aria-expanded="true"] .disclosure-icon { transform: rotate(90deg); }
```

### Hover, active, and focus behavior

- Hover may shift the authentication button upward by **1px**; standard admin buttons remain stationary.
- Active returns translated controls to the baseline, reducing shadow to imply press.
- Every keyboard-operable control uses a visible 2px `:focus-visible` ring with 2px offset, or an inset equivalent inside the dark sidebar.
- Hover effects are enhancements only; no action or information may require hover.
- Disabled controls do not animate and do not retain hover elevation.

### Scroll behavior

- Keep native scrolling; do not add scroll-jacking or global `scroll-behavior: smooth`.
- The fixed shell does not move. `.route-view`, `.sidebar-body`, modal body, and explicitly wrapped wide tables are the only sanctioned scroll containers.
- Preserve the user’s scroll position during in-route updates when practical; route changes may reset the route viewport to the top.

### Reduced motion

Reduced motion is required even at L1 because the existing interface contains modal, message, submenu, button, and spinner transitions.

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    transition-delay: 0ms !important;
  }

  .l1-enter,
  .modal,
  .button,
  .button--auth:hover {
    transform: none !important;
  }

  .spinner {
    animation: none !important;
    border-top-color: currentColor;
  }
}
```

The pending state must also include a textual or otherwise nonanimated status indicator so stopping the spinner does not remove meaning.

## 8. Do's and Don'ts

### Do

1. **Do** preserve the hierarchy of black sidebar, white shell surfaces, and light-gray working canvas.
2. **Do** use application blue for normal actions, authentication blue-purple for login actions, and cyan only for active navigation.
3. **Do** reference color roles through variables and use their RGB companions for translucent colors.
4. **Do** keep operational content legible and moderately dense, with 15–16px body text and clear 600-weight headings.
5. **Do** provide default, hover, active, focus-visible, and disabled states for every new interactive component.
6. **Do** preserve a minimum 44×44px target for touch interactions, including icon-only buttons and language options.
7. **Do** keep body scrolling locked in the application shell and place page scrolling in `.route-view`.
8. **Do** use semantic HTML, visible labels, `aria-current`, `aria-expanded`, `aria-invalid`, and `aria-disabled` where appropriate.
9. **Do** use short CSS-only transitions and honor `prefers-reduced-motion`.
10. **Do** favor a border or background change over adding another shadow.

### Don't

1. **Don't** introduce Google Fonts, font packages, GSAP, scrolling libraries, WebGL, or another visual dependency.
2. **Don't** replace the system font stack with a decorative, serif, handwritten, or remote-only typeface.
3. **Don't** turn the product into glassmorphism: avoid large translucent panels, broad backdrop blur, and glowing borders.
4. **Don't** reactivate the hidden login gradient orbs, card glow, or ornamental background animation.
5. **Don't** use gradient text or text shadows on page titles, form text, body copy, or labels.
6. **Don't** use cyan navigation accent as a primary form or toolbar action.
7. **Don't** use semantic success, warning, or danger colors decoratively or as interchangeable brand colors.
8. **Don't** create nested full-height vertical scrollers inside `.route-view` or allow the document body to scroll in the app shell.
9. **Don't** hide required actions or information behind hover, and don't remove the visible keyboard focus ring.
10. **Don't** shrink touch targets below 44px on tablet or mobile even if the visible icon is smaller.
11. **Don't** add hover lift to static cards or animate the login card; motion must correspond to an action.
12. **Don't** use `transition: all` in new styles; list the properties that actually change.
13. **Don't** use color alone to communicate errors, success, selection, or disabled status.
14. **Don't** apply strong shadows to every panel, nest multiple elevated surfaces, or exceed the modal elevation for normal content.
15. **Don't** clip login fields on short screens; allow vertical access when the viewport cannot contain the centered card.

## 9. Responsive Behavior

The following five bands are the canonical documentation breakpoints. Existing `1024px`, `768px`, and `480px` rules remain valid compatibility points inside these bands; this document does not authorize changing them solely to rename breakpoints.

| Band | Width | Layout and behavior |
|---|---:|---|
| Wide desktop | **>1200px** | 260px visible sidebar; full header identity; 12-column content grid; 16px shell gaps; toolbars remain inline. |
| Compact desktop / landscape tablet | **901–1200px** | Preserve desktop density where space permits. Sidebar may remain visible at the upper end; the existing 1024px compatibility rule converts it to an off-canvas drawer. Content grids may reduce 4-column groups to 3 or 2. |
| Tablet / small laptop | **≤900px** | Sidebar is an off-canvas fixed drawer with scrim and menu button; content wrapper takes full width; grid groups collapse to at most 2 columns; all controls are at least 44px tall. |
| Mobile | **≤600px** | Single-column primary flow; 12px shell gaps; toolbars wrap; modal footer buttons may stack or fill available width; nonessential user name/role text is hidden while the avatar/menu remains accessible. |
| Small mobile | **≤480px** | 8px shell gap, approximately 48px shell bars, compact 12–14px side padding; login card uses 24px horizontal padding and 12px radius; keep one-column controls and prevent horizontal overflow. |

### Touch and pointer contract

- Minimum target size: **44×44px** for buttons, links acting as controls, icon buttons, navigation rows, dropdown actions, language options, toggles, and disclosure controls.
- A visual icon may remain 17–24px but must sit inside a 44px hit area.
- Maintain at least 8px between adjacent standalone targets where possible.
- On coarse pointers, do not depend on hover and do not shrink targets to preserve desktop density.

### Collapsing strategy

1. Collapse the sidebar into an off-canvas drawer before reducing content below its usable width.
2. Keep title and primary action visible; hide or move secondary identity/metadata before truncating essential text.
3. Change 12-column cards to 2 columns at tablet and 1 column at mobile; do not squeeze forms into narrow side-by-side fields.
4. Wrap toolbars and action groups. Preserve primary-action prominence and logical keyboard/DOM order.
5. Wrap wide tables in a labeled horizontal scroller; never make the whole body horizontally scroll.
6. Dialogs use `width: 100%`, viewport padding, and `max-height: 90vh`; overflow belongs in the dialog body.
7. The login card remains centered when space permits, but becomes naturally scroll-accessible on short viewports.

```css
/* Wide desktop: >1200px is the unqualified baseline. */
.content-grid { grid-template-columns: repeat(12, minmax(0, 1fr)); }

@media (min-width: 901px) and (max-width: 1200px) {
  .content-grid { gap: 1rem; }
  .span-4 { grid-column: span 6; }
}

@media (max-width: 900px) {
  .sidebar {
    position: fixed;
    inset: 0 auto 0 0;
    transform: translateX(-100%);
  }
  .sidebar.active { transform: translateX(0); }
  .mobile-menu-button { display: inline-flex; }

  .button,
  .field,
  .auth-field,
  .nav-link,
  .icon-button,
  .language-option,
  .dropdown-item {
    min-height: 44px;
  }

  .span-8,
  .span-6,
  .span-4 { grid-column: span 6; }
}

@media (max-width: 600px) {
  :root {
    --layout-content-gap: 12px;
    --layout-header-height: 56px;
  }

  .span-8,
  .span-6,
  .span-4 { grid-column: 1 / -1; }
  .toolbar,
  .modal-footer { flex-wrap: wrap; }
  .user-name,
  .user-role { display: none; }
}

@media (max-width: 480px) {
  :root {
    --layout-content-gap: 8px;
    --layout-header-height: 48px;
  }

  .app-header,
  .app-footer { padding-inline: 0.875rem; }
  .login-page { padding: 1rem; }
  .card--login {
    padding: 2rem 1.5rem 1.75rem;
    border-radius: 12px;
  }

  .toolbar > .button,
  .modal-footer > .button { flex: 1 1 100%; }
}

@media (max-height: 640px) {
  .login-page {
    place-items: start center;
    overflow-y: auto;
  }
}
```
