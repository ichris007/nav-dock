/*
 * 「新标签页开在哪」的判定链。
 *
 * 这一整块只在 onload 时注册两个监听（document pointerdown + workspace
 * active-leaf-change），其余都是被 openFileBeside / 链接点击路径同步调用的查询。
 *
 * ⚠ 三条实测约束（v0.10.4，用户为此报过三次「总开在左侧」）：
 *   1. markSelfActivated 必须在 revealLeaf() 【之前】入栈 —— revealLeaf 末尾的
 *      getContainer().focus() 会命中 leaf 焦点委托，同步派发 active-leaf-change；
 *   2. 命中 selfActivated 集合就跳过但【不能删】—— Obsidian 为一次激活会派发多次
 *      （revealLeaf / setActiveLeaf / openFile 各一次），第一次就删等于没拦；
 *   3. 延到下一个宏任务再解除 —— 之后用户真正切到这个叶子时不该还被拦着。
 * ⚠ getActiveMainLeaf() 必须是纯查询：早先兜底分支会顺手写 lastUserLeaf，
 *   把一次错误选择固化成长期记忆（自锁）。
 */
import { parseLinktext } from 'obsidian';

/** 本模块的方法被 Object.assign 到 NavDockPlugin.prototype，this 即插件实例。
  * 用 this: any 是因为整块都踩在 Obsidian 内部 API 上（见 shims.ts）——
  * 标死类型只会得到一堆 as any 的假类型，真正的保障是 asar 逆向 + headless 实测。 */
export const paneMethods = {
isLiveLeaf(this: any, leaf) {
	if (!leaf || !leaf.parent) return false;
	const el = leaf.containerEl;
	if (el && el.isConnected === false) return false;

	const ws = this.app.workspace;
	if (typeof ws.isAttached === 'function' && !ws.isAttached(leaf)) return false;

	const root = typeof leaf.getRoot === 'function' ? leaf.getRoot() : null;
	if (root && (root === ws.leftSplit || root === ws.rightSplit)) return false;
	return true;
},

/** 从 DOM 元素反查它属于哪个叶子；ribbon / 标签栏 / 我们的浮层都不算 */
leafFromEl(this: any, el) {
	if (!el || typeof el.closest !== 'function') return null;
	if (!el.closest('.workspace-leaf')) return null;
	let found = null;
	this.app.workspace.iterateAllLeaves((leaf) => {
		if (found) return;
		const c = leaf.containerEl;
		if (c && c.contains(el)) found = leaf;
	});
	return found;
},

/**
 * 「新标签页该开在哪」的目标叶子。
 *
 * 不能只看 workspace.activeLeaf：它会因为「我们自己调 setActiveLeaf」而漂走，
 * 一旦漂到另一个窗格，之后所有新标签页都跟着跑（实测就是这个症状）。
 * 所以第一优先用 lastUserLeaf —— 用户真正用鼠标点过的那一格，我们自己的
 * 激活动作不会改它。
 *
 * ⚠ 这个函数必须是【纯查询】，不许写 lastUserLeaf。早前每个兜底分支都顺手
 * `this.lastUserLeaf = 兜底结果`，本想省一次计算，实际制造了自锁：兜底一旦
 * 挑到左组，这个错误就被固化成长期记忆，之后再也不看 activeLeaf —— 用户报的
 * 「新标签页一直开在左侧、怎么也回不到激活窗格」最后一环就在这里。
 * lastUserLeaf 只该由两处写：pointerdown（用户真点了）和 active-leaf-change
 * （用户切了 tab，且不是我们自己激活的）。
 */
getActiveMainLeaf(this: any) {
	const ws = this.app.workspace;

	if (this.isLiveLeaf(this.lastUserLeaf)) return this.lastUserLeaf;

	if (this.isLiveLeaf(ws.activeLeaf)) { this.lastUserLeaf = ws.activeLeaf; return ws.activeLeaf; }

	// 兜底 1：DOM 里标了 mod-active 的叶子（setActiveLeaf 会加这个类）
	const activeEl = document.querySelector('.workspace-leaf.mod-active');
	if (activeEl) {
		let fromDom = null;
		ws.iterateAllLeaves((leaf) => {
			if (!fromDom && leaf.containerEl === activeEl) fromDom = leaf;
		});
		if (this.isLiveLeaf(fromDom)) return fromDom;
	}

	// 兜底 2：最近使用的主区域叶子
	if (typeof ws.getMostRecentLeaf === 'function') {
		const recent = ws.getMostRecentLeaf();
		if (this.isLiveLeaf(recent)) return recent;
	}

	// 兜底 3：扫全部主区域叶子，取 activeTime 最大的
	let best: any = null;
	ws.iterateAllLeaves((leaf) => {
		if (!this.isLiveLeaf(leaf)) return;
		if (!best || (leaf.activeTime || 0) > (best.activeTime || 0)) best = leaf;
	});
	return best;
},


/**
 * 在 leaf 所在标签组的当前 tab 右侧新建一个 tab。
 * createLeafInTabGroup 是内部 API（1.14.4 实证存在：找组内 activeTime 最大的
 * 子项，insertChild(n + 1) 插到它右边），调用失败就退回 Obsidian 的默认行为。
 */
createTabBeside(this: any, leaf) {
	const ws = this.app.workspace;
	const group = leaf && leaf.parent;
	if (group && typeof ws.createLeafInTabGroup === 'function') {
		try {
			return ws.createLeafInTabGroup(group);
		} catch (e) {
			/* 内部 API 变动就往下走兜底 */
		}
	}
	return ws.getLeaf('tab');
},

/**
 * 找已经打开该文件的叶子。命中多个时：优先同一个标签组（用户视线所在），
 * 其次最近激活过的那个。
 */
findOpenLeaf(this: any, file) {
	if (!file) return null;

	const matches: any[] = [];
	this.app.workspace.iterateAllLeaves((leaf) => {
		const view = leaf.view;
		if (!view || !view.file || view.file.path !== file.path) return;
		matches.push(leaf);
	});
	if (!matches.length) return null;

	const ref = this.getActiveMainLeaf();
	const refGroup = ref && ref.parent;
	const sameGroup = refGroup && matches.find((leaf) => leaf.parent === refGroup);
	if (sameGroup) return sameGroup;

	return matches.reduce((a, b) => ((b.activeTime || 0) > (a.activeTime || 0) ? b : a));
},

/** 激活一个已经打开的叶子；带锚点时顺便滚到对应标题 */
activateLeaf(this: any, leaf, file, subpath) {
	const ws = this.app.workspace;
	// 先入栈再动：revealLeaf 内部的 selectTab / getContainer().focus() 会
	// 同步派发 active-leaf-change，标记晚了就漏放行。
	this.markSelfActivated(leaf);
	// revealLeaf：展开被折叠的分栏、切到该 tab、加载延迟视图（返回 Promise，别让它冒泡）
	if (typeof ws.revealLeaf === 'function') {
		try {
			const p = ws.revealLeaf(leaf);
			if (p && typeof p.catch === 'function') p.catch(() => {});
		} catch (e) {
			/* 忽略：reveal 失败也不影响下面的激活 */
		}
	}

	ws.setActiveLeaf(leaf, { focus: true });

	if (subpath && file) leaf.openFile(file, { active: true, eState: { subpath } });
},

/**
 * 登记「这个叶子是我们自己激活的」，active-leaf-change 认出来就跳过。
 *
 * 为什么不「事件来了就删」：Obsidian 为一次激活会派发多次 active-leaf-change
 * （revealLeaf 里的 focus 委托一次、setActiveLeaf 一次、openFile 再一次），
 * 第一次就删会导致后面几次漏放行。
 * 为什么不永久留着：用户之后真正切到这个叶子时不该还被拦着。
 * 所以延到下一个宏任务再解除 —— 我们自己造成的几次派发都发生在同一轮
 * 调用栈里（Events.trigger 是同步的），之后用户的真实切换远晚于它。
 */
markSelfActivated(this: any, leaf) {
	if (!leaf) return;
	if (this.selfActivated.size > 32) this.selfActivated.clear();
	this.selfActivated.add(leaf);
	window.setTimeout(() => { this.selfActivated.delete(leaf); }, 0);
},

/**
 * 打开文件：已经开着就跳过去，不重复开 tab；没开才在当前窗格当前 tab 右侧新开。
 */
openFileBeside(this: any, file, subpath) {
	const existing = this.findOpenLeaf(file);
	if (existing) {
		this.activateLeaf(existing, file, subpath);
		return existing;
	}
	const leaf = this.createTabBeside(this.getActiveMainLeaf());
	// openFile({active:true}) 会让 Obsidian 激活这个新叶子，同样不算用户选择
	this.markSelfActivated(leaf);
	leaf.openFile(file, { active: true, eState: subpath ? { subpath } : {} });
	return leaf;
},

/** 把 [[链接]] 拆成 {file, subpath}；解析不到文件时 file 为 null */
resolveLinkTarget(this: any, href) {
	const parsed =
		typeof parseLinktext === 'function'
			? parseLinktext(href)
			: { path: href, subpath: '' };
	const file = this.app.metadataCache.getFirstLinkpathDest(
		parsed.path,
		this.currentFilePath || ''
	);
	return { file, subpath: parsed.subpath || '' };
},
};
