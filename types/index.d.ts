/** Whether a diagram shows its source instead of its drawing. */
export type ShowCode = boolean

declare module 'claude-code' {
  interface PluginState {
    'gfm-render': {
      /** Per message and position of the diagram in it. */
      showCode: StateFamily<ShowCode>
    }
  }
}
