import Threads from "./thread.ts";
const Thread = new Threads("main");

async function firts_thread() {
	const Threads = (await import(new URL("file://" + Deno.cwd()).href + "/thread.ts")).default; // can use import maps
	const Thread = new Threads("1");
	Thread.RegisterAction("test", (sender: string, data: any) => {
		return {msg : data + " awnsered by 1"};
	});
}


await Thread.RegisterThread("1", firts_thread);
console.log("Registered thread 1");


Deno.bench({
	name: "Thread 1",
	fn : async () => {
		const r = await Thread.SendTo("1", {
			action: "test",
			data : "Hello from main"
		});
	}
})