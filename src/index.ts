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

// 工具注册逻辑
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
        return { content: [{ type: 'text', text: "Logic Processed" }] };
    }
    throw new Error("Tool not found");
});

const app = express();

// 1. 提前声明全局解析器，确保所有 POST 请求都能被解析
app.use(express.json());

let transport: SSEServerTransport | null = null;

app.get("/sse", async (req, res) => {
    // 关键点：手动拼接绝对 URL。例如 https://xxx.onrender.com/messages
    // 这样 Kelivo 就不会因为相对路径解析失败
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.get('host');
    const messageUrl = `${protocol}://${host}/messages`;
    
    console.log(`Kelivo connected. Instructing callback to: ${messageUrl}`);

    transport = new SSEServerTransport(messageUrl as `/${string}`, res);
    await server.connect(transport);
});

app.post("/messages", async (req, res) => {
    console.log("POST /messages received. Body keys:", Object.keys(req.body));
    if (transport) {
        await transport.handlePostMessage(req, res);
    } else {
        // 容错：如果 transport 因为并发丢失，重新尝试基于当前响应建立（虽然不推荐但增加成功率）
        res.status(400).send("No active session");
    }
});

app.get("/", (req, res) => res.send("Server is alive"));

const PORT = Number(process.env.PORT) || 10000;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
});
