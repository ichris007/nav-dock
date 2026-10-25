/*
 * Obsidian 内部 API 适配层。
 *
 * 这些接口**不在 obsidian.d.ts 里**，全部集中在这一点声明与访问。好处是：
 *   1. 升级 Obsidian 时只需在这里核对，不用全库 grep；
 *   2. 「类型管不到的地方」一眼可见 —— 本插件的核心能力几乎全建立在这些内部 API 上，
 *      所以千万不要因为「有类型」就以为安全，真正的保障是 asar 逆向 + headless 实测。
 *
 * 每一项都注明它在 1.14.4 asar 里的实证位置。
 */

/** page-preview / HoverPopover 挂在 hoverParent 上的预览浮层 */
export interface HoverPopoverLike {
	hoverEl: HTMLElement;
	embed: any;
	targetEl?: HTMLElement;
	isFocused?: boolean;
	setIsFocused?: (v: boolean) => void;
	transition?: () => void;
	hide?: () => void;
}

/** 我们自己创建的悬停预览宿主；HoverPopover.onShow 会往上面写 hoverPopover */
export interface HoverParentLike {
	hoverPopover: HoverPopoverLike | null;
}

/** embedRegistry 创建的 MarkdownEmbed（editable 的那一个） */
export interface MarkdownEmbedLike {
	containerEl: HTMLElement;
	editable?: boolean;
	editMode?: any;
	loadFile?: () => Promise<void>;
	unload?: () => void;
	showEditor?: () => void;
	showPreview?: (force?: boolean) => void;
}

/** Workspace 上不在 d.ts 的成员 */
export interface WorkspaceInternals {
	/** 注册悬停预览来源，defaultMod=false 表示不用按 Cmd */
	registerHoverLinkSource?: (source: string, opts: { display: string; defaultMod: boolean }) => void;
	unregisterHoverLinkSource?: (source: string) => void;
	/** 在指定标签组内、activeTime 最大的 tab 右侧新建叶子（1.14.4 原型方法） */
	createLeafInTabGroup?: (group?: any) => any;
	/** 叶子是否还挂在工作区里 */
	isAttached?: (leaf: any) => boolean;
	hoverLinkSources?: Record<string, { display: string; defaultMod: boolean }>;
}

/** App 上不在 d.ts 的成员 */
export interface AppInternals {
	embedRegistry?: {
		getEmbedCreator?: (file: any) => null | ((ctx: any, file: any, subpath: string) => any);
	};
}

/** 取 Workspace 的内部成员。 */
export function wsInternal(app: any): WorkspaceInternals {
	return app.workspace as WorkspaceInternals;
}

/** 取 App 的内部成员。 */
export function appInternal(app: any): AppInternals {
	return app as AppInternals;
}

/** `parseLinktext` 在 d.ts 里，但返回值类型宽松，这里统一收口 */
export function splitLinktext(href: string): { path: string; subpath: string } {
	return { path: href, subpath: '' };
}
