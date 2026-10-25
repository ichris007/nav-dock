/*
 * 图标点选器（Modal）。
 *
 * 为什么不用输入框：没人记得住图标名。getIconIds() 一次给 1500+ 个，全渲染会卡，
 * 所以每批 240 个、滚到底自动续渲染，顶部搜索框按 id 子串过滤。
 */
import { Modal, getIconIds, setIcon, type App } from 'obsidian';
import type { Strings } from './i18n';

/** 类体是从 main.js 原样搬运的 JS，字段声明用 interface 合并补上（不动类体）
  * ⚠ interface 必须和 class 一样是 exported，否则合并报 TS2395 */
export interface IconPickerModal {
	current: string;
	onChoose: (id: string) => void;
	query: string;
	matches: string[];
	rendered: number;
	searchEl: HTMLInputElement;
	gridEl: HTMLElement;
	footerEl: HTMLElement;
	strings: Strings;
}

/** 图标库每批渲染多少个（图标有 1500+ 个，一次全渲染会卡） */
const ICON_PAGE = 240;

/** 图标 id 的展示名：getIconIds() 给的是 lucide-xxx，显示时去掉前缀更好读 */
export function iconDisplayName(id) {
	return String(id || '').replace(/^lucide-/, '');
}

/** 点选图标：搜索框 + 图标网格，点一下即确认。
  * strings 由调用方（设置页）按当前界面语言传入，模态框不自己探测语言 */
export class IconPickerModal extends Modal {
	constructor(app, current, onChoose, strings) {
		super(app);
		this.current = current || '';
		this.onChoose = onChoose;
		this.strings = strings;
		this.query = '';
		this.matches = [];
		this.rendered = 0;
	}

	onOpen() {
		const S = this.strings;
		const { contentEl, titleEl } = this;
		titleEl.setText(S.iconPickerTitle);
		contentEl.addClass('nav-dock-icon-picker');

		this.searchEl = contentEl.createEl('input', {
			cls: 'nav-dock-icon-search',
			type: 'text',
			attr: { placeholder: S.iconSearchPlaceholder },
		});
		this.searchEl.addEventListener('input', () => {
			this.query = this.searchEl.value;
			this.refresh();
		});
		this.searchEl.addEventListener('keydown', (evt) => {
			if (evt.key === 'Enter' && this.matches.length) {
				evt.preventDefault();
				this.pick(this.matches[0]);
			}
		});

		this.gridEl = contentEl.createDiv({ cls: 'nav-dock-icon-grid' });
		this.gridEl.addEventListener('click', (evt) => {
			const item = (evt.target as Element).closest('.nav-dock-icon-item');
			if (item && (item as HTMLElement).dataset.icon) this.pick((item as HTMLElement).dataset.icon);
		});
		// 滚到底自动续渲染下一批
		this.gridEl.addEventListener('scroll', () => {
			const el = this.gridEl;
			if (el.scrollTop + el.clientHeight >= el.scrollHeight - 80) this.renderMore();
		});

		this.footerEl = contentEl.createDiv({ cls: 'nav-dock-icon-footer' });

		this.refresh();
		this.searchEl.focus();
	}

	/** 按当前关键词重算匹配列表并从头渲染 */
	refresh() {
		const all = typeof getIconIds === 'function' ? getIconIds() : [];
		const q = this.query.trim().toLowerCase();
		this.matches = q
			? all.filter((id) => {
					const bare = iconDisplayName(id).toLowerCase();
					return bare.includes(q) || id.toLowerCase().includes(q);
				})
			: all.slice().sort((a, b) => a.localeCompare(b));

		this.gridEl.empty();
		this.rendered = 0;
		this.renderMore();
	}

	/**
	 * 当前图标可能是 compass，也可能是 lucide-compass（getIconIds 的写法），
	 * 比较时统一去前缀，否则老配置永远不高亮。
	 */
	isCurrent(id) {
		return !!this.current && iconDisplayName(id) === iconDisplayName(this.current);
	}

	/** 追加渲染一批 */
	renderMore() {
		const S = this.strings;
		const end = Math.min(this.matches.length, this.rendered + ICON_PAGE);
		for (let i = this.rendered; i < end; i++) {
			const id = this.matches[i];
			const btn = this.gridEl.createEl('button', {
				cls: 'nav-dock-icon-item',
				attr: {
					'aria-label': iconDisplayName(id),
					'data-tooltip-position': 'top',
				},
			});
			btn.dataset.icon = id;
			if (this.isCurrent(id)) btn.addClass('is-selected');
			setIcon(btn, id);
		}
		this.rendered = end;
		this.footerEl.setText(
			this.matches.length === 0
				? S.iconNoMatch
				: S.iconFooter(this.matches.length, this.rendered)
		);
	}

	pick(id) {
		if (!id) return;
		this.onChoose(id);
		this.close();
	}

	onClose() {
		this.contentEl.empty();
	}
}
