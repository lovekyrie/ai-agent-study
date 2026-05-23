import { createCodeReviewWorkflow, WorkflowBuilder } from './index.js'

async function simpleWorkflowDemo() {
  console.log('=== Simple Workflow Demo ===\n')

  const workflow = new WorkflowBuilder()
    .addSupervisor(
      'supervisor',
      'Task Supervisor',
      'Supervisor Agent',
      'You are a supervisor coordinating a multi-step task. Delegate to specialists as needed.',
    )
    .addSpecialist(
      'research',
      'Research Specialist',
      'Research Agent',
      'You research topics and provide detailed findings.',
    )
    .addSpecialist(
      'writer',
      'Writer Specialist',
      'Writing Agent',
      'You write clear, concise content based on research findings.',
    )
    .addEnd('end', 'Complete')
    .addEdge('supervisor', 'research')
    .addEdge('supervisor', 'writer')
    .addEdge('research', 'supervisor')
    .addEdge('writer', 'supervisor')
    .addEdge('supervisor', 'end')
    .build()

  console.log('Workflow nodes:', workflow.listNodes().map(n => n.id))

  const result = await workflow.execute('simple-workflow-1', {
    task: 'Write a blog post about TypeScript',
  })

  console.log('\nWorkflow result:')
  console.log('- State:', result.state)
  console.log('- Current node:', result.currentNode)
  console.log('- History entries:', result.history.length)
  console.log('- Data:', JSON.stringify(result.data, null, 2))
}

async function codeReviewWorkflowDemo() {
  console.log('\n=== Code Review Workflow Demo ===\n')

  const workflow = createCodeReviewWorkflow()

  console.log('Workflow nodes:', workflow.listNodes().map(n => ({ id: n.id, type: n.type })))

  const result = await workflow.execute('code-review-1', {
    prTitle: 'Add user authentication',
    prDescription: 'Implement JWT-based authentication system',
    files: ['src/auth/login.ts', 'src/auth/logout.ts', 'src/middleware/auth.ts'],
    securityApproved: true,
    performanceApproved: true,
    styleApproved: false,
  })

  console.log('\nWorkflow result:')
  console.log('- State:', result.state)
  console.log('- Current node:', result.currentNode)
}

async function checkpointDemo() {
  console.log('\n=== Checkpoint Demo ===\n')

  const workflow = new WorkflowBuilder()
    .addSupervisor('supervisor', 'Task Supervisor', 'Supervisor', 'Coordinate tasks.')
    .addSpecialist('worker', 'Worker', 'Worker Agent', 'Perform work tasks.')
    .addEnd('end', 'Complete')
    .addEdge('supervisor', 'worker')
    .addEdge('worker', 'supervisor')
    .addEdge('supervisor', 'end')
    .build()

  const result = await workflow.execute('checkpoint-demo', { task: 'Test task' })

  const checkpoint = workflow.createCheckpoint(result, result.currentNode)
  console.log('Created checkpoint:', checkpoint.id)

  const restoreSuccess = await workflow.restoreFromCheckpoint(result, result.currentNode)
  console.log('Restore from checkpoint:', restoreSuccess)
}

async function main() {
  try {
    await simpleWorkflowDemo()
    await codeReviewWorkflowDemo()
    await checkpointDemo()
    console.log('\n=== Demo Complete ===')
  }
  catch (error) {
    console.error('Demo failed:', error)
  }
}

main().catch(console.error)
