import type { JSX } from 'solid-js'

interface SidebarIconButtonProps {
  icon: JSX.Element
  title: string
  onClick: (e: MouseEvent) => void
  visible?: boolean
}

export default function SidebarIconButton(props: SidebarIconButtonProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        props.onClick(e)
      }}
      class="bg-transparent hover:bg-border border-none text-content/60 hover:text-content cursor-pointer p-1 rounded transition-colors flex items-center"
      classList={{ invisible: props.visible === false }}
      title={props.title}
    >
      {props.icon}
    </button>
  )
}
