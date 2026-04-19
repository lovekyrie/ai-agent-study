/**
 * Express 服务器 - 提供网页对话接口
 * 支持 SSE 流式响应
 */
import express from 'express';
import { config } from 'dotenv';
import { Agent } from '../agent/index.js';
import { v4 as uuidv4 } from 'uuid';
import { getAllToolDefinitions } from '../tools/index.js';
config();
const app = express();
app.use(express.json());
const sessions = new Map();
function getOrCreateSession(sessionId) {
    if (sessionId && sessions.has(sessionId)) {
        return sessions.get(sessionId);
    }
    const id = sessionId ?? uuidv4();
    const agent = Agent.create({
        stream: true
    });
    const session = { id, agent, createdAt: new Date() };
    sessions.set(id, session);
    return session;
}
// ==================== API 路由 ====================
/**
 * POST /api/chat - 发送消息（非流式）
 */
app.post('/api/chat', async (req, res) => {
    const { message, sessionId } = req.body;
    if (!message) {
        res.status(400).json({ error: 'message is required' });
        return;
    }
    const session = getOrCreateSession(sessionId);
    try {
        const response = await session.agent.process(message);
        res.json({
            sessionId: session.id,
            ...response
        });
    }
    catch (error) {
        console.error('[Server] Chat error:', error);
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Internal error'
        });
    }
});
/**
 * POST /api/chat/stream - 发送消息（流式，SSE）
 */
app.post('/api/chat/stream', async (req, res) => {
    const { message, sessionId } = req.body;
    if (!message) {
        res.status(400).json({ error: 'message is required' });
        return;
    }
    const session = getOrCreateSession(sessionId);
    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    // 发送 sessionId
    res.write(`event: session\ndata: ${JSON.stringify({ sessionId: session.id })}\n\n`);
    try {
        let fullContent = '';
        await session.agent.processStream(message, (delta) => {
            fullContent += delta;
            res.write(`event: chunk\ndata: ${JSON.stringify({ delta })}\n\n`);
        });
        res.write(`event: done\ndata: ${JSON.stringify({ content: fullContent })}\n\n`);
        res.end();
    }
    catch (error) {
        console.error('[Server] Stream error:', error);
        res.write(`event: error\ndata: ${JSON.stringify({ error: error instanceof Error ? error.message : 'Internal error' })}\n\n`);
        res.end();
    }
});
/**
 * GET /api/sessions/:id - 获取会话信息
 */
app.get('/api/sessions/:id', (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
    }
    res.json({
        id: session.id,
        createdAt: session.createdAt,
        messageCount: session.agent.getMessageCount()
    });
});
/**
 * DELETE /api/sessions/:id - 删除会话
 */
app.delete('/api/sessions/:id', (req, res) => {
    const deleted = sessions.delete(req.params.id);
    res.json({ deleted });
});
/**
 * GET /api/tools - 获取可用工具列表
 */
app.get('/api/tools', (_req, res) => {
    res.json({ tools: getAllToolDefinitions() });
});
// ==================== 启动服务器 ====================
const PORT = parseInt(process.env.PORT ?? '3000', 10);
app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════╗
║                                                      ║
║   🤖 AI Agent Server (Stage 2)                       ║
║                                                      ║
║   HTTP Server:  http://localhost:${PORT}                ║
║                                                      ║
║   Endpoints:                                         ║
║     POST /api/chat          - 非流式对话              ║
║     POST /api/chat/stream   - 流式对话 (SSE)         ║
║     GET  /api/sessions/:id  - 获取会话信息            ║
║     DELETE /api/sessions/:id - 删除会话              ║
║     GET  /api/tools         - 获取可用工具列表        ║
║                                                      ║
╚══════════════════════════════════════════════════════╝
  `);
});
//# sourceMappingURL=index.js.map