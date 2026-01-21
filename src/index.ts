#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import { SEQUENTIAL_THINKING_TOOL } from './schema.js';

const server = new Server(
    { name: "sequential-thinking-server", version: "0.0.4" },
    { capabilities: { tools: {} } }
);

// 注册工具逻辑
server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [{
        name: "sequentialthinking_tools",
        description: SEQUENTIAL_THINKING_TOOL.description,
        inputSchema: {
            type: "object",
            properties: {
                thought: { type: "string" },
                thought_number: { type: "integer" },
                total_thoughts: { type: "integer" },
                next_thought_needed: { type: "boolean" }
            },
            required: ["thought", "thought_number", "total_thoughts", "next_thought_needed"]
        }
    }]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === "sequentialthinking_tools") {
        return { content: [{ type: 'text', text: "Success" }] };
    }
    throw new Error("Tool not found");
});

const app = express();
// 注意：不要在全局使用 app.use(express.json())，这会干扰 SDK 读取流

let currentTransport: SSEServerTransport | null = null;

app.get("/sse", async (req, res) => {
    console.log(">>> SSE: Connection Start");
    currentTransport = new SSEServerTransport("/messages", res);
    await server.connect(currentTransport);
    console.log(">>> SSE: SDK Connected");
});

// 在 POST 路由里精确控制解析
app.post("/messages", express.json(), async (req, res) => {
    console.log(">>> POST: Data Received");
    if (currentTransport) {
        try {
            // 关键：将解析后的 body 显式交给 SDK
            await currentTransport.handlePostMessage(req, res, req.body);
            console.log(">>> POST: Handled");
        } catch (err) {
            console.error(">>> POST: Error", err);
            if (!res.headersSent) res.status(500).send("Error");
        }
    } else {
        res.status(400).send("No Session");
    }
});

app.get("/", (req, res) => res.send("OK"));

const PORT = Number(process.env.PORT) || 10000;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Ready on ${PORT}`);
});
