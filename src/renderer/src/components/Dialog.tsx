import { Dialog as KDialog } from '@kobalte/core/dialog'
import { X } from 'lucide-solid'
import type { JSX } from 'solid-js'

interface DialogProps {
  title: string
  onClose: () => void
  children: JSX.Element
  footer?: JSX.Element
}

export default function Dialog(props: DialogProps): JSX.Element {
  return (
    <KDialog open onOpenChange={(open) => !open && props.onClose()} modal>
      <KDialog.Portal>
        <KDialog.Overlay class="fixed inset-0 z-40 bg-black/30" />
        <KDialog.Content
          class="fixed z-50 p-0 border-none rounded-lg shadow-xl max-w-md w-full bg-sidebar text-content"
          style={{
            'max-height': '80vh',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)'
          }}
        >
          <div class="flex flex-col h-full max-h-[80vh] overflow-hidden rounded-lg">
            {/* Header */}
            <div class="flex items-center w-full h-8 bg-sidebar border-b border-border shrink-0 select-none">
              <KDialog.Title class="flex-1 flex items-center px-3 text-heading text-[13px] font-medium m-0">
                {props.title}
              </KDialog.Title>
              <div class="flex items-center">
                <KDialog.CloseButton class="flex items-center justify-center w-10 h-8 bg-transparent border-none cursor-pointer text-heading hover:bg-active transition-colors">
                  <X size={16} />
                </KDialog.CloseButton>
              </div>
            </div>

            {/* Body */}
            <div class="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-4">{props.children}</div>

            {/* Footer */}
            <div class="flex justify-end gap-2 px-4 py-3 border-t border-border flex-shrink-0">
              {props.footer}
            </div>
          </div>
        </KDialog.Content>
      </KDialog.Portal>
    </KDialog>
  )
}
