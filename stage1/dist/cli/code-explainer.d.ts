/**
 * CLI 代码解释器
 * 读取本地文件内容，发送给 LLM，然后在终端流式输出解释
 */
/**
 * 主解释函数
 */
export declare function explainFile(filePath: string): Promise<void>;
/**
 * 交互模式 - 持续对话
 */
export declare function interactiveMode(): Promise<void>;
//# sourceMappingURL=code-explainer.d.ts.map