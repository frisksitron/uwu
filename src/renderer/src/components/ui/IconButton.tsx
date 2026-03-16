import type { JSX } from 'solid-js'

interface IconButtonProps {
  onClick: (e: MouseEvent) => void
  title: string
  children: JSX.Element
  class?: string
}

export default function IconButton(props: IconButtonProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        props.onClick(e)
      }}
      class={
        props.class ??
        'invisible group-hover:visible bg-transparent hover:bg-border border-none text-content/60 hover:text-content cursor-pointer p-1 rounded transition-colors flex items-center'
      }
      title={props.title}
    >
      {props.children}
    </button>
  )
}
