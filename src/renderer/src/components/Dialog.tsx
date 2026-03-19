import { X } from 'lucide-solid'
import { type JSX, onCleanup, onMount } from 'solid-js'

interface DialogProps {
  title: string
  onClose: () => void
  children: JSX.Element
  footer?: JSX.Element
}

export default function Dialog(props: DialogProps): JSX.Element {
  let dialogRef!: HTMLDialogElement

  onMount(() => {
    dialogRef.showModal()
    const handleClose = (): void => props.onClose()
    const handleBackdrop = (e: MouseEvent): void => {
      if (e.target === dialogRef) dialogRef.close()
    }
    dialogRef.addEventListener('close', handleClose)
    dialogRef.addEventListener('click', handleBackdrop)
    onCleanup(() => {
      dialogRef.removeEventListener('close', handleClose)
      dialogRef.removeEventListener('click', handleBackdrop)
    })
  })

  return (
    <dialog
      ref={dialogRef}
      class="p-0 border-none rounded-lg shadow-xl max-w-md w-full bg-sidebar text-content"
      style={{
        'max-height': '80vh',
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)'
      }}
    >
      <div class="flex flex-col h-full max-h-[80vh]">
        {/* Header */}
        <div class="flex items-center w-full h-8 bg-sidebar border-b border-border shrink-0 select-none">
          <div class="flex-1 flex items-center px-3 text-heading text-[13px] font-medium">
            {props.title}
          </div>
          <div class="flex items-center">
            <button
              type="button"
              onClick={() => dialogRef.close()}
              class="flex items-center justify-center w-10 h-8 bg-transparent border-none cursor-pointer text-heading hover:bg-active transition-colors"
              title="Close"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div class="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-4">{props.children}</div>

        {/* Footer */}
        <div class="flex justify-end gap-2 px-4 py-3 border-t border-border flex-shrink-0">
          {props.footer}
        </div>
      </div>
    </dialog>
  )
}
