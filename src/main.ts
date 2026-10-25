/*
 * Nav Dock —— 鼠标悬停 ribbon 图标，在图标右侧弹出指定 Markdown 文档的浮层。
 *
 * 设计要点：
 * 1. 浮层挂在 document.body 下、position: fixed，位置由 ribbon 图标的实际
 *    getBoundingClientRect() 算出。这样无论左侧栏是固定还是悬浮（hover-ribbon /
 *    hover-sidedock），浮层都贴着图标边缘，不会错位。
 * 2. 内容容器套 .markdown-preview-view.markdown-rendered，直接复用主题的正文排版
 *    （字体、行距、标题、引用块、callout 全部跟正文一致），不另起一套样式。
 * 3. 悬停触发：图标与浮层之间隔着 gap，鼠标穿过空隙时会先触发图标的 mouseleave，
 *    所以收起走「延迟 + 进出取消」——进入浮层即撤销收起。
 * 4. 右下角拖拽改尺寸：左上角固定、右下角跟手，尺寸写回设置，下次打开沿用。
 * 5. 可编辑：内容用 embedRegistry 的 MarkdownEmbed 承载，点一下就地编辑、自动存盘。
 *
 * 模块划分（按关注点，方法经 Object.assign 挂到原型，this 即插件实例）：
 *   pane.ts       「新标签页开在哪」的判定链
 *   embed.ts      可编辑嵌入（挂载/卸载/进出编辑态）
 *   preview.ts    双链悬停预览，以及它和主浮层的收场博弈
 *   panel.ts      浮层 DOM：定位/尺寸/拖拽/关闭/链接接管
 *   lifecycle.ts  onunload、设置读写、ribbon、命令与 URI
 *   settings-tab.ts / file-suggest.ts / icon-picker.ts   设置页
 *   shims.ts      Obsidian 内部 API 的集中适配层（都不在 obsidian.d.ts 里）
 */
import { Plugin } from 'obsidian';
import type { NavDockSettings } from './constants';
import type { Lang } from './i18n';
import { paneMethods } from './pane';
import { embedMethods } from './embed';
import { previewMethods } from './preview';
import { panelMethods } from './panel';
import { lifecycleMethods } from './lifecycle';
import { NavDockSettingTab } from './settings-tab';
import type { HoverParentLike, MarkdownEmbedLike } from './shims';

class NavDockPlugin extends Plugin {
	settings!: NavDockSettings;

	// ---- 界面语言（i18n.ts）----
	uiLang: Lang = 'zh';           // loadSettings 时按 settings.language 定；setLanguage 时改
	cmdToggle: any = null;         // addCommand 的返回值，留着改 name（切语言即时生效）
	cmdOpenInTab: any = null;

	// ---- 浮层状态 ----
	panelEl: HTMLElement | null = null;
	renderComponent: any = null;
	closeTimer: number | null = null;
	resizing = false;
	lastWarnAt = 0;
	pinned = false;            // 快捷键/命令打开时固定，不随鼠标离开收起
	currentFilePath = '';      // 浮层渲染时用的 sourcePath，openLinkText 需要
	placement: 'dock' | 'center' = 'dock';
	backdropEl: HTMLElement | null = null;
	ribbonEl: HTMLElement | null = null;

	// ---- 窗格判定（pane.ts 用）----
	lastUserLeaf: any = null;  // 用户最后一次用鼠标点过的主区域叶子
	selfActivated: Set<any> = new Set();

	// ---- 双链悬停预览（preview.ts 用）----
	hoverParent: HoverParentLike | null = null;
	hoverSourceRegistered = false;
	lastPointer: { x: number | null; y: number | null } = { x: null, y: null };
	popoverSeenAt = 0;

	// ---- 可编辑嵌入（embed.ts 用）----
	embed: MarkdownEmbedLike | null = null;
	editScope: any = null;

	async onload() {
		await this.loadSettings();

		// 追踪鼠标位置：判断「该不该收」不能只看预览浮层在不在 ——
		// 它在进编辑、尺寸变化、鼠标微动时都可能被 Obsidian 自己收掉，
		// 那时鼠标其实还停在原地，浮层不该跟着消失。
		this.registerDomEvent(
			document,
			'pointermove',
			(evt) => {
				this.lastPointer.x = evt.clientX;
				this.lastPointer.y = evt.clientY;
			},
			true
		);

		// 让 Obsidian 的「页面预览」认识我们的浮层：注册一个 hover 来源，
		// defaultMod = false 表示不用按 Cmd，悬停即预览。
		this.registerHoverSource();

		// label 为空（没自定义过）时用当前语言的默认提示
		this.ribbonEl = this.addRibbonIcon(
			this.settings.icon,
			this.settings.label || this.uiStrings().labelDefault,
			() => {
				if (this.panelEl) {
					this.closePanel();
					return;
				}
				// 图标触发的浮层一律贴 ribbon；点击模式下固定住
				// void：回调是同步签名，openPanel 的失败已在内部处理，这里显式忽略 Promise
				void this.openPanel({
					pinned: this.settings.trigger === 'click',
					placement: 'dock',
				});
			}
		);
		this.ribbonEl.addClass('nav-dock-ribbon');

		// 悬停即展开（仅悬停模式）
		this.registerDomEvent(this.ribbonEl, 'mouseenter', () => {
			if (this.settings.trigger !== 'hover') return;
			this.cancelClose();
			this.openByHover();
		});
		this.registerDomEvent(this.ribbonEl, 'mouseleave', () => {
			if (this.settings.trigger !== 'hover') return;
			this.scheduleClose();
		});

		// 命令名走当前语言；存下命令对象，切语言时改 name 即可即时生效
		// （Obsidian 命令面板每次打开都从命令对象读 name）
		const S = this.uiStrings();
		this.cmdToggle = this.addCommand({
			id: 'toggle',
			name: S.cmdToggle,
			callback: () => this.togglePinned(),
		});

		this.cmdOpenInTab = this.addCommand({
			id: 'open-in-tab',
			name: S.cmdOpenInTab,
			callback: () => this.openInTab(),
		});

		// 「用户在哪一格工作」用鼠标按下位置来记，比 activeLeaf 可靠：
		// activeLeaf 会被我们自己调 setActiveLeaf 改掉，一改就污染后续所有判断。
		this.registerDomEvent(
			document,
			'pointerdown',
			(evt) => {
				const leaf = this.leafFromEl(evt.target);
				if (leaf && this.isLiveLeaf(leaf)) this.lastUserLeaf = leaf;
			},
			true
		);

		// 用户切标签页 / 用快速切换打开文件时，activeLeaf 会变，这里跟上。
		// 但我们自己激活别处窗格的叶子要排除，否则一次「点已打开的文档」就把
		// 用户所在的窗格记忆永久挪走，之后所有新标签页都跟着跑。
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', (leaf: any) => {
				if (!leaf) return;
				// 命中就不更新，但【不删除】—— Obsidian 为一次激活会派发多次
				// （revealLeaf 一次、setActiveLeaf 一次、openFile 再一次），
				// 删早了第二次就漏放行。解除时机见 markSelfActivated。
				if (this.selfActivated.has(leaf)) return;
				if (this.isLiveLeaf(leaf)) this.lastUserLeaf = leaf;
			})
		);

		// URI 入口：obsidian://nav-dock?action=toggle / open-in-tab
		// 方便在笔记里放链接，或用 meta-bind 之类的插件做按钮
		this.registerObsidianProtocolHandler('nav-dock', (params) => {
			if (params && params.action === 'open-in-tab') this.openInTab();
			else this.togglePinned();
		});

		this.addSettingTab(new NavDockSettingTab(this.app, this as any));

		// ESC 分级退。capture 阶段抢在 Obsidian 自己的 ESC 处理之前，避免同时关掉别的弹窗。
		// 顺序：预览在编辑 → 退预览编辑；预览还在 → 只收预览；
		//       主浮层在编辑 → 退主浮层编辑；最后才收主浮层。
		// 以前是一把 closePanel()，按一次 ESC 预览和主浮层同时消失。
		this.registerDomEvent(document, 'keydown', (evt) => {
			if (evt.key !== 'Escape' || !this.panelEl) return;

			const pop = this.hoverParent && this.hoverParent.hoverPopover;
			const pe = pop && pop.embed;

			if (pe && pe.editMode) {
				this.swallowEscape(evt);
				try {
					pe.showPreview(true);   // true = 强制存盘
				} catch {
					/* 忽略 */
				}
				return;
			}
			if (pop) {
				this.swallowEscape(evt);
				this.dismissHoverPreview();
				return;
			}
			if (this.isEditing()) {
				this.swallowEscape(evt);
				this.exitEditing();
				return;
			}
			this.swallowEscape(evt);
			this.closePanel('esc');
		}, true);

		// 点击浮层与图标以外的任何地方都关闭。
		// 图标本身要排除：它的 click 有自己的语义，若这里先关掉会变成「点了没反应」。
		this.registerDomEvent(document, 'mousedown', (evt) => {
			if (!this.panelEl || this.resizing) return;
			const target = evt.target as Element;
			if (this.panelEl.contains(target)) return;
			if (this.ribbonEl && this.ribbonEl.contains(target)) return;
			// 双链预览浮层挂在 document.body 上、不在本浮层里，但它是本浮层
			// 唤出的「二级窗口」：在这里按下必须当成「还在本浮层里」。
			// 否则预览一出现就被收掉，且 closePanel 会顺手 hide 掉预览 ——
			// 表现为「点预览窗口，它直接消失、根本进不了编辑」。
			// 注意 mousedown 早于 click，这里不放过，后面的点击接管就没机会跑。
			if (this.isInsideHoverPopover(target)) return;
			// 点在预览外面：先撤掉点击接管时打的 isFocused 钉子。那根钉子
			// 是永久的，不撤的话 Obsidian 原生的收场路径（window click 的
			// hide 分支）失效，预览会一直挂在屏幕上。
			this.unpinHoverPreview();
			this.closePanel();
		}, true);

		// 窗口尺寸变化时重新贴合图标
		this.registerDomEvent(window, 'resize', () => this.reposition());
	}
}

/* ---------- 把各关注点的方法挂到原型 ----------
 * 这样 `this.xxx` 一行都不用改，主类公开面（settings / lastUserLeaf / embed /
 * closePanel / isEditing / scheduleClose）也完全不变 —— _test 里的探针零改动。
 * 顺序无所谓：各模块方法名不重叠。
 * ⚠ interface 的 extends 不接受 typeof 查询（TS1109），先取成类型别名。 */
type PaneMethods = typeof paneMethods;
type EmbedMethods = typeof embedMethods;
type PreviewMethods = typeof previewMethods;
type PanelMethods = typeof panelMethods;
type LifecycleMethods = typeof lifecycleMethods;

interface NavDockPlugin
	extends PaneMethods,
		EmbedMethods,
		PreviewMethods,
		PanelMethods,
		LifecycleMethods {}

Object.assign(
	NavDockPlugin.prototype,
	paneMethods,
	embedMethods,
	previewMethods,
	panelMethods,
	lifecycleMethods
);

// 用 export = 而不是 export default：esbuild 对「只有 default 导出」的入口也会包
// 一层 __toCommonJS（module.exports.default 才是类），而 Obsidian 插件加载器和
// _test 探针都直接取 module.exports。export = 让 esbuild 原样透传
// module.exports = NavDockPlugin。interface 合并因此不能挂在 class 声明上，
// 所以类声明保持裸形式，导出放最后。
export = NavDockPlugin;
