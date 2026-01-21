#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { 
  ListToolsRequestSchema, 
  CallToolRequestSchema 
} from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import { SEQUENTIAL_THINKING_TOOL } from './schema.js';

class SequentialThinkingServer {
    public async processThought(args: any) {
        console.error(`[Thinking] Step: ${args.thought_number}`);
        return {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    thought_number: args.thought_number,
                    total_thoughts: args.total_thoughts,
                    status: "processed"
                }, null, 2)
            }]
        };
    }
}

const thinkingLogic = new SequentialThinkingServer();
const server = new Server(
    { name: "sequential-thinking-server", version: "0.0.4" },
    { capabilities: { tools: {} } }
);

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
        return await thinkingLogic.processThought(request.params.arguments);
    }
    throw new Error(`Tool not found: ${request.params.name}`);
});

const app = express();

// 存储所有活跃的 transport 会话
const activeTransports = new Map<string, SSEServerTransport>();

app.get("/", (req, res) => res.send("MCP Server is Live!"));

app.get("/sse", async (req, res) => {
    console.log("New SSE Connection");
    const transport = new SSEServerTransport("/messages", res);
    
    // 使用 SDK 内部生成的 sessionId 或自定义一个来追踪
    // 这里我们简单处理，确保在连接建立后将其存入 Map
    await server.connect(transport);

    // 关键修复：监听 transport 的 sessionId
    const sessionId = (transport as any).sessionId;
    if (sessionId) {
        activeTransports.set(sessionId, transport);
        console.log(`Transport registered: ${sessionId}`);
    }

    req.on('close', () => {
        if (sessionId) activeTransports.delete(sessionId);
        console.log("Connection closed");
    });
});

app.post("/messages", express.json(), async (req, res) => {
    // 获取会话 ID，SDK 默认通过查询参数 sessionId 传递
    const sessionId = req.query.sessionId as string;
    const transport = activeTransports.get(sessionId);

    if (transport) {
        await transport.handlePostMessage(req, res);
    } else {
        // 如果没有 sessionId，尝试使用最近的一个（兼容某些客户端）
        const fallbackTransport = Array.from(activeTransports.values()).pop();
        if (fallbackTransport) {
            await fallbackTransport.handlePostMessage(req, res);
        } else {
            res.status(400).send("No active session");
        }
    }
});

const PORT = Number(process.env.PORT) || 10000;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server ready on port ${PORT}`);
});
