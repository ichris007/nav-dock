/*
 * 浮层本身的 DOM：创建、定位、尺寸、拖拽、关闭，以及内部链接的点击接管。
 *
 * 链接必须在 capture 阶段自己接管：Obsidian 1.14.4 的 internal-link 点击走委托，
 * 委托里的 belongsToMe 要求链接属于某个视图容器，而浮层挂在 document.body 下、
 * 不在 .workspace 内，归属判定失败后点击被直接丢弃。
 */
import { Notice, setIcon, Component, normalizePath, TFile } from 'obsidian';
import { MIN_WIDTH, MIN_HEIGHT, VIEWPORT_MARGIN, WARN_INTERVAL } from './constants';

export const panelMethods = {
resolveFile(this: any) {
	const raw = (this.settings.notePath || '').trim();
	if (!raw) return null;

	const clean = raw.replace(/^\/+/, '');
	const withExt = clean.toLowerCase().endsWith('.md') ? clean : `${clean}.md`;

	const direct = this.app.vault.getAbstractFileByPath(normalizePath(withExt));
	if (direct instanceof TFile) return direct;

	// 兜底：只写了文件名（如「导航」）或路径有偏差时，按 basename 找
	const basename = withExt.split('/').pop().replace(/\.md$/i, '');
	const byName = this.app.vault.getMarkdownFiles().find((f) => f.basename === basename);
	return byName || null;
},

/** 配置缺失或文件找不到时提示；悬停触发很频繁，所以做节流 */
warnOnce(this: any, message) {
	const now = Date.now();
	if (now - this.lastWarnAt < WARN_INTERVAL) return;
	this.lastWarnAt = now;
	new Notice(message);
},

async openPanel(this: any, options: any = {}) {
	const file = this.resolveFile();
	if (!file) {
		const S = this.uiStrings();
		this.warnOnce(
			this.settings.notePath
				? S.warnNoFile(this.settings.notePath)
				: S.warnNoPath
		);
		return;
	}

	this.closePanel();
	// closePanel 会把 pinned / placement 重置，所以要在它之后按本次意图重设
	this.pinned = !!options.pinned;
	this.placement = options.placement === 'center' ? 'center' : 'dock';

	const panel = document.body.createDiv({ cls: 'nav-dock-panel' });
	const S = this.uiStrings();

	// 双链悬停预览的宿主。HoverPopover 在 onShow 里会写 parent.hoverPopover，
	// 所以必须是对象；每个浮层给一个新的，避免上一扇窗的预览残留到下 一扇。
	this.hoverParent = { hoverPopover: null };

	if (this.placement === 'center') {
		panel.addClass('is-centered');
		// 轻遮罩：点击即关闭，同时挡住背景的交互，像一扇独立窗口
		this.backdropEl = document.body.createDiv({ cls: 'nav-dock-backdrop' });
		this.backdropEl.addEventListener('click', () => this.closePanel());
	}

	if (this.settings.showHeader) {
		const header = panel.createDiv({ cls: 'nav-dock-header' });
		header.createSpan({ cls: 'nav-dock-title', text: file.basename });

		// 打开方式切换：悬停 ↔ 点击
		const triggerBtn = header.createEl('button', {
			cls: 'clickable-icon nav-dock-trigger',
			attr: { 'data-tooltip-position': 'bottom' },
		});
		this.decorateTriggerButton(triggerBtn);
		triggerBtn.addEventListener('click', (evt) => {
			evt.stopPropagation();
			this.setTrigger(this.settings.trigger === 'hover' ? 'click' : 'hover');
		});

		const openBtn = header.createEl('button', {
			cls: 'clickable-icon nav-dock-open',
			attr: { 'aria-label': S.openInTabBtn, 'data-tooltip-position': 'bottom' },
		});
		setIcon(openBtn, 'external-link');
		openBtn.addEventListener('click', (evt) => {
			evt.stopPropagation();
			this.openFileBeside(file);
			this.closePanel();
		});
	}

	const body = panel.createDiv({ cls: 'nav-dock-body markdown-preview-view markdown-rendered' });
	const sizer = body.createDiv({ cls: 'markdown-preview-sizer markdown-preview-section' });

	const resizeHandle = panel.createDiv({
		cls: 'nav-dock-resize',
		attr: { 'aria-label': S.resizeHandle },
	});

	this.panelEl = panel;
	this.currentFilePath = file.path;
	this.applySize();

	// 鼠标进入浮层就撤销收起，离开则重新计时
	panel.addEventListener('mouseenter', () => this.cancelClose());
	panel.addEventListener('mouseleave', () => this.scheduleClose());

	// 悬停双链 → 弹预览
	panel.addEventListener('mouseover', (evt) => this.handlePanelLinkHover(evt));

	// 预览态点正文 → 就地进入编辑（与 Obsidian 里点嵌入笔记的行为一致）
	body.addEventListener('click', (evt) => this.handleBodyClick(evt));

	this.bindResize(panel, resizeHandle);

	// 先按空内容定位一次，避免渲染完成后才出现导致闪跳
	this.reposition();

	this.renderComponent = new Component();
	this.renderComponent.load();

	await this.renderPanelContent(sizer, file);

	// 内容高度确定后重新定位并淡入
	this.reposition();
	// 用 window.requestAnimationFrame：弹出窗口（popout window）里裸调用会绑到错误的作用域
	window.requestAnimationFrame(() => {
		panel.addClass('is-visible');
		if (this.backdropEl) this.backdropEl.addClass('is-visible');
	});

	// 内部链接必须自己接管。
	// Obsidian 1.14.4 的 internal-link 点击走委托，而委托里有一句
	// `e.belongsToMe(el, ...)` —— 要求链接属于某个视图容器。浮层挂在
	// document.body 下、不在 .workspace 内，归属判定失败，点击被直接丢弃。
	// 所以这里在 capture 阶段掐断并自己调 openLinkText。
	panel.addEventListener('click', (evt) => {
		// 编辑态里点击是在放光标 / 选词，交给编辑器自己处理
		if (this.isEditing()) return;
		const link = (evt.target as Element).closest('a.internal-link');
		if (!link) return;

		const href = link.getAttribute('data-href') || link.getAttribute('href') || '';
		if (!href) return;

		// capture 阶段先断掉，避免链接自身绑的 onClickEvent / 上层委托再处理一遍
		evt.preventDefault();
		evt.stopPropagation();

		// 文档内锚点：在浮层里滚动到对应标题，不关窗
		if (href.startsWith('#')) {
			this.scrollPanelToHeading(href.slice(1));
			return;
		}

		// 按住 Ctrl/Cmd 是「明确要求新开」，其余按设置走
		const forceNew = evt.ctrlKey || evt.metaKey;
		const newTab = forceNew || this.settings.linkOpenMode === 'new-tab';

		if (!newTab) {
			// 「当前标签页」模式：就地替换，不查重
			this.app.workspace.openLinkText(href, this.currentFilePath || '', false);
		} else {
			const { file, subpath } = this.resolveLinkTarget(href);
			// 已经开着就跳过去，别开重复的 tab（Ctrl/Cmd 除外）
			const existing = file && !forceNew ? this.findOpenLeaf(file) : null;

			if (existing) {
				this.activateLeaf(existing, file, subpath);
			} else {
				// 落在「当前激活窗格里、当前 tab 的右侧」。
				// 不用 workspace.openLinkText(..., 'tab')：它按全局 activeTime 选组，
				// 左右分屏时会跑到另一个窗格去（详见 getActiveMainLeaf 的注释）。
				const leaf = this.createTabBeside(this.getActiveMainLeaf());
				// 同上：新 tab 被激活是我们造成的，不能改 lastUserLeaf
				this.markSelfActivated(leaf);
				leaf.openLinkText(href, this.currentFilePath || '', { active: true });
			}
		}

		if (this.settings.closeOnLink) {
			// 延迟一个 tick，让跳转先落地再移除 DOM
			window.setTimeout(() => this.closePanel(), 0);
		}
	}, true);

	// 外部链接只负责按设置收起，默认行为交给浏览器
	panel.addEventListener('click', (evt) => {
		if (!this.settings.closeOnLink) return;
		if (!(evt.target as Element).closest('a.external-link')) return;
		window.setTimeout(() => this.closePanel(), 0);
	});
},

/** 浮层内滚动到指定标题（文档内 #锚点） */
scrollPanelToHeading(this: any, heading) {
	const panel = this.panelEl;
	if (!panel || !heading) return;
	for (const el of panel.querySelectorAll('[data-heading]')) {
		if (el.getAttribute('data-heading') === heading) {
			el.scrollIntoView({ block: 'start', behavior: 'smooth' });
			return;
		}
	}
},

/** 按设置应用宽高：height 为 0 时高度自适应，否则用拖拽保存的固定高度 */
applySize(this: any) {
	const panel = this.panelEl;
	if (!panel) return;

	panel.style.width = `${this.settings.width}px`;

	if (this.settings.height > 0) {
		panel.style.height = `${this.settings.height}px`;
		panel.style.maxHeight = `calc(100vh - ${VIEWPORT_MARGIN * 2}px)`;
	} else {
		// 清掉内联高度，让高度回到内容自适应。
		// ⚠ 不能直接用静态样式赋值（会被 Obsidian 审核的
		// obsidianmd/no-static-styles-assignment 判错），所以走 removeProperty。
		panel.style.removeProperty('height');
		panel.style.maxHeight = `${this.settings.maxHeightVh}vh`;
	}
},

/** 右下角拖拽：左上角固定，右下角跟手；尺寸写回设置 */
bindResize(this: any, panel, handle) {
	handle.addEventListener('mousedown', (evt) => {
		evt.preventDefault();
		evt.stopPropagation();

		this.cancelClose();
		this.resizing = true;
		panel.addClass('is-resizing');
		document.body.addClass('nav-dock-resizing');

		// 拖拽期间不受高度上限约束。内联 max-height 会压过样式表，必须先清掉；
		// 松手后由 applySize() 按新尺寸重新写回（见 onUp）。
		// ⚠ 同理不用静态样式赋值，走 removeProperty 规避审核规则。
		panel.style.removeProperty('max-height');

		const startX = evt.clientX;
		const startY = evt.clientY;
		const startRect = panel.getBoundingClientRect();
		const startW = startRect.width;
		const startH = startRect.height;

		// 左上角固定，可用空间由初始位置决定，不会越拖越跑
		const maxW = Math.max(MIN_WIDTH, window.innerWidth - startRect.left - VIEWPORT_MARGIN);
		const maxH = Math.max(MIN_HEIGHT, window.innerHeight - startRect.top - VIEWPORT_MARGIN);

		const onMove = (ev) => {
			if (!this.panelEl) return;
			const w = Math.min(Math.max(startW + ev.clientX - startX, MIN_WIDTH), maxW);
			const h = Math.min(Math.max(startH + ev.clientY - startY, MIN_HEIGHT), maxH);
			panel.style.width = `${Math.round(w)}px`;
			panel.style.height = `${Math.round(h)}px`;
		};

		const onUp = (ev) => {
			document.removeEventListener('mousemove', onMove, true);
			document.removeEventListener('mouseup', onUp, true);
			this.resizing = false;
			panel.removeClass('is-resizing');
			document.body.removeClass('nav-dock-resizing');

			if (!this.panelEl) return;

			this.settings.width = Math.round(panel.offsetWidth);
			this.settings.height = Math.round(panel.offsetHeight);
			this.saveSettings();
			// 拖拽时清掉了 max-height，这里按新尺寸重新写回（含视口上限）
			this.applySize();

			// 拖拽过程中鼠标可能已离开面板，mouseleave 被 resizing 挡掉了，这里补一次
			const rect = panel.getBoundingClientRect();
			const inside = ev.clientX >= rect.left && ev.clientX <= rect.right
				&& ev.clientY >= rect.top && ev.clientY <= rect.bottom;
			if (!inside) this.scheduleClose();
		};

		document.addEventListener('mousemove', onMove, true);
		document.addEventListener('mouseup', onUp, true);
	});
},

/** 定位：dock 贴 ribbon 图标；center 居中于视口 */
reposition(this: any) {
	const panel = this.panelEl;
	if (!panel) return;

	const vw = window.innerWidth;
	const vh = window.innerHeight;
	const w = panel.offsetWidth;
	const h = panel.offsetHeight;

	if (this.placement === 'center') {
		panel.style.left = `${Math.round((vw - w) / 2)}px`;
		panel.style.top = `${Math.round((vh - h) / 2)}px`;
		return;
	}

	if (!this.ribbonEl) return;
	const iconRect = this.ribbonEl.getBoundingClientRect();

	let left = iconRect.right + this.settings.gap;
	if (left + w > vw - VIEWPORT_MARGIN) left = Math.max(VIEWPORT_MARGIN, vw - VIEWPORT_MARGIN - w);

	let top = iconRect.top + iconRect.height / 2 - h / 2;
	top = Math.min(Math.max(top, VIEWPORT_MARGIN), Math.max(VIEWPORT_MARGIN, vh - h - VIEWPORT_MARGIN));

	panel.style.left = `${Math.round(left)}px`;
	panel.style.top = `${Math.round(top)}px`;
},

closePanel(this: any, reason?: any) {
	this.cancelClose();
	// 排查「浮层莫名消失」时用：console 里过滤 nav-dock 就能看到是谁关的
	if (reason) console.debug('[nav-dock] 关闭浮层：' + reason);

	// 编辑中关窗：先把内容强制存盘再卸载，否则未到 2 秒防抖的改动会丢
	this.exitEditing();
	this.teardownEmbed();

	// 预览浮层挂在 body 上，不会随本浮层一起销毁，必须手动收
	this.dismissHoverPreview();

	this.hoverParent = null;
	this.popoverSeenAt = 0;

	if (this.renderComponent) {
		this.renderComponent.unload();
		this.renderComponent = null;
	}
	if (this.panelEl) {
		this.panelEl.remove();
		this.panelEl = null;
	}
	if (this.backdropEl) {
		this.backdropEl.remove();
		this.backdropEl = null;
	}
	this.resizing = false;
	this.pinned = false;
	this.placement = 'dock';
	document.body.removeClass('nav-dock-resizing');
},
};
