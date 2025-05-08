import joplin from 'api';

type Task = {
	id: string;
	description: string;
	dueToday: boolean;
	completed: boolean;
}

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

class TaskArray extends Array<Task> {
	constructor(...args: Task[]) {
		super(...args);
	}

	private get today(): Task[] {
		return this.filter(t => t.dueToday).sort((_, b) => b.completed ? -1 : 0);
	}

	private get backlog(): Task[] {
		return this.filter(t => !t.dueToday).sort((_, b) => b.completed ? -1 : 0);
	}

	public getHtml(category: string) {
		if(category === "today") return this.getTodayHtml();
		else if(category === "backlog") return this.getBacklogHtml();
		else return "";
	}

	public getTodayHtml(): string {
		const tasks = this.today;
		if(!tasks.length) return "<p>No items for today</p>";
		let html = "<div class='tasks-list'>";
		for (const task of tasks) {
			html += `<div class="tasks-list-item">
				<span class="checkbox" data-checked="${+task.completed}" onclick="toggleCompleted(this, '${task.id}')"></span>
				<span class="tasks-list-item-label">${task.description}</span>
				<button class="arrow-button" onclick="toggleDueToday('${task.id}')">
				<i class="arrow right"></i>
				</button>
				</div>`;
			}
			html += "</div>";
			return html;
		}
		
	public getBacklogHtml(): string {
		const tasks = this.backlog;
		if(!tasks.length) return "<p>No items in the backlog</p>";
		let html = "<div class='tasks-list'>";
		for (const task of tasks) {
			html += `<div class="tasks-list-item">
				<button class="arrow-button" onclick="toggleDueToday('${task.id}')">
					<i class="arrow left"></i>
				</button>
				<span class="tasks-list-item-label">${task.description}</span>
				<span class="checkbox" data-checked="${+task.completed}" onclick="toggleCompleted(this, '${task.id}')"></span>
			</div>`;
		}
		html += "</div>";
		return html;
	}

	public addTask(description: string, dueToday: boolean) {
		const newTask: Task =  {
			id: this.generateTaskId(),
			description,
			dueToday,
			completed: false,
		}
		this.unshift(newTask);
	}

	private generateTaskId(length: number = 8) {
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

	public toggleCompleted(id: string) {
		const task = this.find(task => task.id === id);
		if(task) {
			task.completed = !task.completed;
		}
	}

	public toggleDueToday(id: string) {
		const task = this.find(task => task.id === id);
		if(task) {
			task.dueToday = !task.dueToday;
		}
	}
}

async function readHtml(fileName: string) {
	const fs = joplin.require('fs-extra');
	const instalationDir = await joplin.plugins.installationDir();
	const filePath = `${instalationDir}\\${fileName}`;
	const text = await fs.readFile(filePath, 'utf8');
	return text;
}

async function getEauConfigNote(): Promise<any> {
	let notebook = await joplin.data.get(["search"], { fields: ["id"], type: "folder", query: "Eau" });
  if(!notebook.items.length) {
		notebook = await joplin.data.post(["folders"], null, {
			title: "Eau"
		});
	} else {
		notebook = notebook.items[0];
	}
	let note = await joplin.data.get(["search"], { fields: ["id", "body"], query: "EauConfig&notebook:Eau" });
	if(note?.items?.length > 0) {
		note = note.items[0];
	} else {
		note = await joplin.data.post(["notes"], null, { 
			title: "EauConfig",
			body: JSON.stringify({ tasks: []}),
			parent_id: notebook.id
		});
	}
	return note;
}

async function saveEauConfig(id: string, body: string): Promise<void> {
	await joplin.data.put(["notes", id], null, { body });
}

joplin.plugins.register({
	onStart: async function() {
		async function updateHtml() {
			const html = panelHtml.replace(/{{ *([\w-]+) *}}/g, (_, match) => tasks.getHtml(match));
			await joplin.views.panels.setHtml(panel, html);
		}

		async function flush() {
			configNoteBody.tasks = tasks;
			await saveEauConfig(configNote.id, JSON.stringify(configNoteBody));
			await updateHtml();
		}

		const configNote = await getEauConfigNote();
		const configNoteBody = JSON.parse(configNote.body);
		const tasks = new TaskArray(...(configNoteBody.tasks || []));

		const panelHtml = await readHtml("panel.html");
		const dialogHtml = await readHtml("dialog.html");

		const panel = await joplin.views.panels.create("eau-tasks-panel");
		await updateHtml();
		await joplin.views.panels.addScript(panel, './panel.css');
		await joplin.views.panels.addScript(panel, './panel.js');

		const dialog = await joplin.views.dialogs.create("eau-tasks-dialog");
		await joplin.views.dialogs.setHtml(dialog, dialogHtml);
		await joplin.views.dialogs.addScript(dialog, "./panel.css");
		await joplin.views.dialogs.setButtons(dialog, [
			{ id: "submit", title: "Accept" },
			{ id: "cancel", title: "Cancel" }
		]);

		await joplin.views.panels.onMessage(panel, async (message: PanelMessage) => {
			if(isPanelMessageWithTask(message)) {
				if (message.name === 'toggleCompleted') {
					tasks.toggleCompleted(message.taskId);
				} else if(message.name === 'toggleDueToday') {
					tasks.toggleDueToday(message.taskId);
				}
			} else if(isPanelMessageWithoutTask(message)) {
				const res = await joplin.views.dialogs.open(dialog);
				if (res.id === "submit") {
					const description = res.formData?.["task-form"]?.["eau-task-input"];
					tasks.addTask(description, message.dueToday);
				} else return;
			}
			await flush()
		});
	}
});
