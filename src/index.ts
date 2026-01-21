#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { 
  ListToolsRequestSchema, 
  CallToolRequestSchema 
} from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import { SEQUENTIAL_THINKING_TOOL } from './schema.js';

const server = new Server(
    { name: "sequential-thinking-server", version: "0.0.4" },
    { capabilities: { tools: {} } }
);

// 逻辑处理
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
        const args = request.params.arguments as any;
        return {
            content: [{
                type: 'text',
                text: `Processed thought #${args.thought_number}`
            }]
        };
    }
    throw new Error("Tool not found");
});

const app = express();

// 官方推荐写法：统一管理 transport
let transport: SSEServerTransport | null = null;

app.get("/sse", async (req, res) => {
    // 每次新连接都创建一个新的 transport 实例
    transport = new SSEServerTransport("/messages", res);
    console.log("New SSE session initiated");
    await server.connect(transport);
});

app.post("/messages", async (req, res) => {
    if (transport) {
        // 使用 express.json() 的快捷方式
        express.json()(req, res, async () => {
            await transport!.handlePostMessage(req, res);
        });
    } else {
        res.status(400).send("No active session");
    }
});

app.get("/", (req, res) => res.send("MCP Server Ready"));

const PORT = Number(process.env.PORT) || 10000;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
});
