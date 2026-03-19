import { type JSX, Show } from 'solid-js'

interface ToggleSwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
}

export default function ToggleSwitch(props: ToggleSwitchProps): JSX.Element {
  return (
    <label class="inline-flex items-center gap-2 cursor-pointer">
      <button
        type="button"
        role="switch"
        aria-checked={props.checked}
        onClick={() => props.onChange(!props.checked)}
        class="relative w-8 h-[18px] rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
        classList={{
          'bg-accent hover:bg-accent/80': props.checked,
          'bg-border hover:bg-hover': !props.checked
        }}
      >
        <span
          class="absolute left-0 top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-transform duration-150"
          classList={{
            'translate-x-[16px]': props.checked,
            'translate-x-0.5': !props.checked
          }}
        />
      </button>
      <Show when={props.label}>
        <span class="text-[13px] text-content">{props.label}</span>
      </Show>
    </label>
  )
}
