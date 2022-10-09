// deno-lint-ignore-file

interface payload {
	id: string;
	sender: string;
	data?: any;
	action: string;
	target: string;
	relay?: boolean;
}

class Threads {
	private threads = new Map<string, any>();

	private action = new Map<any, any>();

	public name = "";

	constructor(name: string) {
		this.name = name;
		if (self.postMessage) {
			self.onmessage = async (e: { data: payload }) => {
				if (e.data.id && e.data.sender) {
					const r = await this.Receive(e.data);

					if (e.data.action == "done" && e.data.target === this.name) {
						return;
					}
					const sender = e.data.sender;
					const target = e.data.target;
					e.data.action = "done";
					e.data.data = r;
					e.data.sender = target;
					e.data.target = sender;

					self.postMessage(e.data);
				}
			};
		} else {
			this.threads.set(name, {
				postMessage: (data: any) => {
					const { target } = data;
					// get worker
					const worker = this.GetThread(target);
					if (worker) {
						worker.postMessage(data);
					}
				},
			});
		}
	}

	public RegisterAction(action: string, callback: any) {
		this.action.set(action, callback);
	}

	public RegisterThread(name: string, thread: any) {
		if (self.postMessage) return;
		// check if thread is already registered
		if (this.threads.has(name)) return;
		// check if thread is a function
		if (typeof thread !== "function") return;
		console.log("Registering thread", name);
		const id = this.generateID();
		const _Promise = new Promise((resolve, reject) => {
			this.RegisterAction("validate", (sender: string, data: any) => {
				const { id } = data;
				this.action.delete(id);
				resolve(data);
			});
		});

		let code = thread.toString().replace(
			/(?:async )function (.*)\(\) {(.*)}$/gms,
			`(async()=>{$2;
			if (Thread) {
				Thread.SendTo("main",{
					action: "validate",
					data: {
						id: "${id}",
					}
				});
			}
		})();`,
		).replace(/ (\/\/.*?)\n/gms, "").replace(/\s{2,}|\r\n|\n|\r/gms, "");
		console.log(code);

		const blob = new Blob([code], { type: "application/typescript" });
		const worker = new Worker(URL.createObjectURL(blob), {
			type: "module",
			deno: true,
		});

		worker.onmessage = async (e: any) => {
			// make sure the message has the structure we expect
			if (e.data.id && e.data.sender && this.name !== e.data.sender) {
				const r = await this.Receive(e.data);
				if (this.name !== e.data.target && e.data.relay) {
					const thread = this.GetThread(e.data.target);
					if (thread) {
						thread.postMessage(e.data);
					}
					return;
				}

				const sender = e.data.sender;
				const target = e.data.target;
				e.data.target = sender;
				e.data.sender = target;
				e.data.action = "done";
				e.data.data = r;
				if (self.postMessage) {
					self.postMessage(e.data);
				} else {
					const thread = this.GetThread(e.data.target);
					if (thread) {
						thread.postMessage(e.data);
					}
				}
			}
		};

		this.threads.set(name, worker);
		return _Promise;
	}

	private async Receive(payload: payload) {
		const action = this.action.get(payload.id) ?? this.action.get(payload.action);
		if (action) {
			return await action(payload.sender, payload.data);
		}
	}

	public SendTo(target: string, data: any) {
		const id = this.generateID();
		const wait = new Promise((resolve, reject) => {
			this.action.set(id, (sender: string, data: any) => {
				this.action.delete(id);
				resolve(data);
			});
		});

		// structure data into a payload
		const payload: payload = {
			id,
			sender: this.name,
			data: data.data,
			action: data.action,
			target,
		};

		// if we are in the main thread && do not target ourselves
		if (!self.postMessage) {
			const thread = this.GetThread(target);
			if (thread) {
				thread.postMessage(payload);
			}
		}

		// if we are in a worker thread
		if (self.postMessage) {
			payload.relay = true;
			self.postMessage(payload);
		}

		// wait for response
		return wait;
	}

	private generateID() {
		return Math.random().toString(36).substr(2, 9);
	}

	public GetThread(target: string) {
		return this.threads.get(target) ?? false;
	}
}

export default Threads;
