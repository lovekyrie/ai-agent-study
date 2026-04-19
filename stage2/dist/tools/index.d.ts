/**
 * 工具系统 - 定义和注册 Agent 可调用的工具
 * 当用户提问时，Agent 决定调用哪个工具
 */
export interface ToolDefinition {
    name: string;
    description: string;
    parameters: {
        type: 'object';
        properties: Record<string, {
            type: string;
            description: string;
        }>;
        required: string[];
    };
}
export interface ToolCall {
    id?: string;
    name: string;
    arguments: Record<string, unknown>;
}
export interface ToolResult {
    callId?: string;
    name: string;
    success: boolean;
    result: unknown;
    error?: string;
}
export declare const toolDefinitions: ToolDefinition[];
/**
 * 根据工具名称查找定义
 */
export declare function getToolDefinition(name: string): ToolDefinition | undefined;
/**
 * 执行工具调用
 */
export declare function executeToolCall(call: ToolCall): Promise<ToolResult>;
/**
 * 获取所有工具定义（用于传给 LLM）
 */
export declare function getAllToolDefinitions(): ToolDefinition[];
