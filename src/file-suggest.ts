/*
 * 导航文档输入框的模糊筛选。
 *
 * 用 Obsidian 1.5+ 的公开类 AbstractInputSuggest：只实现 getSuggestions /
 * renderSuggestion / selectSuggestion，弹出层、键盘上下、blur 收起、滚动跟随
 * 全部由 Obsidian 负责，视觉与原生设置一致。筛选用 prepareFuzzySearch 对
 * file.path 打分再排序。
 */
import { AbstractInputSuggest, prepareFuzzySearch, type TFile } from 'obsidian';

/* ============================================================
 * 设置页用：导航文档筛选 + 图标点选
 * ============================================================ */

/**
 * 给输入框挂上「输入即筛选」的文件建议。
 *
 * 用 Obsidian 自己的 AbstractInputSuggest：弹出层、键盘上下、blur 收起、
 * 滚动跟随都由它负责，视觉与原生设置一致，不用手搓一套。
 * 1.5.0 之前没有这个类，typeof 兜底成纯文本输入（仍可用，只是没有列表）。
 */
export function attachFileSuggest(app, inputEl, onPick) {
	const Base: any = AbstractInputSuggest;
	if (typeof Base !== 'function' || !inputEl) return null;

	class FileSuggest extends Base {
		getSuggestions(query) {
			const files = app.vault.getMarkdownFiles();
			const q = (query || '').trim();

			if (!q) {
				return files
					.slice()
					.sort((a, b) => a.path.localeCompare(b.path))
					.slice(0, 40);
			}

			const prepare = typeof prepareFuzzySearch === 'function' ? prepareFuzzySearch : null;
			const scored: { file: TFile; score: number }[] = [];
			for (const file of files) {
				if (prepare) {
					const match = prepare(q)(file.path);
					if (match) scored.push({ file, score: match.score });
				} else if (file.path.toLowerCase().includes(q.toLowerCase())) {
					scored.push({ file, score: 0 });
				}
			}
			scored.sort((a, b) => b.score - a.score);
			return scored.slice(0, 60).map((r) => r.file);
		}

		renderSuggestion(file, el) {
			el.addClass('nav-dock-file-item');
			el.createDiv({ cls: 'nav-dock-file-name', text: file.basename });
			const dir = file.parent && file.parent.path !== '/' ? file.parent.path : '';
			if (dir) el.createDiv({ cls: 'nav-dock-file-dir', text: dir });
		}

		selectSuggestion(file) {
			(this as any).setValue(file.path);
			(this as any).close();
			onPick(file);
		}
	}

	return new (FileSuggest as any)(app, inputEl);
}
