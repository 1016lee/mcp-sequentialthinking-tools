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

// 工具注册
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
        return { content: [{ type: 'text', text: "Processing completed" }] };
    }
    throw new Error("Tool not found");
});

const app = express();
// 确保全局开启 JSON 解析
app.use(express.json());

// 全局 transport 引用
let currentTransport: SSEServerTransport | null = null;

app.get("/sse", async (req, res) => {
    console.log(">>> SSE: Attempting connection...");
    
    // 不要在这里手动写任何 res.writeHead 或 res.setHeader
    // 官方 SDK 的 SSEServerTransport 构造函数会接管这个 res 并发送 headers
    currentTransport = new SSEServerTransport("/messages", res);
    
    try {
        await server.connect(currentTransport);
        console.log(">>> SSE: SDK connected successfully");
    } catch (err) {
        console.error(">>> SSE: Connection failed", err);
    }

    req.on("close", () => {
        currentTransport = null;
        console.log(">>> SSE: Connection closed");
    });
});

app.post("/messages", async (req, res) => {
    console.log(">>> POST: Received data from client");
    
    if (currentTransport) {
        try {
            // 注意：handlePostMessage 内部会处理响应，不要手动发 res.send
            await currentTransport.handlePostMessage(req, res);
        } catch (err) {
            console.error(">>> POST: Error handling message", err);
            if (!res.headersSent) res.status(500).send("Internal Server Error");
        }
    } else {
        console.error(">>> POST: No active session");
        res.status(400).send("No active session");
    }
});

app.get("/", (req, res) => res.send("Server status: OK"));

const PORT = Number(process.env.PORT) || 10000;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is ready on port ${PORT}`);
});
