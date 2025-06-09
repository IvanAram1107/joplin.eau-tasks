/* DO NOT MODIFY THIS FILE, IT WILL BE REPLACED */

import joplin from "api";
import { EauCommand, EauConfig, EauDebtEntity, EauDialog, EauNote, EauNotebook, EauPanelResponse, EauSettingsSection, EauShoppingItem, EauTask } from "./eau.types";
import { Templates } from './eau.templates';


export class Eau {
  private config: EauConfig;
  private rootNotebookId?: string;
  private readonly rootNotebookTitle = "Eau";
  private readonly configNoteTitle = "EauConfig";

  public async init() {
    await this.getRootNotebookId();
    const config = await this.getEauConfig();
    this.config = {
      debt: [],
      tasks: [],
      shopping: [],
      ...config
    }
  }

  private async getEauConfig() {
    let note: EauNote;
    const response = await joplin.data.get(["search"], {
      fields: ["id", "body"],
      query: `title:${this.configNoteTitle} type:note notebook:${this.rootNotebookTitle}`
    });
    if(response?.items?.length) {
      note = response.items[0];
    } else {
      note = await this.createEauConfigNote();
    }
    let config: any = {
      noteId: note.id,
      ...JSON.parse(note.body)
    };
    return config;
  }

  private async createEauConfigNote() {
    const note = await joplin.data.post(["notes"], null, { 
      title: this.configNoteTitle,
      body: "{}",
      parent_id: this.rootNotebookId
    });
    return note;
  }

  private async getRootNotebookId() {
    let notebook: EauNotebook;
    const response = await joplin.data.get(["search"], {
      fields: ["id"],
      type: "folder",
      query: this.rootNotebookTitle
    });
    if(response.items.length) {
      notebook = response.items[0];
    } else {
      notebook = await joplin.data.post(["folders"], null, {
        title: this.rootNotebookTitle
      });
    }
    this.rootNotebookId = notebook.id;
  }

  private async saveConfig() {
    if(this.config){
      await joplin.data.put(["notes", this.config.noteId], null, {
        body: JSON.stringify(this.config)
      });
    }
  }

  public getAttr(key: string): any {
    return this.config[key] || null;
  }

  public async setAttr(key: string, value: any) {
    const config = await this.getEauConfig();
    this.config = {
      ...config,
      [key]: value
    }
    await this.saveConfig();
  }

  public getShopping(): EauShoppingItem[] {
    return this.getAttr("shopping") || [];
  }

  public async setShopping(shoppingList: EauShoppingItem[]) {
    await this.setAttr("shopping", shoppingList);
  }

  public getDebt(): EauDebtEntity[] {
    return this.getAttr("debt") || [];
  }

  public async setDebt(debtEntities: EauDebtEntity[]) {
    await this.setAttr("debt", debtEntities);
  }

  public getTasks(): EauTask[] {
    return this.getAttr("tasks") || [];
  }

  public async setTasks(tasks: EauTask[]) {
    await this.setAttr("tasks", tasks);
  }

  ////////////////////////////////////
  ////////////////////////////////////
  ////////// STATIC METHODS //////////
  ////////////////////////////////////
  ////////////////////////////////////

  public static async setupSettings(section: EauSettingsSection) {
    await joplin.settings.registerSection(section.id, {
			label: section.label,
			iconName: 'fas fa-layer-group',
		});

    const settings = section.settings.reduce((acc, curr) => {
      acc[curr.id] = {
        value: curr.value,
        type: curr.type,
        section: section.id,
        description: curr.description,
        public: true,
        label: curr.label
      }
      return acc;
    }, {});

    await joplin.settings.registerSettings(settings);
  }

  public static async setupCommands(commands: EauCommand[]) {
    for (const command of commands) {
      await joplin.commands.register({
        name: command.id,
        label: command.label,
        iconName: command.iconName,
        execute: async () => {
          await command.execute();
        }
      });
    }
  }

  public static async getSetting(key: string) {
    const value = await joplin.settings.value(key);
    return value;
  }

  public static generateId(length: number = 8) {
		let num: number, char: string, id: string = '';
		for (let i = 0; i < length; i++) {
			num = Math.floor(Math.random() * 62);
			if(num < 10) {
				char = String.fromCharCode(48 + num);
			} else if(num < 36) {
				char = String.fromCharCode(65 + num - 10);
			} else {
				char = String.fromCharCode(97 + num - 36);
			}
			id += char;
		}
		return id;
	}

  public static async readHtml(fileName: string) {
    const fs = joplin.require('fs-extra');
    const instalationDir = await joplin.plugins.installationDir();
    const filePath = `${instalationDir}\\${fileName}`;
    const text = await fs.readFile(filePath, 'utf8');
    return text;
  }

  public static replaceTemplateVars(html: string, replObj: {[key: string]: string}): string;
  public static replaceTemplateVars(html: string, replFn: (key: string) => string): string;
  public static replaceTemplateVars(html: string, replFnOrObj: {[key: string]: string} | ((key: string) => string)): string {
    return html.replace(/{{ *([\w-]+) *}}/g, (_, match: string) => typeof replFnOrObj === "function" ? replFnOrObj(match) : replFnOrObj[match]);
  }

  private static async safeRunFunction(fn: () => Promise<any>) {
    try {
      const res = await fn();
      return res;
    } catch (error) {
      return null;
    }
  }

  public static async createPanel(panelBaseName: string, useCommonCss: boolean): Promise<EauPanelResponse> {
    const panel = await joplin.views.panels.create(`eau-panel-${panelBaseName}`);
    const html = await Eau.readHtml(`${panelBaseName}.html`);
    await Eau.safeRunFunction(() => joplin.views.panels.addScript(panel, `./${panelBaseName}.js`));
    await Eau.safeRunFunction(() => joplin.views.panels.addScript(panel, `./${panelBaseName}.css`));
    if(useCommonCss) {
      await joplin.views.panels.addScript(panel, `./common.css`);
    }
    return { panel, html };
  }

  public static async createDialog(data: EauDialog) {
    const id = Eau.generateId(4);
    const dialog = await joplin.views.dialogs.create(`eau-dialog-${id}`);
    const dialogHtml = Templates.dialog(data);
		await joplin.views.dialogs.setHtml(dialog, dialogHtml);
    await joplin.views.dialogs.addScript(dialog, "./common.css");
		await joplin.views.dialogs.setButtons(dialog, [
			{ id: "submit", title: "Accept" },
			{ id: "cancel", title: "Cancel" }
		]);
    return dialog;
  }
}