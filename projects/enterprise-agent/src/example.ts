import { WORKFLOW_TEMPLATES, WorkflowOrchestrator } from './index.js'

async function main() {
  console.log('=== Enterprise Workflow Agent Demo ===\n')

  // Create orchestrator
  const orchestrator = new WorkflowOrchestrator()

  // Register event handlers
  orchestrator.on('workflow-started', (instance) => {
    console.log('Workflow started:', instance.id)
  })

  orchestrator.on('node-enter', ({ nodeId, nodeType }) => {
    console.log(`  Entering node: ${nodeId} (${nodeType})`)
  })

  orchestrator.on('task-started', ({ task }) => {
    console.log(`    Task started: ${task.name}`)
  })

  orchestrator.on('workflow-completed', (instance) => {
    console.log('Workflow completed:', instance.id)
    console.log('Final context:', instance.context)
  })

  orchestrator.on('workflow-error', ({ error }) => {
    console.error('Workflow error:', error)
  })

  // List available agents
  console.log('Available agents:')
  for (const agent of orchestrator.listAgents()) {
    console.log(`  - ${agent.name}: ${agent.role}`)
  }

  // Register a workflow
  const codeReviewWorkflow = WORKFLOW_TEMPLATES.codeReview()
  orchestrator.registerWorkflow(codeReviewWorkflow)
  console.log('\nRegistered workflow:', codeReviewWorkflow.name)

  // Register a task handler
  orchestrator.registerTaskHandler('lint', async (task, context) => {
    console.log('    Running linter on code...')
    await new Promise(resolve => setTimeout(resolve, 100))
    return {
      success: true,
      output: 'Linting passed with no errors',
      artifacts: { lintPassed: true },
    }
  })

  orchestrator.registerTaskHandler('test', async (task, context) => {
    console.log('    Running tests...')
    await new Promise(resolve => setTimeout(resolve, 100))
    const passed = Math.random() > 0.1 // 90% pass rate
    return {
      success: passed,
      output: passed ? 'All tests passed' : 'Some tests failed',
      artifacts: { testsPassed: passed },
    }
  })

  // Start workflow
  console.log('\nStarting code review workflow...')
  const instance = await orchestrator.startWorkflow('code-review', {
    prNumber: 123,
    repo: 'owner/repo',
    author: 'developer@example.com',
  })

  console.log('Instance created:', instance.id)

  // Wait for completion
  await new Promise(resolve => setTimeout(resolve, 500))

  // Check final status
  const finalInstance = orchestrator.getInstance(instance.id)
  if (finalInstance) {
    console.log('\nFinal status:', finalInstance.status)
    console.log('Tasks completed:', finalInstance.tasks.filter(t => t.status === 'completed').length)
    console.log('Context:', finalInstance.context)
  }

  console.log(`

=== Workflow Types ===

1. Code Review Workflow
   - Lint → Test → Human Review → End

2. Ticket Processing Workflow
   - Categorize (LLM) → Route by Priority → Process → Notify → End

=== Key Features ===

1. Multi-Agent Coordination
   - Supervisor: Task decomposition
   - Reviewer: Content approval
   - Executor: Task execution
   - Notifier: Stakeholder updates

2. Flexible Node Types
   - start/end: Workflow boundaries
   - task: Execute registered handlers
   - approval: Human-in-the-loop
   - condition: LLM-powered branching
   - parallel: Concurrent execution
   - agent: LLM agent delegation

3. Context Passing
   - Artifacts from tasks flow into context
   - Context available to all nodes
   - Rich audit trail via events
`)
}

main().catch(console.error)
