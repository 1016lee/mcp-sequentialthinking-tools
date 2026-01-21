#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { 
  ListToolsRequestSchema, 
  CallToolRequestSchema 
} from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import { SEQUENTIAL_THINKING_TOOL } from './schema.js';

// --- 简单的思维逻辑类 ---
class SequentialThinkingServer {
    private thought_history: any[] = [];
    
    public async processThought(args: any) {
        console.error(`Processing thought: ${args.thought_number}`);
        return {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    status: "success",
                    thought_number: args.thought_number,
                    total_thoughts: args.total_thoughts
                }, null, 2)
            }]
        };
    }
}

const thinkingLogic = new SequentialThinkingServer();

// --- 初始化标准 MCP Server ---
const server = new Server(
    { name: "sequential-thinking", version: "0.0.4" },
    { capabilities: { tools: {} } }
);

// 1. 注册工具列表句柄 (修复了 any 报错)
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

// 2. 注册工具调用句柄 (修复了 any 报错)
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === "sequentialthinking_tools") {
        return await thinkingLogic.processThought(request.params.arguments);
    }
    throw new Error("Tool not found");
});

// --- Express & SSE 适配 ---
const app = express();
let transport: SSEServerTransport | null = null;

app.get("/", (req, res) => res.send("Standard MCP Server is Running"));

app.get("/sse", async (req, res) => {
    console.log("New Kelivo connection established");
    transport = new SSEServerTransport("/messages", res);
    await server.connect(transport);
});

app.post("/messages", express.json(), async (req, res) => {
    if (transport) {
        await transport.handlePostMessage(req, res);
    } else {
        res.status(400).send("No active SSE session");
    }
});

// 3. 修复端口类型报错
const PORT = Number(process.env.PORT) || 10000;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server ready for Kelivo on port ${PORT}`);
});
