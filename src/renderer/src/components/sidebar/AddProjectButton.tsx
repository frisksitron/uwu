import { FolderPlus } from 'lucide-solid'
import type { JSX } from 'solid-js'

interface AddProjectButtonProps {
  onClick: () => void
}

export default function AddProjectButton(props: AddProjectButtonProps): JSX.Element {
  return (
    <div class="border-t border-border">
      <button
        type="button"
        onClick={props.onClick}
        class="w-full py-1.5 px-2 bg-transparent border-none text-muted hover:text-accent cursor-pointer text-[11px] flex items-center justify-center gap-1 transition-colors"
      >
        <FolderPlus size={10} />
        Add Project
      </button>
    </div>
  )
}
