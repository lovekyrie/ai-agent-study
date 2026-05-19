import { WorkflowEngine } from './engine.js'
import type { WorkflowContext, WorkflowEdge, WorkflowNode } from './types.js'

export class WorkflowBuilder {
  private nodes: WorkflowNode[] = []
  private edges: WorkflowEdge[] = []

  addSupervisor(id: string, name: string, role: string, instructions: string): this {
    this.nodes.push({
      id,
      type: 'supervisor',
      name,
      description: role,
      agent: { name: id, role, instructions },
    })
    return this
  }

  addSpecialist(id: string, name: string, role: string, instructions: string): this {
    this.nodes.push({
      id,
      type: 'specialist',
      name,
      description: role,
      agent: { name: id, role, instructions },
    })
    return this
  }

  addApproval(id: string, name: string, description: string): this {
    this.nodes.push({
      id,
      type: 'approval',
      name,
      description,
    })
    return this
  }

  addEnd(id: string, name: string): this {
    this.nodes.push({
      id,
      type: 'end',
      name,
      description: 'End of workflow',
    })
    return this
  }

  addEdge(from: string, to: string, condition?: (ctx: WorkflowContext) => boolean): this {
    this.edges.push({ from, to, condition })
    return this
  }

  build(): WorkflowEngine {
    return new WorkflowEngine(this.nodes, this.edges)
  }
}

export function createCodeReviewWorkflow(): WorkflowEngine {
  return new WorkflowBuilder()
    .addSupervisor(
      'supervisor',
      'Code Review Supervisor',
      'Code Review Supervisor',
      `You oversee the code review process. You have the following specialists available:
- security: Security expert who reviews for vulnerabilities
- performance: Performance expert who reviews for efficiency issues
- style: Code style expert who reviews for maintainability

Analyze the code change and delegate to appropriate specialists. When all reviews are complete, determine if the code can be approved or needs changes.`,
    )
    .addSpecialist(
      'security',
      'Security Reviewer',
      'Security Expert',
      `You are a security expert reviewing code changes. Look for:
- SQL injection vulnerabilities
- XSS vulnerabilities
- Authentication/authorization issues
- Data exposure risks
- Dependency vulnerabilities

Provide a detailed security assessment with severity levels (critical/high/medium/low).`,
    )
    .addSpecialist(
      'performance',
      'Performance Reviewer',
      'Performance Expert',
      `You are a performance expert reviewing code changes. Look for:
- N+1 query problems
- Memory leaks
- Inefficient algorithms
- Missing indexes
- Caching opportunities

Provide a detailed performance assessment with recommendations.`,
    )
    .addSpecialist(
      'style',
      'Style Reviewer',
      'Code Style Expert',
      `You are a code style expert reviewing code changes. Look for:
- Naming conventions violations
- Missing documentation
- Code duplication
- Complex conditional logic
- Error handling issues

Provide a detailed style assessment with suggestions for improvement.`,
    )
    .addApproval('approval', 'Manager Approval', 'Requires manager approval for merged changes')
    .addEnd('end', 'Complete')
    .addEdge('supervisor', 'security', (ctx) => ctx.data['securityCompleted'] !== true)
    .addEdge('supervisor', 'performance', (ctx) => ctx.data['securityCompleted'] === true && ctx.data['performanceCompleted'] !== true)
    .addEdge('supervisor', 'style', (ctx) => ctx.data['securityCompleted'] === true && ctx.data['performanceCompleted'] === true && ctx.data['styleCompleted'] !== true)
    .addEdge('security', 'supervisor')
    .addEdge('performance', 'supervisor')
    .addEdge('style', 'supervisor')
    .addEdge('supervisor', 'approval', (ctx) =>
      ctx.data['securityCompleted'] === true &&
      ctx.data['performanceCompleted'] === true &&
      ctx.data['styleCompleted'] === true,
    )
    .addEdge('approval', 'end')
    .build()
}
