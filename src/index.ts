import { Templates } from './eau.templates';
import joplin from 'api';
import { EauListItem, EauTask } from './eau.types';
import { Eau } from './eau';
import { SettingItemType } from 'api/types';

type PanelMessageWithTask = {
	name: string;
	taskId: string;
}

type PanelMessageWithoutTask = {
	dueToday: boolean;
}

type PanelMessage = PanelMessageWithTask | PanelMessageWithoutTask;

function isPanelMessageWithTask(message: PanelMessage): message is PanelMessageWithTask {
	return 'taskId' in message;
}

function isPanelMessageWithoutTask(message: PanelMessage): message is PanelMessageWithoutTask {
	return 'dueToday' in message;
}

class TaskArray extends Array<EauTask> {
	public static fromEauTaskList(list: EauTask[]) {
		return new TaskArray(...list);
	}

	constructor(...args: EauTask[]) {
		super(...args);
	}

	public update(tasks: EauTask[]) {
		const idsMap = tasks.map(t => t.id);
		const tasksToRemove = this.filter(t => !idsMap.includes(t.id));
		for (const task of tasks) {
			const idx = this.findIndex(t => t.id === task.id);
			if(idx >= 0) this[idx] = task;
			else this.push(task);
		}
		for (const task of tasksToRemove) {
			const idx = this.findIndex(t => t.id === task.id);
			if(idx >= 0) this.splice(idx, 1);
		}
	}

	private get today(): EauTask[] {
		return this.filter(t => t.dueToday).sort((a, b) => a.description.localeCompare(b.description));
	}

	private get backlog(): EauTask[] {
		return this.filter(t => !t.dueToday).sort((a, b) => a.description.localeCompare(b.description));
	}

	public getHtml(category: string, listItemsNum: number) {
		let tasks = category === "today" ? this.today : this.backlog;
		if(!tasks.length) return `<p style="margin-top: 12px;">No items ${category === "today" ? 'for today' : 'in the backlog'}</p>`;
		return Templates.list(listItemsNum * 38, tasks.map<EauListItem>(task => {
			const listItem: EauListItem = {
				label: task.description, 
				button: {
					content: `<i class="arrow ${category === 'today' ? 'right' : 'left'}"></i>`,
					onclick: `toggleDueToday('${task.id}')`,
					placement: category === "today" ? "end" : "start"
				},
			}
			if(category === "today") {
				listItem.checkbox = {
					value: false,
					onclick: `complete(this, '${task.id}')`,
					placement: "start"
				}
			}
			return listItem;
		}));
	}

	public addTask(id: string, description: string, dueToday: boolean) {
		const newTask: EauTask =  {
			id,
			description,
			dueToday,
		}
		this.unshift(newTask);
	}

	public complete(id: string) {
		const idx = this.findIndex(task => task.id === id);
		if(idx >= 0) {
			this.splice(idx, 1);
		}
	}

	public toggleDueToday(id: string) {
		const task = this.find(task => task.id === id);
		if(task) {
			task.dueToday = !task.dueToday;
		}
	}
}

joplin.plugins.register({
	onStart: async function() {
		const eau = new Eau();
		await eau.init();
		const {panel, html} = await Eau.createPanel("panel", true);
		const tasks = TaskArray.fromEauTaskList(eau.getTasks());
		await Eau.setupSettings({
			id: "eauTasksSettings",
			label: "Eau - Tasks",
			settings: [{
				id: "maxListItems_Tasks",
				description: "",
				label: "Max number of list items",
				value: 8,
				type: SettingItemType.Int
			}]
		});
		const refreshHtml = async () => {
			const listItemsNum = await Eau.getSetting("maxListItems_Tasks");
			await joplin.views.panels.setHtml(panel, Eau.replaceTemplateVars(html, (match) => tasks.getHtml(match, listItemsNum)));
		}
		await Eau.setupCommands([{
			id: "eauRefreshTasks",
			label: "Eau - Refresh Tasks",
			iconName: "fas fa-music",
			execute: refreshHtml
		}])
		await refreshHtml();

		const dialog = await Eau.createDialog({
			title: "Add Task",
			inputs: [{
				id: "eau-description-input",
				label: "Description",
				type: "text"
			}]
		})

		await joplin.views.panels.onMessage(panel, async (message: PanelMessage) => {
			if(isPanelMessageWithTask(message)) {
				if (message.name === 'complete') {
					tasks.complete(message.taskId);
				} else if(message.name === 'toggleDueToday') {
					tasks.toggleDueToday(message.taskId);
				}
			} else if(isPanelMessageWithoutTask(message)) {
				const res = await joplin.views.dialogs.open(dialog);
				if (res.id === "submit") {
					const description = res.formData?.["eau-dialog-form"]?.["eau-description-input"];
					if(description) tasks.addTask(Eau.generateId(), description, message.dueToday);
				}
				else return;
			}
			await eau.setTasks(tasks);
			await refreshHtml();
		});
	}
});
