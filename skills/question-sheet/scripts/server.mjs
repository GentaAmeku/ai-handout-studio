import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { writeFile, link, unlink, access } from "node:fs/promises";
import { resolve, dirname, basename } from "node:path";
import { render, digestOf } from "./render.mjs";
import { validateDocument, validateResponse } from "./model.mjs";
export const writeExclusive = async (path, data) => {
	const temp = resolve(
		dirname(path),
		`.${basename(path)}.${randomBytes(8).toString("hex")}.tmp`,
	);
	await writeFile(temp, data, { flag: "wx", mode: 0o600 });
	try {
		await link(temp, path);
	} finally {
		await unlink(temp);
	}
};
export const startServer = async (
	input,
	out,
	{ timeout = 1800, port = 0, template, layout, baseDir } = {},
) => {
	const doc = validateDocument(input);
	const digest = digestOf(doc);
	const output = resolve(out);
	if (!Number.isInteger(timeout) || timeout < 1 || timeout > 86400)
		throw new Error("timeout は1〜86400秒です");
	const exists = await access(output).then(
		() => true,
		() => false,
	);
	if (exists)
		throw new Error("回答先が既にあります。別の保存先を指定してください");
	const token = randomBytes(24).toString("hex");
	const state = { accepted: false, writing: false, timer: null, origin: null };
	const page = render(doc, `/${token}/answers`, { template, layout, baseDir });
	const send = (res, status, body, type = "application/json") => {
		res.writeHead(status, {
			"Content-Type": `${type}; charset=utf-8`,
			"Cache-Control": "no-store",
			"X-Content-Type-Options": "nosniff",
			"X-Frame-Options": "DENY",
			"Referrer-Policy": "no-referrer",
		});
		res.end(type === "application/json" ? JSON.stringify(body) : body);
	};
	const server = createServer(async (req, res) => {
		try {
			if (`http://${req.headers.host}` !== state.origin)
				return send(res, 403, { error: "接続先が違います" });
			if (req.method === "GET" && req.url === `/${token}`)
				return send(res, 200, page, "text/html");
			if (req.method !== "POST" || req.url !== `/${token}/answers`)
				return send(res, 404, { error: "見つかりません" });
			if (
				req.headers.origin !== state.origin ||
				req.headers["content-type"]?.split(";")[0] !== "application/json"
			)
				return send(res, 403, { error: "送信元または形式が違います" });
			if (state.accepted || state.writing)
				return send(res, 409, { error: "回答は既に受け取っています" });
			const chunks = [];
			for await (const chunk of req) {
				chunks.push(chunk);
				if (
					chunks.reduce((sum, entry) => sum + entry.length, 0) >
					2 * 1024 * 1024
				)
					return send(res, 413, { error: "回答が大きすぎます" });
			}
			const response = validateResponse(
				doc,
				digest,
				JSON.parse(Buffer.concat(chunks).toString("utf8")),
			);
			if (state.accepted || state.writing)
				return send(res, 409, { error: "回答は既に受け取っています" });
			state.writing = true;
			try {
				await writeExclusive(output, `${JSON.stringify(response, null, 2)}\n`);
			} catch (error) {
				state.writing = false;
				return send(res, 409, { error: `保存できません: ${error.message}` });
			}
			state.accepted = true;
			state.writing = false;
			clearTimeout(state.timer);
			send(res, 200, { saved: true });
			state.timer = setTimeout(() => server.close(), 1500);
		} catch (error) {
			if (!res.headersSent) send(res, 400, { error: error.message });
		}
	});
	server.headersTimeout = 10000;
	server.requestTimeout = 15000;
	await new Promise((resolveReady, reject) => {
		server.once("error", reject);
		server.listen(port, "127.0.0.1", resolveReady);
	});
	state.origin = `http://127.0.0.1:${server.address().port}`;
	state.timer = setTimeout(() => {
		server.close();
		server.closeIdleConnections();
	}, timeout * 1000);
	server.on("close", () => clearTimeout(state.timer));
	return {
		server,
		url: `${state.origin}/${token}`,
		origin: state.origin,
		accepted: () => state.accepted,
		close: () => {
			clearTimeout(state.timer);
			server.closeAllConnections();
			server.close();
		},
	};
};
