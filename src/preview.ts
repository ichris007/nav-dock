/*
 * 双链悬停预览，以及它和主浮层的收场博弈。
 *
 * 背景：浮层挂在 document.body 下，Obsidian 的 hover-link 委托会因 belongsToMe
 * 失败而丢弃事件，所以预览要自己 trigger('hover-link')；而预览浮层是挂在 body 上的
 * 「二级窗口」，主浮层的「点外面就关」必须把它当成自己人，否则一出现就被收掉。
 *
 * 收场三层判定（isStillInUse）：鼠标在 panel/预览内，或键盘焦点在预览编辑器里。
 * ⚠ 两条都不能只看「预览还活着」：我们点进去时 setIsFocused(true) 把它钉住了，
 *   它不会因鼠标离开而自己消失 —— 只判存活会让两扇窗永远不收起（v0.10.3 用户三连报）。
 */
import { CLOSE_DELAY, HOVER_GRACE, HOVER_SOURCE, isNonEditableTarget } from './constants';

export const previewMethods = {
/**
 * 悬停双链 → 借 Obsidian 自己的「页面预览」弹预览浮层。
 *
 * 为什么必须自己 trigger：预览的悬停和点击一样走 workspace 上的事件委托，
 * 委托里 `belongsToMe(el, containerEl)` 一路往上找 containerEl，中途撞到
 * `.markdown-preview-view` 就 return false。本浮层的正文容器正好带着这个类
 * （为了复用主题排版），且整扇窗挂在 document.body 下、不在 .workspace 里，
 * 所以原生委托必然丢弃。手动 trigger `hover-link` 就绕开了这一层。
 */
handlePanelLinkHover(this: any, evt) {
	// 编辑态里没有链接元素，多一层判断免得出意外
	if (this.isEditing()) return;
	const panel = this.panelEl;
	const target = evt.target;
	if (!panel || !target || typeof target.closest !== 'function') return;

	const link = target.closest('a.internal-link');
	if (!link || !panel.contains(link)) return;

	// 在链接内部的 <span> 之间移动也会冒泡 mouseover，不算重新进入
	if (evt.relatedTarget && link.contains(evt.relatedTarget)) return;

	const href = link.getAttribute('data-href') || link.getAttribute('href') || '';
	if (!href) return;
	// 文档内锚点（#标题）预览的是同一篇，没意义
	if (href.startsWith('#')) return;

	const hp = this.hoverParent;
	if (!hp) return;
	// 同一个链接已经在预览，交给 HoverPopover 自己管，别重复创建
	if (hp.hoverPopover && hp.hoverPopover.targetEl === link) return;

	this.app.workspace.trigger('hover-link', {
		event: evt,
		source: HOVER_SOURCE,
		hoverParent: hp,
		targetEl: link,
		linktext: href,
		sourcePath: this.currentFilePath || '',
	});

	this.armPopoverGuard(hp);
},

/**
 * 等预览浮层出现，然后接管它的点击。
 *
 * 为什么要接管：原生给预览浮层挂的点击逻辑（HoverPopover.create 里的 XE）
 * 依赖 `workspace.activeEditor` 的切换来进编辑，而浮层会不会被
 * `transition()` 判成「鼠标离开」又取决于 `isFocused`。两者在某些状态下
 * 对不上 —— 实测表现为「导航浮层没点过时，点预览内容浮层直接消失」。
 * 与其猜内部状态的组合，不如在 capture 阶段自己接管：
 *   1. preventDefault → 原生那个 window click 处理器看到 defaultPrevented
 *      就跳过 `hoverEl.hide()`（源码：`e.defaultPrevented || h.contains(...) || u.hide()`）
 *   2. 显式 showEditor() + setIsFocused(true) → 进编辑且把浮层钉住
 */
armPopoverGuard(this: any, hoverParent) {
	const hp = hoverParent;
	if (!hp) return;

	// 浮层是 `sleep(waitTime - 100)`（约 200ms）之后才 append 到 body 的
	const wait = (tries) => {
		if (this.hoverParent !== hp) return;   // 已经换了一扇窗，别挂到旧的上面
		const pop = hp.hoverPopover;
		if (pop && pop.hoverEl) {
			this.bindPopoverGuard(pop);
			return;
		}
		if (tries >= 40) return;               // 最多等 4 秒
		window.setTimeout(() => wait(tries + 1), 100);
	};
	wait(0);
},

bindPopoverGuard(this: any, pop) {
	const el = pop.hoverEl;
	if (!el || el.__navDockGuard) return;
	el.__navDockGuard = true;
	// 预览刚出现，用户视线正在它上面 —— 算一次「在用」，
	// 宽限期从这个时刻起算（不能按「预览还活着」算，见 isStillInUse）
	this.popoverSeenAt = Date.now();

	el.addEventListener(
		'click',
		(evt) => {
			const embed = pop.embed;
			if (!embed || !embed.editable) return;
			if (embed.editMode) return;            // 已经在编辑，交给编辑器
			if (evt.button !== 0 || evt.shiftKey) return;
			if (isNonEditableTarget(evt.target)) return;

			// 拖选文字是在复制，不是要编辑
			const sel = window.getSelection();
			if (sel && !sel.isCollapsed && sel.anchorNode && el.contains(sel.anchorNode)) return;

			evt.preventDefault();
			evt.stopPropagation();

			try {
				// 顺序很重要：先把浮层钉住，再开编辑器。
				// showEditor() 会 previewEl.hide() / editorEl.show()，DOM 一换
				// 浏览器可能补发 mouseout，那时若 isFocused 还是 false，
				// transition() 就把浮层判成「鼠标离开」直接收掉。
				if (typeof pop.setIsFocused === 'function') pop.setIsFocused(true);
				// 已经在淡出（Hiding）的话拉回来
				if (typeof pop.transition === 'function') pop.transition();

			embed.showEditor();
			// 把键盘焦点真正送进编辑器：Obsidian 的 shouldShowSelf() 有
			// `hoverEl.contains(activeElement)` 这一条，焦点落进来浮层才钉得住，
			// 我们那颗 isFocused 钉子只是兜底（且必须能撤，见 unpinHoverPreview）。
			if (embed.editMode && typeof embed.editMode.focus === 'function') {
				try {
					embed.editMode.focus();
				} catch (e) {
					/* 忽略 */
				}
			}
			// 编辑模式销毁（切回预览）时收掉浮层，和原生行为一致
			if (embed.editMode && typeof embed.editMode.register === 'function') {
				embed.editMode.register(() => pop.hide());
			}
		} catch (err) {
			console.error('[nav-dock] 预览浮层进入编辑失败', err);
		}
		},
		true
	);
},

/**
 * 某个元素是否落在双链预览浮层内部。
 *
 * 预览浮层挂在 document.body 上、不在本浮层的 DOM 里，所有「点在
 * 外面就关」的判断都要把它算进来，否则一碰到预览就误关。
 */
isInsideHoverPopover(this: any, el) {
	const hp = this.hoverParent;
	const pop = hp && hp.hoverPopover;
	const hoverEl = pop && pop.hoverEl;
	if (!hoverEl || !el) return false;
	if (hoverEl === el) return true;
	return typeof el.closest === 'function' && hoverEl.contains(el);
},

/**
 * 收掉双链预览浮层（先 flush 再 hide）。
 *
 * 它挂在 document.body 上，不会随本浮层销毁，必须手动收。收之前先
 * flush：预览里的嵌入也可能正在编辑（Obsidian 给它的 embed 设了
 * editable），直接 hide 会把没落盘的改动丢掉。
 */
dismissHoverPreview(this: any) {
	const hp = this.hoverParent;
	const pop = hp && hp.hoverPopover;
	if (!pop) return;
	const pe = pop.embed;
	if (pe && pe.editMode && typeof pe.showPreview === 'function') {
		try {
			pe.showPreview(true);   // true = 强制存盘
		} catch (e) {
			/* 忽略 */
		}
	}
	// 撤掉我们点进去时打的钉子，别让下一个浮层继承这个状态
	this.unpinHoverPreview();
	if (typeof pop.hide === 'function') {
		try {
			pop.hide();
		} catch (e) {
			/* 忽略：hide 内部已经改过 DOM 时可能抛错 */
		}
	}
},

/**
 * 撤掉点击预览时设的 `isFocused` 钉子。
 *
 * 那根钉子是为了挡住 `showEditor()` 换 DOM 时补发的 mouseout，但它
 * 是**永久**的：一旦钉上，Obsidian 自己的收场路径（鼠标离开走
 * `transition()`、点外面走 window click 的 hide 分支）全部失效 ——
 * 表现为「预览点进去之后就再也不消失，挡在那儿影响别的操作」。
 * 所以只要判定「用户不在用它了」就必须撤。
 */
unpinHoverPreview(this: any) {
	const hp = this.hoverParent;
	const pop = hp && hp.hoverPopover;
	if (pop && typeof pop.setIsFocused === 'function') {
		try {
			pop.setIsFocused(false);
		} catch (e) {
			/* 忽略 */
		}
	}
},

/** ESC 自己处理掉，别让 Obsidian 的全局键位再关一层 */
swallowEscape(this: any, evt) {
	try {
		evt.preventDefault();
		evt.stopPropagation();
	} catch (e) {
		/* 忽略 */
	}
},

/**
 * 本浮层 / 双链预览浮层是否还在被用，命中就刷新 `popoverSeenAt`。
 *
 * 「在用」= 鼠标在两者之一的矩形内（isPointerInside 按坐标判，覆盖
 * hoverEl），或键盘焦点落在预览的编辑器里（= 正在编辑）。
 *
 * 为什么不能只看「预览还活着」：我们点进去时会 setIsFocused(true) 把
 * 预览钉住，它不会因鼠标离开而自己消失。只判存活 ⇒ 用户鼠标移开、去
 * 操作别处，两扇窗永远挂在屏幕上。
 *
 * 而宽限期必须按「最近一次在用」算、不能按「预览还活着」算 —— 否则
 * 被钉住的预览会一直刷新时钟，宽限永远成立，照样永不收。
 */
isStillInUse(this: any) {
	if (this.isPointerInside()) {
		this.popoverSeenAt = Date.now();
		return true;
	}
	const hp = this.hoverParent && this.hoverParent.hoverPopover;
	const el = hp && hp.hoverEl;
	if (el && el.isConnected) {
		const ae = document.activeElement;
		if (ae && el.contains(ae)) {
			this.popoverSeenAt = Date.now();
			return true;
		}
	}
	return false;
},

/**
 * 鼠标当前是否落在「本浮层」或「双链预览浮层」的矩形范围内。
 *
 * 比只看预览浮层在不在可靠：预览浮层进编辑时会 hide previewEl / show editorEl，
 * 尺寸一变就可能触发 mouseout，Obsidian 那边判定「鼠标离开」→ 收掉预览。
 * 此时鼠标其实还停在原地，用坐标判断就不会误关整扇窗。
 */
isPointerInside(this: any) {
	const p = this.lastPointer;
	if (p.x === null || p.y === null) return false;

	let el: Element | null = null;
	try {
		el = document.elementFromPoint(p.x, p.y);
	} catch (e) {
		return false;
	}
	if (!el) return false;

	if (this.panelEl && this.panelEl.contains(el)) return true;

	const hp = this.hoverParent && this.hoverParent.hoverPopover;
	if (hp && hp.hoverEl && hp.hoverEl.contains(el)) return true;

	return false;
},

/** 延迟收起；进入图标或浮层时会被 cancelClose 撤销 */
scheduleClose(this: any) {
	if (this.resizing || this.pinned) return;
	// 正在编辑：鼠标离开也不收，否则编辑到一半浮层消失
	if (this.isEditing()) return;
	// 点击模式不自动收：开与关都由用户决定
	if (this.settings.trigger !== 'hover') return;
	this.cancelClose();
	this.closeTimer = window.setTimeout(() => {
		this.closeTimer = null;

		// 鼠标还在本浮层或预览浮层上、或焦点在预览的编辑器里：不收
		if (this.isStillInUse()) {
			this.scheduleClose();
			return;
		}

		// 预览浮层刚消失：宽限一会儿。它在「点进编辑 / 尺寸变化」时会自己收，
		// 用户紧接着还要在预览里继续操作，这时把整扇窗收掉就是「点一下就没了」。
		if (this.popoverSeenAt && Date.now() - this.popoverSeenAt < HOVER_GRACE) {
			this.scheduleClose();
			return;
		}

		this.closePanel('pointer-out');
	}, CLOSE_DELAY);
},

cancelClose(this: any) {
	if (this.closeTimer) {
		window.clearTimeout(this.closeTimer);
		this.closeTimer = null;
	}
},

/** 把设置里的路径解析成 TFile；路径写不全时按文件名兜底匹配 */
};
