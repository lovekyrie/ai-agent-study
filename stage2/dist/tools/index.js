/**
 * 工具系统 - 定义和注册 Agent 可调用的工具
 * 当用户提问时，Agent 决定调用哪个工具
 */
import * as fs from 'fs';
import * as path from 'path';
// ==================== 工具实现 ====================
/**
 * 读取本地文件内容
 */
async function readLocalFile(args) {
    const filePath = path.resolve(args.filePath);
    if (!fs.existsSync(filePath)) {
        throw new Error(`文件不存在: ${filePath}`);
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    // 限制文件大小（最大 30KB）
    if (content.length > 30 * 1024) {
        return content.slice(0, 30 * 1024) + '\n... (文件过大，已截断)';
    }
    return content;
}
/**
 * 模拟网络搜索（实际项目中可接入 Tavily/SerpAPI 等）
 */
async function searchWeb(args) {
    // 演示用：返回模拟搜索结果
    // 实际项目中应接入真实的搜索 API
    console.log(`[搜索] 查询: ${args.query}`);
    // 模拟搜索结果
    const results = [
        {
            title: `${args.query} - 相关文章 1`,
            snippet: `这是关于 "${args.query}" 的搜索结果摘要...`,
            url: 'https://example.com/article-1'
        },
        {
            title: `${args.query} - 相关文章 2`,
            snippet: `关于 "${args.query}" 的另一个信息来源...`,
            url: 'https://example.com/article-2'
        }
    ];
    return JSON.stringify(results, null, 2);
}
/**
 * 获取当前时间
 */
async function getCurrentTime(_args) {
    return new Date().toISOString();
}
// ==================== 工具注册表 ====================
const toolImplementations = {
    read_local_file: readLocalFile,
    search_web: searchWeb,
    get_current_time: getCurrentTime,
};
export const toolDefinitions = [
    {
        name: 'read_local_file',
        description: '读取本地文件内容。适用于查看代码文件、配置文件、文档等。输入文件路径（绝对路径或相对路径）。',
        parameters: {
            type: 'object',
            properties: {
                filePath: {
                    type: 'string',
                    description: '要读取的文件路径'
                }
            },
            required: ['filePath']
        }
    },
    {
        name: 'search_web',
        description: '搜索网络获取最新信息。适用于查询新闻、实时数据、最新资讯等。',
        parameters: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: '搜索查询关键词'
                }
            },
            required: ['query']
        }
    },
    {
        name: 'get_current_time',
        description: '获取当前的日期和时间。无需输入参数。',
        parameters: {
            type: 'object',
            properties: {},
            required: []
        }
    }
];
/**
 * 根据工具名称查找定义
 */
export function getToolDefinition(name) {
    return toolDefinitions.find(t => t.name === name);
}
/**
 * 执行工具调用
 */
export async function executeToolCall(call) {
    const { name, arguments: args } = call;
    const implementation = toolImplementations[name];
    if (!implementation) {
        return {
            name,
            success: false,
            result: null,
            error: `未知工具: ${name}`
        };
    }
    try {
        const result = await implementation(args);
        return {
            name,
            success: true,
            result
        };
    }
    catch (error) {
        return {
            name,
            success: false,
            result: null,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}
/**
 * 获取所有工具定义（用于传给 LLM）
 */
export function getAllToolDefinitions() {
    return toolDefinitions;
}
//# sourceMappingURL=index.js.map