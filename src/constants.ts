/*
 * Nav Dock —— 常量、设置默认值，以及「点哪里不该切编辑」的判定。
 */

export interface NavDockSettings {
	notePath: string;
	icon: string;
	label: string;
	trigger: 'hover' | 'click';
	linkOpenMode: 'new-tab' | 'current-tab';
	width: number;
	height: number;
	gap: number;
	closeOnLink: boolean;
	showHeader: boolean;
	maxHeightVh: number;
	language: 'auto' | 'zh' | 'en';
}

export const DEFAULT_SETTINGS: NavDockSettings = {
	notePath: '',        // 要预览的 md 路径（相对库根目录）
	icon: 'compass',     // Lucide 图标名
	label: '',           // 悬停提示；空 = 用当前语言的默认文案（见 i18n.ts labelDefault）
	trigger: 'hover',    // 'hover' = 悬停打开；'click' = 点击打开
	linkOpenMode: 'new-tab',  // 'new-tab' = 双链在新标签页打开；'current-tab' = 替换当前标签页
	width: 380,          // 浮层宽度 px
	height: 0,           // 0 = 高度自适应；拖拽后写入实际高度
	gap: 8,              // 与 ribbon 的水平间距 px
	closeOnLink: true,   // 点击内部/外部链接后自动收起
	showHeader: true,    // 显示顶部标题栏（文件名 + 在标签页打开）
	maxHeightVh: 78,     // 高度自适应时的上限（视口百分比）
	language: 'auto',    // 界面语言：'auto' 跟随 Obsidian / 'zh' / 'en'
};

export const CLOSE_DELAY = 220;      // 鼠标离开后延迟收起，留出穿过 gap 的时间
/** 双链预览浮层消失后的宽限期：这段时间内不跟着收浮层，避免「点一下就没了」 */
export const HOVER_GRACE = 700;
/** 双链悬停预览的来源名。注册进 hoverLinkSources 后会出现在「页面预览」设置里 */
export const HOVER_SOURCE = 'nav-dock';
export const MIN_WIDTH = 260;
export const MIN_HEIGHT = 160;
export const VIEWPORT_MARGIN = 12;
export const WARN_INTERVAL = 5000;   // 配置缺失时的提示节流

/**
 * 这些元素上点一下不该切编辑：链接是原有点击行为，按钮/输入框/勾选框是控件，
 * 折叠指示器和 interactive-child 各有自己的交互。
 */
export function isNonEditableTarget(el: Element | null): boolean {
	if (!el || typeof (el as any).closest !== 'function') return true;
	return !!(el as any).closest(
		'a, button, input, select, textarea, label, .task-list-item-checkbox, .collapse-indicator, .interactive-child'
	);
}
