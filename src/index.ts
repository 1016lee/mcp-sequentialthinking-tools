#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import { SequentialThinkingSchema, SEQUENTIAL_THINKING_TOOL } from './schema.js';
import { ThoughtData, Tool } from './types.js';

// --- 逻辑实现类 (保持原样) ---
class ToolAwareSequentialThinkingServer {
    private thought_history: ThoughtData[] = [];
    private maxHistorySize: number = 1000;

    public async processThought(input: any) {
        const validatedInput = input as ThoughtData;
        this.thought_history.push(validatedInput);
        if (this.thought_history.length > this.maxHistorySize) {
            this.thought_history = this.thought_history.slice(-this.maxHistorySize);
        }
        
        console.error(`Thought #${validatedInput.thought_number} processed`);
        
        return {
            content: [{
                type: 'text' as const,
                text: JSON.stringify({
                    thought_number: validatedInput.thought_number,
                    total_thoughts: validatedInput.total_thoughts,
                    next_thought_needed: validatedInput.next_thought_needed,
                    history_length: this.thought_history.length
                }, null, 2),
            }],
        };
    }
}

const thinkingLogic = new ToolAwareSequentialThinkingServer();

// --- 创建标准 MCP Server ---
const server = new Server(
    { name: "sequential-thinking-server", version: "1.0.0" },
    { capabilities: { tools: {} } }
);

// 注册工具
server.setRequestHandler(any, async (request) => {
    if (request.params.name === "sequentialthinking_tools") {
        return thinkingLogic.processThought(request.params.arguments);
    }
    throw new Error("Tool not found");
});

// --- Express SSE 服务设置 ---
const app = express();
let transport: SSEServerTransport | null = null;

app.get("/", (req, res) => {
    res.send("Standard MCP Server is running!");
});

app.get("/sse", async (req, res) => {
    console.log("Kelivo connected via SSE");
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

const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is ready on port ${PORT}`);
});
