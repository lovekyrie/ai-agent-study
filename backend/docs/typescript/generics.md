# TypeScript 泛型（Generics）

## 是什么

**泛型**是在定义函数、类、接口时留出的「类型参数」占位符，写代码时不写死具体类型，**用时再指定**。

```ts
// T 是类型参数，调用时可以是 string、number、User...
function identity<T>(value: T): T {
  return value
}

const a = identity('hello')  // T 推断为 string
const b = identity(42)       // T 推断为 number
```

可以把它理解成：**类型的函数参数**——和值参数一样，只是参数的类型是「类型本身」。

## 核心用处

### 1. 复用逻辑，又不丢类型信息

没有泛型时，要么写很多重载，要么退回 `any` 丢类型：

```ts
// 不好：返回值变成 any
function wrapBad(value: any) {
  return { data: value }
}

// 好：输入什么，data 就是什么
function wrap<T>(value: T) {
  return { data: value }
}
```

### 2. 约束「有关联」的类型

多个位置必须用**同一种**类型，或满足某种关系：

```ts
function first<T>(arr: T[]): T | undefined {
  return arr[0]
}
// first([1, 2]) → number | undefined，不是 any
```

### 3. 接口 / 类型上的参数化

```ts
interface ApiResponse<T> {
  ok: boolean
  data: T
}

type UserResponse = ApiResponse<{ id: string; name: string }>
```

### 4. 约束泛型范围（`extends`）

限制 `T` 必须满足某结构，才能在函数里安全访问字段：

```ts
function getId<T extends { id: string }>(item: T): string {
  return item.id
}
```

### 5. 从已有类型推导新类型

Zod、工具类型都依赖泛型：

```ts
type Config = z.infer<typeof ConfigSchema>  // 从 schema 推出 Config 类型
type PartialUser = Partial<User>
```

## 常见写法速查

| 写法 | 含义 |
|------|------|
| `<T>` | 一个类型参数 |
| `<T, U>` | 多个类型参数 |
| `<T extends Foo>` | T 必须是 Foo 或其子类型 |
| `<T = string>` | 默认类型参数 |
| `keyof T` | T 的所有键组成的联合类型 |
| `T[K]` | 索引访问类型 |

## 在本仓库里的例子

**Zod schema → 类型**（`packages/config/src/schemas.ts`）：

```ts
export const LLMConfigSchema = z.object({ ... })
export type LLMConfig = z.infer<typeof LLMConfigSchema>
```

`z.infer<typeof Schema>` 是泛型：传入不同的 schema 类型，推出不同的 Config 类型，避免手写两遍。

**工具注册**（`packages/tools` 等）：`ToolDefinition<TInput>` 让每个工具的 params 类型和 handler 参数一致。

## 和 `any` 的区别

| | 泛型 | any |
|---|------|-----|
| 类型安全 | 保留，用时指定 | 基本放弃检查 |
| 复用 | 一份实现多种类型 | 一份实现，但全 any |
| 推断 | IDE 能补全、报错 | 补全弱、易漏 bug |

## 一句话

泛型 = **写一次逻辑，多种类型都能用，且编译期仍知道具体是什么类型**。
