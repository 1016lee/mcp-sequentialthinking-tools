#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { 
  ListToolsRequestSchema, 
  CallToolRequestSchema 
} from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import { SEQUENTIAL_THINKING_TOOL } from './schema.js';

// --- 核心逻辑类 ---
class SequentialThinkingServer {
    private thought_history: any[] = [];
    
    public async processThought(args: any) {
        // 打印到控制台方便在 Render 日志查看进度
        console.error(`[Thinking] Step: ${args.thought_number}/${args.total_thoughts}`);
        
        return {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    thought_number: args.thought_number,
                    total_thoughts: args.total_thoughts,
                    next_thought_needed: args.next_thought_needed,
                    status: "processed"
                }, null, 2)
            }]
        };
    }
}

const thinkingLogic = new SequentialThinkingServer();

// --- 初始化标准 MCP Server ---
const server = new Server(
    { 
        name: "sequential-thinking-server", 
        version: "0.0.4" 
    },
    { 
        capabilities: { 
            tools: {} 
        } 
    }
);

// 1. 注册工具列表
server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [{
        name: "sequentialthinking_tools",
        description: SEQUENTIAL_THINKING_TOOL.description,
        inputSchema: {
            type: "object",
            properties: {
                thought: { type: "string", description: "Your current thinking process" },
                thought_number: { type: "integer", description: "Current step number" },
                total_thoughts: { type: "integer", description: "Estimated total steps" },
                next_thought_needed: { type: "boolean", description: "Whether another step is required" },
                is_revision: { type: "boolean" },
                revises_thought: { type: "integer" },
                branch_from_thought: { type: "integer" },
                branch_id: { type: "string" }
            },
            required: ["thought", "thought_number", "total_thoughts", "next_thought_needed"]
        }
    }]
}));

// 2. 注册工具执行
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === "sequentialthinking_tools") {
        return await thinkingLogic.processThought(request.params.arguments);
    }
    throw new Error(`Tool not found: ${request.params.name}`);
});

// --- Express SSE 服务设置 ---
const app = express();
// 必须：全局存储 transport 实例以供 POST 路由使用
let transport: SSEServerTransport | null = null;

app.get("/", (req, res) => {
    res.send("Sequential Thinking MCP Server is Live!");
});

// SSE 握手端点
app.get("/sse", async (req, res) => {
    console.log("Kelivo: New SSE connection attempt");

    // 注意：已移除 res.writeHead，完全交给 SSEServerTransport 处理以避免 ERR_HTTP_HEADERS_SENT
    transport = new SSEServerTransport("/messages", res);
    
    try {
        await server.connect(transport);
        console.log("Kelivo: SSE connected and MCP initialized");
    } catch (err) {
        console.error("MCP Connection Error:", err);
        // 如果 SDK 还没发过 Header，则尝试返回错误
        if (!res.headersSent) {
            res.status(500).send("Internal Server Error");
        }
    }
});

// 消息回传端点
app.post("/messages", express.json(), async (req, res) => {
    if (transport) {
        console.log("Kelivo: Received POST message");
        await transport.handlePostMessage(req, res);
    } else {
        console.error("Kelivo: POST received but no active transport");
        res.status(400).send("No active SSE session");
    }
});

// 监听端口 (使用 Number 转换确保类型正确)
const PORT = Number(process.env.PORT) || 10000;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running on port ${PORT}`);
});
