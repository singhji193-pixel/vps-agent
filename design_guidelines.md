# Design Guidelines: AI VPS Management Platform

## Design Approach

**System-Based Approach** - Inspired by Linear, Vercel, and GitHub's developer-focused interfaces

This is a utility-focused application where clarity, information hierarchy, and efficiency are paramount. The design draws from modern developer tools that prioritize functionality while maintaining clean aesthetics.

**Core Principles:**
- Information clarity over decoration
- Purposeful use of space for complex data
- Consistent patterns for predictable interactions
- Professional, trust-building interface

---

## Typography

**Font Families:**
- Primary: Inter (via Google Fonts) - UI elements, navigation, buttons
- Monospace: JetBrains Mono (via Google Fonts) - Command outputs, code, logs, terminal

**Hierarchy:**
- Page titles: text-2xl font-semibold
- Section headers: text-lg font-medium
- Body text: text-base font-normal
- Terminal/code output: text-sm font-mono
- Labels and metadata: text-xs font-medium uppercase tracking-wide
- Button text: text-sm font-medium

---

## Layout System

**Spacing Primitives:** Use Tailwind units of 2, 4, 6, 8, 12, and 16
- Tight spacing (component internals): p-2, gap-2
- Standard spacing (between elements): p-4, gap-4, m-4
- Section spacing: p-6, py-8
- Major sections: p-12, py-16

**Grid Structure:**
- Two-column layout for main workspace: sidebar (w-80) + main content (flex-1)
- Testing view: Split-screen 60/40 ratio for test controls vs. live output
- Chat interface: Single column (max-w-4xl) with fixed input at bottom

---

## Component Library

### Navigation & Layout

**Sidebar Navigation:**
- Fixed left sidebar (w-80, h-screen)
- Sections: VPS Management, Testing Agent, Support Agent, GitHub, Settings
- Each nav item with icon (Heroicons) and label
- Active state indicator (border-l-2 with accent)
- Collapsible subsections for VPS operations history

**Top Bar:**
- User profile with OTP authentication status indicator
- Quick actions: New conversation, GitHub sync, Emergency stop
- Real-time connection status badge for VPS

### Chat Interface

**Message Container:**
- User messages: Right-aligned, max-w-3xl, compact background treatment
- AI messages: Left-aligned, full-width for better readability
- Command execution blocks: Distinct terminal-style containers with monospace font

**Input Area:**
- Fixed bottom position (sticky bottom-0)
- Multi-line textarea with auto-expand (max-h-48)
- Send button with keyboard shortcut indicator (Cmd+Enter)
- Quick action buttons: Attach config, Insert command template

**Special Message Types:**
- Command preview cards: Show parsed command before execution with approve/reject buttons
- Progress indicators: Real-time status for long-running operations
- Error states: Highlighted container with troubleshooting suggestions

### Testing Dashboard

**Live Progress View (Figma/Lovable-style):**
- Split layout: Test configuration (left 40%) + Live visualization (right 60%)
- Progress steps shown as vertical timeline with:
  - Step name and description
  - Status indicators: pending (outlined circle), running (animated spinner), success (checkmark), error (X)
  - Timestamps for each step
  - Expandable details for logs

**Test Results Panel:**
- Summary cards grid (grid-cols-3): Total tests, Passed, Failed
- Detailed results table with sortable columns
- Quick filters: All, Passed, Failed, Running

### Terminal & Command Output

**Terminal Component:**
- Full-width container with subtle background
- Monospace font throughout
- Line numbers in gutter (optional, togglable)
- Syntax highlighting for different output types (success/green, error/red, warning/yellow)
- Scrollable with sticky command input at bottom
- Copy button for entire output or individual commands

### Forms & Inputs

**SSH Credentials Setup:**
- Card-based layout with clear sections
- Input fields: Host, Port, Username, Authentication method (password/key)
- Password field with visibility toggle
- Private key textarea with file upload option
- Test connection button with inline status feedback

**OTP Authentication:**
- Centered modal overlay
- Email input with validation
- OTP code input (6-digit, auto-tab between fields)
- Resend code timer display
- Clear error messaging

### Data Display

**VPS Status Dashboard:**
- Grid of metric cards (grid-cols-2 lg:grid-cols-4)
- Each card shows: Icon, metric name, value, trend indicator
- Metrics: CPU usage, Memory, Disk space, Uptime
- Mini sparkline charts for historical data

**GitHub Integration:**
- Repository selector dropdown
- Recent commits list with commit message, author, timestamp
- Fork/save button with confirmation modal
- Branch selector for version control

### Modals & Overlays

**Confirmation Dialogs:**
- Centered overlay with backdrop blur
- Clear heading explaining action
- Two-button layout: Cancel (ghost) + Confirm (primary)
- For destructive actions: Red accent with additional confirmation checkbox

**Loading States:**
- Skeleton screens for data-heavy sections
- Inline spinners for button actions
- Progress bars for file uploads/downloads

---

## Icons

**Library:** Heroicons (via CDN)

**Usage:**
- Navigation: outline icons at 20px
- Buttons: outline icons at 16px
- Status indicators: solid icons at 16px
- Metric cards: outline icons at 24px

---

## Animations

**Purposeful Motion Only:**
- Message streaming: Typewriter effect for AI responses (subtle, fast)
- Progress indicators: Smooth transitions between test states
- Sidebar collapse/expand: 200ms ease transition
- Modal overlays: Fade in (150ms) with scale transform (0.95 to 1)
- Live test visualization: Smooth step highlighting and status updates

**No Animations:**
- Page transitions
- Hover effects on static content
- Decorative background animations

---

## Responsive Considerations

**Desktop-First (1280px+):**
- Full sidebar + split-screen layouts
- Multi-column dashboards

**Tablet (768px - 1279px):**
- Collapsible sidebar (hamburger menu)
- Single-column test view with tabs

**Mobile (< 768px):**
- Bottom navigation bar
- Full-screen chat interface
- Stack all multi-column layouts
- Test progress as expandable accordion

---

## Images

**No traditional hero images** - This is a technical tool, not a marketing site.

**Functional Graphics:**
- Avatar/profile image (user authentication area)
- Empty state illustrations for: No VPS configured, No test history, No GitHub connection
- Status icons and badges throughout interface

Empty states should use simple, line-art style illustrations that match the professional aesthetic.