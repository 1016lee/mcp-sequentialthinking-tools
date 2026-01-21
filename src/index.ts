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

// 核心逻辑
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
        return { content: [{ type: 'text', text: "Tool logic running..." }] };
    }
    throw new Error("Tool not found");
});

const app = express();
app.use(express.json());

// 关键改动：使用一个极简的全局变量存储当前的 transport
let currentTransport: SSEServerTransport | null = null;

app.get("/sse", async (req, res) => {
    console.log(">>> SSE: New connection request from Kelivo");
    
    // 1. 设置极度显式的 Header
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
    });

    // 2. 这里的路径必须是绝对路径或简单的相对路径
    // 我们强制使用 "/messages" 并在下方 POST 中匹配
    currentTransport = new SSEServerTransport("/messages", res);
    
    // 3. 立即连接
    await server.connect(currentTransport);
    console.log(">>> SSE: Server connected to transport");

    // 4. 保持连接存活的心跳，防止 Render 断开
    const keepAlive = setInterval(() => {
        res.write(': keep-alive\n\n');
    }, 20000);

    req.on("close", () => {
        clearInterval(keepAlive);
        currentTransport = null;
        console.log(">>> SSE: Connection closed");
    });
});

app.post("/messages", async (req, res) => {
    console.log(">>> POST: Received message from Kelivo");
    
    if (currentTransport) {
        try {
            // 这里是报错的地方，我们增加一个状态检查
            await currentTransport.handlePostMessage(req, res);
            console.log(">>> POST: Message handled successfully");
        } catch (err) {
            console.error(">>> POST: SDK failed to handle message:", err);
            res.status(500).send(String(err));
        }
    } else {
        console.error(">>> POST: No active transport session found");
        res.status(400).send("No active session");
    }
});

app.get("/", (req, res) => res.send("MCP Server is Running"));

const PORT = Number(process.env.PORT) || 10000;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on port ${PORT}`);
});
