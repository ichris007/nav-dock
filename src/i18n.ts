/*
 * 界面语言：中英双语。
 *
 * 设置项 language = 'auto' | 'zh' | 'en'：
 *   auto = 跟随 Obsidian 的语言（moment.locale()， Obsidian 用它反映设置里的语言），
 *          取不到再退 navigator.language，都失败退英文。
 *
 * 用法：插件实例上挂 this.uiLang（loadSettings 时定，setLanguage 时改），
 * 各处用 this.uiStrings() 取当前语言的文案表。文案表用接口 Strings 约束，
 * 两种语言必须键数一致，漏一个 tsc 就报错。
 *
 * ⚠ 新增文案时两个字典都要加；带参数的是函数（如 iconFooter(total, shown)）。
 */

export type Lang = 'zh' | 'en';
export type LangSetting = 'auto' | Lang;

export interface Strings {
	// ---- 设置页 ----
	setLanguage: string;
	setLanguageDesc: string;
	langAuto: string;
	langZh: string;
	langEn: string;
	setNote: string;
	setNoteDesc: string;
	setNotePlaceholder: string;
	btnUseCurrent: string;
	setTrigger: string;
	setTriggerDesc: string;
	optHover: string;
	optClick: string;
	setIconName: string;
	setIconDesc: (name: string) => string;
	btnPickIcon: string;
	setLabel: string;
	setLabelDesc: string;
	setLabelPlaceholder: string;
	setWidth: string;
	setWidthDesc: string;
	setMaxHeight: string;
	setMaxHeightDesc: string;
	btnAutoHeight: string;
	setResetSize: string;
	setResetSizeDesc: (width: number) => string;
	btnReset: string;
	setShowHeader: string;
	setShowHeaderDesc: string;
	setLinkMode: string;
	setLinkModeDesc: string;
	optNewTab: string;
	optCurrentTab: string;
	setCloseOnLink: string;
	setCloseOnLinkDesc: string;
	// ---- 命令 ----
	cmdToggle: string;
	cmdOpenInTab: string;
	// ---- 浮层 ----
	openInTabBtn: string;
	resizeHandle: string;
	triggerHover: string;
	triggerClick: string;
	// ---- 通知 ----
	noticeNoActiveFile: string;
	noticeNoNote: string;
	warnNoFile: (path: string) => string;
	warnNoPath: string;
	// ---- 图标点选器 ----
	iconPickerTitle: string;
	iconSearchPlaceholder: string;
	iconNoMatch: string;
	iconFooter: (total: number, shown: number) => string;
	// ---- 悬停预览来源名（出现在「页面预览」设置里）----
	hoverSourceDisplay: string;
	// ---- ribbon 默认提示（用户没自定义时用）----
	labelDefault: string;
}

const ZH: Strings = {
	setLanguage: '界面语言',
	setLanguageDesc: '切换插件界面语言。选「跟随系统」时按 Obsidian 的语言设置自动选择。',
	langAuto: '跟随系统',
	langZh: '中文',
	langEn: '英文',
	setNote: '导航文档',
	setNoteDesc: '输入文字筛选笔记，点列表里的条目即可确认。手输完整路径也行。',
	setNotePlaceholder: '输入以筛选，例如 导航、Homepage、00Dashboard',
	btnUseCurrent: '用当前笔记',
	setTrigger: '打开方式',
	setTriggerDesc: '悬停打开：鼠标移到图标上就展开，移开自动收起。点击打开：点图标才展开，不会自动收起。浮层标题栏的按钮也能切。',
	optHover: '悬停打开',
	optClick: '点击打开',
	setIconName: '图标',
	setIconDesc: (name) => `点右侧按钮从图标库里点选。当前：${name}`,
	btnPickIcon: '选择图标',
	setLabel: '提示文字',
	setLabelDesc: '鼠标悬停在 ribbon 图标上显示的文字。',
	setLabelPlaceholder: '导航',
	setWidth: '浮层宽度',
	setWidthDesc: '单位 px。拖拽浮层右下角也能直接调整，两边会同步。',
	setMaxHeight: '高度自适应上限',
	setMaxHeightDesc: '视口高度的百分比。拖拽调整过高度后这里不再生效，可点右侧按钮恢复。',
	btnAutoHeight: '恢复自适应',
	setResetSize: '重置尺寸',
	setResetSizeDesc: (width) => `宽度回到 ${width}px、高度回到自适应。`,
	btnReset: '重置',
	setShowHeader: '显示标题栏',
	setShowHeaderDesc: '浮层顶部显示文件名和「在标签页打开」按钮。关掉后只剩正文。',
	setLinkMode: '双链打开位置',
	setLinkModeDesc: '点浮层里的 [[双链]] 时，是在新标签页打开，还是替换当前激活的标签页。按住 Ctrl/Cmd 点击始终在新标签页打开。',
	optNewTab: '新标签页打开',
	optCurrentTab: '当前标签页打开',
	setCloseOnLink: '点击链接后收起',
	setCloseOnLinkDesc: '点浮层里的链接跳到别处后自动关闭浮层。文档内锚点（#标题）不受影响。',
	cmdToggle: 'Nav Dock：打开/关闭导航浮层（固定，不随鼠标离开收起）',
	cmdOpenInTab: 'Nav Dock：在标签页打开导航文档',
	openInTabBtn: '在标签页打开',
	resizeHandle: '拖拽调整大小',
	triggerHover: '当前：悬停打开。点击改为点击打开',
	triggerClick: '当前：点击打开。点击改为悬停打开',
	noticeNoActiveFile: '当前没有打开的笔记',
	noticeNoNote: 'Nav Dock：找不到导航文档，请检查插件设置里的路径',
	warnNoFile: (path) => `Nav Dock：找不到文档「${path}」`,
	warnNoPath: 'Nav Dock：请先在插件设置里填写导航文档路径',
	iconPickerTitle: '选择图标',
	iconSearchPlaceholder: '搜索图标名，例如 compass、map、book',
	iconNoMatch: '没有匹配的图标',
	iconFooter: (total, shown) => `共 ${total} 个，已显示 ${shown} 个`,
	hoverSourceDisplay: 'Nav Dock 浮层',
	labelDefault: '导航',
};

const EN: Strings = {
	setLanguage: 'Language',
	setLanguageDesc: 'UI language for this plugin. "Follow system" uses Obsidian\'s language setting.',
	langAuto: 'Follow system',
	langZh: '中文',
	langEn: 'English',
	setNote: 'Navigation note',
	setNoteDesc: 'Type to filter your notes, then pick from the list. A full path works too.',
	setNotePlaceholder: 'Type to filter, e.g. Navigation, Homepage, 00Dashboard',
	btnUseCurrent: 'Use current note',
	setTrigger: 'Open mode',
	setTriggerDesc: 'Hover: expands when the pointer moves onto the icon, collapses on leave. Click: expands only on click and never auto-collapses. The header button toggles this too.',
	optHover: 'Hover to open',
	optClick: 'Click to open',
	setIconName: 'Icon',
	setIconDesc: (name) => `Pick from the icon library with the button. Current: ${name}`,
	btnPickIcon: 'Choose icon',
	setLabel: 'Tooltip',
	setLabelDesc: 'Text shown when hovering the ribbon icon.',
	setLabelPlaceholder: 'Nav',
	setWidth: 'Panel width',
	setWidthDesc: 'In px. You can also drag the bottom-right corner of the panel; the two stay in sync.',
	setMaxHeight: 'Max height (auto)',
	setMaxHeightDesc: 'Percentage of viewport height. Stops applying once you drag the height; use the button to restore.',
	btnAutoHeight: 'Restore auto',
	setResetSize: 'Reset size',
	setResetSizeDesc: (width) => `Width back to ${width}px, height back to auto.`,
	btnReset: 'Reset',
	setShowHeader: 'Show header',
	setShowHeaderDesc: 'Show the file name and the "Open in tab" button on top. Off leaves only the content.',
	setLinkMode: 'Link open mode',
	setLinkModeDesc: 'Whether clicking a [[link]] in the panel opens a new tab or replaces the active tab. Ctrl/Cmd-click always opens a new tab.',
	optNewTab: 'New tab',
	optCurrentTab: 'Current tab',
	setCloseOnLink: 'Collapse after clicking a link',
	setCloseOnLinkDesc: 'Auto-close the panel after a link jumps elsewhere. In-document anchors (#heading) are unaffected.',
	cmdToggle: 'Nav Dock: Toggle navigation panel (pinned; does not close when the pointer leaves)',
	cmdOpenInTab: 'Nav Dock: Open navigation note in a tab',
	openInTabBtn: 'Open in tab',
	resizeHandle: 'Drag to resize',
	triggerHover: 'Now: hover to open. Click to switch to click.',
	triggerClick: 'Now: click to open. Click to switch to hover.',
	noticeNoActiveFile: 'No note is currently open',
	noticeNoNote: 'Nav Dock: navigation note not found. Check the path in plugin settings.',
	warnNoFile: (path) => `Nav Dock: document "${path}" not found`,
	warnNoPath: 'Nav Dock: set the navigation note path in plugin settings first',
	iconPickerTitle: 'Choose icon',
	iconSearchPlaceholder: 'Search icon names, e.g. compass, map, book',
	iconNoMatch: 'No matching icons',
	iconFooter: (total, shown) => `${total} icons, showing ${shown}`,
	hoverSourceDisplay: 'Nav Dock panel',
	labelDefault: 'Nav',
};

export const STRINGS: Record<Lang, Strings> = { zh: ZH, en: EN };

/**
 * 探测 Obsidian 的界面语言。
 *
 * moment.locale() 反映 Obsidian 设置里的语言（'en' / 'zh-cn' 这种）。
 * Obsidian 1.14 仍捆绑 moment，但没承诺过全局暴露，所以层层兜底：
 * moment → navigator.language → 'en'。
 */
export function detectLang(): Lang {
	try {
		const m = (window as any).moment;
		const loc = m && typeof m.locale === 'function' ? String(m.locale() || '') : '';
		if (loc) return loc.toLowerCase().startsWith('zh') ? 'zh' : 'en';
	} catch (e) {
		/* 继续兜底 */
	}
	try {
		const nav = navigator.language || (navigator.languages && navigator.languages[0]) || '';
		if (nav) return nav.toLowerCase().startsWith('zh') ? 'zh' : 'en';
	} catch (e) {
		/* 继续兜底 */
	}
	return 'en';
}

/** 把设置值（可能是脏数据）解析成具体语言 */
export function resolveLang(setting: string | undefined | null): Lang {
	if (setting === 'zh' || setting === 'en') return setting;
	return detectLang();
}
