import { Events, Parser, Store, IO, Server, Plugin } from "@telecraft/types";
import { Reader } from "@telecraft/types/types/Server";

import { spawn } from "child_process";
import { createInterface } from "readline";
import { platform, EOL } from "os";
import { PassThrough, Writable } from "stream";

import { decodeStream } from "iconv-lite";

import Event from "./util/Event";

const pkg = require("../package.json") as { name: string; version: string };

type Config = {
	launch: string;
	cwd?: string;
};

type Ctx = {
	config: Config;
	parser: Parser;
	store: (name: string) => Store;
	io?: IO;
	plugins: ReturnType<Plugin<any, any, any>>[];
};

const rl = (stream: NodeJS.ReadableStream) =>
	createInterface({ input: stream });

const decode = (x: NodeJS.ReadableStream) =>
	platform() === "win32" ? x.pipe(decodeStream("win1252")) : x;

const { Console } = console;

const getConsole = (
	io: { stdout: Writable; stderr: Writable },
	mapper: (line: string) => string,
) => {
	const stdout = new PassThrough();
	rl(stdout).on("line", line => io.stdout.write(mapper(line) + EOL));

	const stderr = new PassThrough();
	rl(stderr).on("line", line => io.stderr.write(mapper(line) + EOL));

	return new Console(stdout, stderr);
};

const getEvents = (events: Events, prefix: string): Events => {
	const emit = (event: string, ...args: any[]) =>
		events.emit([prefix, event].join(":"), ...args);

	return { ...events, emit };
};

export default ({
	config,
	parser,
	store: StoreProvider,
	plugins = [],
	io = process,
}: Ctx) => {
	const [launch, ...options] = config.launch.split(" ");

	const corePrefix = "[" + pkg.name + "@" + pkg.version + "]";

	const console = getConsole(io, line => [corePrefix, line].join(" "));

	// detached so that Minecraft gets to terminate gracefully on SIGINT
	// child process should be exited by @telecraft/core instead of OS
	const minecraft = spawn(launch, options, { cwd: config.cwd, detached: true });

	const readers: Reader[] = [];
	const inputReaders: Reader[] = [];

	const { stdin } = minecraft;
	const stdout = decode(minecraft.stdout);
	const stderr = decode(minecraft.stderr);

	stdout.pipe(io.stdout);
	stderr.pipe(io.stderr);

	const minecraftOutput = rl(stdout);
	const cliInput = rl(io.stdin);

	// Create plugin dependencies

	const events = Event();

	const server: Server = {
		send: (msg: string) => {
			stdin.write(msg + EOL);
		},
		read: reader => {
			readers.push(reader);
		},
		input: reader => {
			inputReaders.push(reader);
		},
	};

	cliInput.on("line", async line => {
		let cancelled = false;
		const cancel = () => (cancelled = true);

		for (const reader of inputReaders) {
			await reader(line, cancel);
			if (cancelled) return;
		}

		server.send(line);
	});

	// setup events

	const streamParser = parser(server, events.emit);

	minecraftOutput.on("line", async line => {
		let cancelled = false;
		const cancel = () => (cancelled = true);

		for (const reader of readers) {
			await reader(line, cancel);
			if (cancelled) return;
		}

		streamParser(line);
	});

	// register plugins

	plugins.forEach((plugin, idx) => {
		if (!plugin.name || !plugin.version || !plugin.start) {
			throw new Error(
				`${corePrefix} plugins[${idx}] does not return name, version, or start`,
			);
		}

		const prefix = "[" + plugin.name + "@" + plugin.version + "]";

		plugin.start(
			{
				events: getEvents(events, plugin.name),
				store: StoreProvider(plugin.name),
				server,
				console: getConsole(io, line => [prefix, line].join(" ")),
			},
			// @ts-ignore
			plugins
				.filter(p => plugin.dependencies?.includes(p.name))
				.map(p => p.exports) || [],
		);
	});

	plugins.forEach(plugin => {
		events.emit("core:pluginloaded", {
			name: plugin.name,
			version: plugin.version,
		});
	});

	let alreadyExiting = false;

	const cleanup = () => {
		console.log("We're exiting, cleaning up before we go...");
		console.log(
			"Ctrl+C now will dangerously close, potentially losing or corrupting data!",
		);
		io.stdin.pause();
		cliInput.close();
		if (!minecraft.killed) {
			console.log("Stopping server.");
			server.send("stop");
			alreadyExiting = true;
		}
		events.emit("core:close", {});
		events.removeAllListeners();

		process.on("SIGINT", () => process.exit(500));
	};

	process.on("uncaughtException", error => {
		console.error(error);
		console.log("ERROR! Exiting...");
		cleanup();
	});

	minecraft.once("exit", () => {
		console.log("Minecraft server exited.");
		if (alreadyExiting) console.log("Core is already exiting.");
		else cleanup();
	});

	process.once("SIGINT", cleanup);
	process.once("SIGTERM", cleanup);
};
