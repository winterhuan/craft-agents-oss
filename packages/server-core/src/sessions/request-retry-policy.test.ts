import { describe, expect, it } from 'bun:test'
import { SessionManager, createManagedSession } from './SessionManager.ts'

function buildManagedSession(id: string) {
  return createManagedSession(
    { id, name: 'retry policy test' },
    {
      id: 'ws_test',
      name: 'Test Workspace',
      rootPath: '/tmp/test-workspace',
      createdAt: Date.now(),
    } as never,
    { messagesLoaded: true },
  )
}

describe('SessionManager typed_error retry policy', () => {
  it('surfaces non-retryable typed errors instead of auto-retrying them', async () => {
    const sm = new SessionManager()
    const managed = buildManagedSession('typed-error-no-retry')
    managed.isProcessing = true
    managed.lastSentMessage = 'hello'

    await (sm as any).processEvent(managed, {
      type: 'typed_error',
      error: {
        code: 'invalid_model',
        title: 'Invalid Model',
        message: 'The selected model was not found.',
        actions: [],
        canRetry: false,
      },
    })

    expect(managed.authRetryCount ?? 0).toBe(0)
    expect(managed.messages).toHaveLength(1)
    expect(managed.messages[0]?.role).toBe('error')
    expect(managed.messages[0]?.errorCode).toBe('invalid_model')
  })

  it('still auto-retries auth refresh errors once even when canRetry is false', async () => {
    const sm = new SessionManager()
    const managed = buildManagedSession('typed-error-auth-retry')
    managed.isProcessing = true
    managed.lastSentMessage = 'hello'

    let retryCalls = 0
    ;(sm as any).sendMessage = async () => {
      retryCalls += 1
    }

    await (sm as any).processEvent(managed, {
      type: 'typed_error',
      error: {
        code: 'invalid_api_key',
        title: 'Invalid API Key',
        message: 'Your API key was rejected.',
        actions: [],
        canRetry: false,
      },
    })

    await new Promise<void>((resolve) => setImmediate(resolve))

    expect(managed.authRetryCount).toBe(1)
    expect(retryCalls).toBe(1)
    expect(managed.messages).toHaveLength(0)
  })
})
