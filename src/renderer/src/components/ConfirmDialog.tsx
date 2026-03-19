import type { JSX } from 'solid-js'
import Dialog from './Dialog'

interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog(props: ConfirmDialogProps): JSX.Element {
  return (
    <Dialog
      title={props.title}
      onClose={props.onCancel}
      footer={
        <>
          <button
            type="button"
            onClick={props.onCancel}
            class="px-4 py-1.5 bg-transparent border border-border text-content cursor-pointer text-[13px] rounded-lg font-medium hover:bg-hover transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={props.onConfirm}
            class="px-4 py-1.5 bg-error text-white border-none cursor-pointer text-[13px] rounded-lg font-medium hover:bg-error/80 transition-colors"
          >
            {props.confirmLabel}
          </button>
        </>
      }
    >
      <p class="text-[13px] text-content m-0">{props.message}</p>
    </Dialog>
  )
}
