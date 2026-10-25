/*
 * 设置页。
 *
 * 所有面向用户的字符串都取自 this.plugin.uiStrings()（见 i18n.ts），
 * 这个文件里不写死任何一种语言。切语言时整页 display() 重画即可。
 */
import { PluginSettingTab, Setting, Notice, setIcon, debounce } from 'obsidian';
import { DEFAULT_SETTINGS } from './constants';
import { attachFileSuggest } from './file-suggest';
import { IconPickerModal, iconDisplayName } from './icon-picker';

/** obsidian.d.ts 的 PluginSettingTab 没声明 plugin（构造函数收下但类型里没有），
  * 用 interface 合并补上，类体保持原样搬运。
  * ⚠ interface 必须和 class 一样是 exported，否则合并报 TS2395 */
export interface NavDockSettingTab {
	plugin: any;
}

export class NavDockSettingTab extends PluginSettingTab {
	constructor(app, plugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display() {
		const { containerEl } = this;
		containerEl.empty();

		const S = this.plugin.uiStrings();

		// ---------- 界面语言（放第一项：切换后整页按新语言重画） ----------
		new Setting(containerEl)
			.setName(S.setLanguage)
			.setDesc(S.setLanguageDesc)
			.addDropdown((dd) =>
				dd
					.addOption('auto', S.langAuto)
					.addOption('zh', S.langZh)
					.addOption('en', S.langEn)
					.setValue(this.plugin.settings.language || 'auto')
					.onChange(async (value) => {
						await this.plugin.setLanguage(value);
						this.display();   // 用新语言重画整页
					})
			);

		new Setting(containerEl)
			.setName(S.setNote)
			.setDesc(S.setNoteDesc)
			.addText((text) => {
				text
					.setPlaceholder(S.setNotePlaceholder)
					.setValue(this.plugin.settings.notePath);

				attachFileSuggest(this.app, text.inputEl, async (file) => {
					this.plugin.settings.notePath = file.path;
					text.setValue(file.path);
					await this.plugin.saveSettings();
				});

				// 手输时不要每个字符都写盘
				const saveSoon =
					typeof debounce === 'function'
						? debounce(() => this.plugin.saveSettings(), 400)
						: () => this.plugin.saveSettings();
				text.onChange((value) => {
					this.plugin.settings.notePath = value;
					saveSoon();
				});
			})
			.addButton((btn) =>
				btn.setButtonText(S.btnUseCurrent).onClick(async () => {
					const file = this.app.workspace.getActiveFile();
					if (!file) {
						new Notice(S.noticeNoActiveFile);
						return;
					}
					this.plugin.settings.notePath = file.path;
					await this.plugin.saveSettings();
					this.display();
				})
			);

		new Setting(containerEl)
			.setName(S.setTrigger)
			.setDesc(S.setTriggerDesc)
			.addDropdown((dd) =>
				dd
					.addOption('hover', S.optHover)
					.addOption('click', S.optClick)
					.setValue(this.plugin.settings.trigger)
					.onChange(async (value) => {
						await this.plugin.setTrigger(value);
					})
			);

		const iconSetting = new Setting(containerEl)
			.setName(S.setIconName)
			.setDesc(S.setIconDesc(iconDisplayName(this.plugin.settings.icon)));

		// 当前图标的预览，选完立刻换
		const iconPreview = iconSetting.controlEl.createDiv({ cls: 'nav-dock-icon-preview' });
		setIcon(iconPreview, this.plugin.settings.icon);

		iconSetting.addButton((btn) =>
			btn.setButtonText(S.btnPickIcon).onClick(() => {
				new IconPickerModal(this.app, this.plugin.settings.icon, async (id) => {
					this.plugin.settings.icon = id;
					await this.plugin.saveSettings();
					this.plugin.refreshRibbonIcon();
					setIcon(iconPreview, id);
					iconSetting.setDesc(S.setIconDesc(iconDisplayName(id)));
				}, S).open();
			})
		);

		new Setting(containerEl)
			.setName(S.setLabel)
			.setDesc(S.setLabelDesc)
			.addText((text) =>
				text
					.setPlaceholder(S.setLabelPlaceholder)
					.setValue(this.plugin.settings.label)
					.onChange(async (value) => {
						this.plugin.settings.label = value.trim();
						await this.plugin.saveSettings();
						this.plugin.refreshRibbonIcon();
					})
			);

		new Setting(containerEl)
			.setName(S.setWidth)
			.setDesc(S.setWidthDesc)
			.addSlider((slider) =>
				slider
					.setLimits(280, 720, 10)
					.setValue(this.plugin.settings.width)
					.onChange(async (value) => {
						this.plugin.settings.width = value;
						await this.plugin.saveSettings();
						this.plugin.applySize();
						this.plugin.reposition();
					})
			);

		new Setting(containerEl)
			.setName(S.setMaxHeight)
			.setDesc(S.setMaxHeightDesc)
			.addSlider((slider) =>
				slider
					.setLimits(40, 95, 1)
					.setValue(this.plugin.settings.maxHeightVh)
					.onChange(async (value) => {
						this.plugin.settings.maxHeightVh = value;
						await this.plugin.saveSettings();
						this.plugin.applySize();
						this.plugin.reposition();
					})
			)
			.addButton((btn) =>
				btn.setButtonText(S.btnAutoHeight).onClick(async () => {
					this.plugin.settings.height = 0;
					await this.plugin.saveSettings();
					this.plugin.applySize();
					this.plugin.reposition();
				})
			);

		new Setting(containerEl)
			.setName(S.setResetSize)
			.setDesc(S.setResetSizeDesc(DEFAULT_SETTINGS.width))
			.addButton((btn) =>
				btn.setButtonText(S.btnReset).onClick(async () => {
					this.plugin.settings.width = DEFAULT_SETTINGS.width;
					this.plugin.settings.height = 0;
					await this.plugin.saveSettings();
					this.plugin.applySize();
					this.plugin.reposition();
					this.display();
				})
			);

		new Setting(containerEl)
			.setName(S.setShowHeader)
			.setDesc(S.setShowHeaderDesc)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.showHeader).onChange(async (value) => {
					this.plugin.settings.showHeader = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName(S.setLinkMode)
			.setDesc(S.setLinkModeDesc)
			.addDropdown((dd) =>
				dd
					.addOption('new-tab', S.optNewTab)
					.addOption('current-tab', S.optCurrentTab)
					.setValue(this.plugin.settings.linkOpenMode)
					.onChange(async (value) => {
						this.plugin.settings.linkOpenMode = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(S.setCloseOnLink)
			.setDesc(S.setCloseOnLinkDesc)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.closeOnLink).onChange(async (value) => {
					this.plugin.settings.closeOnLink = value;
					await this.plugin.saveSettings();
				})
			);
	}
}
