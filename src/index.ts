#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import express from "express";

// --- 顺序思维核心逻辑 ---
class SequentialThinkingServer {
    private thought_history: any[] = [];

    public processThought(args: any) {
        const { thought, thought_number, total_thoughts, next_thought_needed, is_revision, revises_thought } = args;
        
        // 构造当前思考步骤的对象
        const current_thought = {
            thought,
            thought_number,
            total_thoughts,
            is_revision,
            revises_thought
        };

        // 记录历史
        this.thought_history.push(current_thought);

        // 打印到日志，方便你调试看 AI 的思考过程
        console.log(`[Thought ${thought_number}/${total_thoughts}] ${thought.substring(0, 50)}...`);

        // 返回给 AI 的内容（让 AI 知道服务器已记住了这一步）
        return {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    status: "accepted",
                    step: thought_number,
                    remaining: Math.max(0, total_thoughts - thought_number),
                    history_depth: this.thought_history.length
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

// --- 注册工具定义 ---
server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [{
        name: "sequentialthinking_tools",
        description: "A tool for dynamic and reflective deep thinking. Use this to break down complex problems into steps.",
        inputSchema: {
            type: "object",
            properties: {
                thought: { type: "string", description: "Your current reasoning step" },
                thought_number: { type: "integer", description: "Current step (1-indexed)" },
                total_thoughts: { type: "integer", description: "Estimated total steps needed" },
                next_thought_needed: { type: "boolean", description: "True if you need another step" },
                is_revision: { type: "boolean", description: "Is this correcting a previous step?" },
                revises_thought: { type: "integer", description: "If revision, which step index?" }
            },
            required: ["thought", "thought_number", "total_thoughts", "next_thought_needed"]
        }
    }]
}));

// --- 处理 AI 调用 ---
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === "sequentialthinking_tools") {
        return thinkingLogic.processThought(request.params.arguments);
    }
    throw new Error("Tool not found");
});

// --- Express SSE 服务逻辑 (保持刚才成功的配置) ---
const app = express();
let currentTransport: SSEServerTransport | null = null;

app.get("/sse", async (req, res) => {
    console.log(">>> SSE: Connection Start");
    currentTransport = new SSEServerTransport("/messages", res);
    await server.connect(currentTransport);
});

app.post("/messages", express.json(), async (req, res) => {
    if (currentTransport) {
        try {
            await currentTransport.handlePostMessage(req, res, req.body);
        } catch (err) {
            console.error(">>> POST: Error", err);
        }
    } else {
        res.status(400).send("No Session");
    }
});

app.get("/", (req, res) => res.send("Sequential Thinking Server Ready"));

const PORT = Number(process.env.PORT) || 10000;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Ready on ${PORT}`);
});
