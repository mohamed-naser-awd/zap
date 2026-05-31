import { useSyncExternalStore, useCallback } from 'react'

/**
 * A tiny global "prompt request" store. One pending request at a time — the
 * `<PromptHost />` component renders the dialog whenever one is present. Any
 * descendant can call `usePrompt()` to get an `async prompt(...)` function
 * that returns the entered string or `null` on cancel.
 *
 * Built on `useSyncExternalStore` so it doesn't need a Provider — works the
 * moment the host is mounted somewhere in the tree.
 */

export type PromptOptions = {
  title?: string
  label?: string
  placeholder?: string
  initialValue?: string
  okLabel?: string
  cancelLabel?: string
}

export type PromptRequest = PromptOptions & {
  title: string
  resolve: (value: string | null) => void
}

let current: PromptRequest | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

export const promptStore = {
  get(): PromptRequest | null {
    return current
  },
  set(req: PromptRequest | null) {
    current = req
    emit()
  },
  subscribe(l: () => void): () => void {
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }
}

export function useCurrentPrompt(): PromptRequest | null {
  return useSyncExternalStore(promptStore.subscribe, promptStore.get, promptStore.get)
}

export function usePrompt(): (title: string, opts?: PromptOptions) => Promise<string | null> {
  return useCallback((title, opts) => {
    return new Promise<string | null>((resolve) => {
      promptStore.set({
        title,
        ...opts,
        resolve: (v) => {
          promptStore.set(null)
          resolve(v)
        }
      })
    })
  }, [])
}
