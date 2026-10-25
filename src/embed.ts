/*
 * 可编辑嵌入：浮层内容用 app.embedRegistry 的 MarkdownEmbed（editable）承载，
 * 点一下就能在原地编辑并自动存盘，和主窗口里点 ![[笔记]] 是同一套东西。
 *
 * 三个坑（都实测过）：
 *   1. Component.removeChild(c) 【不调】 c.unload()，卸载嵌入必须先 embed.unload()；
 *   2. showPreview(true) 才会 save(doc, true) 强制写盘，不带 true 会丢未到 2s 防抖的改动；
 *   3. showPreview 会把 inlineTitleEl / metadataEditor prepend 到 renderer.header.el，
 *      所以样式选择器不能用 >。
 */
import { MarkdownRenderer, Scope } from 'obsidian';
import { isNonEditableTarget } from './constants';

export const embedMethods = {
/* ---------- 渲染：可编辑嵌入，失败回退只读 ---------- */

/**
 * 把导航文档渲染进浮层。
 *
 * 优先用 Obsidian 自己的嵌入（`app.embedRegistry`）而不是 MarkdownRenderer：
 * 前者带 `editable` / `showEditor()`，点一下就能在浮层里原地编辑、自动存盘，
 * 和主窗口里点 `![[笔记]]` 是同一套东西。`embedRegistry` 不在公开 d.ts 里，
 * 所以整条路径都套 try/catch —— 拿不到就退回只读渲染，不影响打开。
 */
async renderPanelContent(this: any, sizer, file) {
	if (this.mountEmbed(sizer, file)) {
		try {
			await this.embed.loadFile();
			return;
		} catch (err) {
			console.error('[nav-dock] 可编辑嵌入加载失败，回退只读渲染', err);
			this.teardownEmbed();
			sizer.empty();
		}
	}

	try {
		const markdown = await this.app.vault.cachedRead(file);
		await MarkdownRenderer.render(this.app, markdown, sizer, file.path, this.renderComponent);
	} catch (err) {
		console.error('[nav-dock] 渲染失败', err);
		sizer.empty();
		sizer.createDiv({ cls: 'nav-dock-error', text: '渲染失败，请检查文档内容。' });
	}
},

/**
 * 用 embedRegistry 建一个 Markdown 嵌入挂进 sizer，返回是否成功。
 *
 * 1.14.4 实证：`getEmbedCreator(file)` 返回 `(ctx, file, subpath) => embed`，
 * ctx 需要 `{app, containerEl, linktext, sourcePath, depth, state}`；
 * 返回的实例（内部类 MarkdownEmbed）继承 Component，构造时就建好
 * previewEl / editorEl，`editable` 默认 false（阅读模式里的嵌入是只读的）。
 */
mountEmbed(this: any, containerEl, file) {
	const registry = this.app.embedRegistry;
	if (!registry || typeof registry.getEmbedCreator !== 'function') return false;

	try {
		const creator = registry.getEmbedCreator(file);
		if (!creator) return false;

		const ctx = {
			app: this.app,
			containerEl,
			linktext: file.path,
			sourcePath: file.path,
			depth: 0,
			state: null,
		};
		const embed = creator(ctx, file, '');
		if (!embed || typeof embed.loadFile !== 'function') return false;

		embed.editable = true;
		// 挂到 renderComponent 下，关窗时随它一起 unload
		this.renderComponent.addChild(embed);
		this.embed = embed;
		return true;
	} catch (err) {
		console.error('[nav-dock] 创建可编辑嵌入失败', err);
		return false;
	}
},

/** 卸掉嵌入并把引用清干净（回退渲染、关窗都要走） */
teardownEmbed(this: any) {
	const embed = this.embed;
	if (!embed) return;
	this.embed = null;
	// 必须显式 unload：Component.removeChild 只是从子列表里摘掉，
	// 不会调 unload，编辑器实例和它注册的事件监听会留在那儿
	try {
		embed.unload();
	} catch (e) {
		/* 已经卸载过就算了 */
	}
	if (this.renderComponent) {
		try {
			this.renderComponent.removeChild(embed);
		} catch (e) {
			/* 还没挂上就算了 */
		}
	}
	this.popEditScope();
},

/* ---------- 编辑态 ---------- */

isEditing(this: any) {
	return !!(this.embed && this.embed.editMode);
},

/**
 * 预览态点正文 → 进编辑。
 *
 * 排除链接、按钮、输入框、可折叠指示器和「拖选文字」：这些要么是原本的
 * 点击行为，要么是用户想复制内容，都不该切编辑。
 */
handleBodyClick(this: any, evt) {
	if (!this.embed || this.isEditing()) return;
	if (evt.button !== 0 || evt.shiftKey || evt.defaultPrevented) return;
	if (isNonEditableTarget(evt.target)) return;

	// 拖选了一段文字：用户是想复制，不是想编辑
	const sel = window.getSelection();
	if (sel && !sel.isCollapsed && sel.anchorNode && this.panelEl && this.panelEl.contains(sel.anchorNode)) {
		return;
	}

	this.enterEditing();
},

enterEditing(this: any) {
	if (!this.embed || this.isEditing()) return;
	this.cancelClose();
	try {
		this.embed.showEditor();
	} catch (err) {
		console.error('[nav-dock] 进入编辑失败', err);
		return;
	}
	// 编辑器的快捷键（方向键、Cmd+A 等）要进 keymap 作用域才生效，
	// 否则会被 Obsidian 全局键位吃掉。做法与原生预览浮层一致。
	this.pushEditScope();
	if (this.panelEl) this.panelEl.addClass('is-editing');
},

/**
 * 退出编辑并存盘。
 *
 * `showPreview(true)` 内部会 `destroyEditor(true)` → 取编辑器当前文档 →
 * `save(text, true)` 强制写盘。不带 true 的话未到 2 秒防抖的改动会丢。
 */
exitEditing(this: any) {
	if (!this.isEditing()) return;
	try {
		this.embed.showPreview(true);
	} catch (err) {
		console.error('[nav-dock] 退出编辑失败', err);
	}
	this.popEditScope();
	if (this.panelEl) this.panelEl.removeClass('is-editing');
},

pushEditScope(this: any) {
	if (this.editScope) return;
	try {
		const scope = new Scope(this.app.scope);
		// Esc：退出编辑并保存。返回 false 表示不拦截后续处理
		scope.register([], 'Escape', () => {
			this.exitEditing();
			return false;
		});
		this.app.keymap.pushScope(scope);
		this.editScope = scope;
	} catch (err) {
		/* Scope 不可用时不影响编辑本身，只是 Esc 不生效 */
	}
},

popEditScope(this: any) {
	if (!this.editScope) return;
	const scope = this.editScope;
	this.editScope = null;
	try {
		this.app.keymap.popScope(scope);
	} catch (err) {
		/* 忽略 */
	}
},
};
