import { PromptDialog } from './PromptDialog'
import { useCurrentPrompt } from '@renderer/lib/usePrompt'

/**
 * Mount once near the renderer root. Listens to the global prompt store and
 * renders the dialog whenever a request is pending. Routes that need a prompt
 * call `usePrompt()` to get a function that pushes a request and awaits a
 * result; this host displays it and resolves the promise.
 */
export function PromptHost() {
  const req = useCurrentPrompt()
  return (
    <PromptDialog
      open={!!req}
      title={req?.title ?? ''}
      label={req?.label}
      placeholder={req?.placeholder}
      initialValue={req?.initialValue}
      okLabel={req?.okLabel}
      cancelLabel={req?.cancelLabel}
      onSubmit={(value) => req?.resolve(value || null)}
      onCancel={() => req?.resolve(null)}
    />
  )
}
