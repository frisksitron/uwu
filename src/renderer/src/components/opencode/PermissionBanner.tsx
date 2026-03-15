import { Check, Sparkles } from 'lucide-solid'
import { For, type JSX, Show } from 'solid-js'
import type { OcPermission } from '../../opencodeStore'

interface PermissionBannerProps {
  permissions: OcPermission[]
  onRespond: (permissionId: string, response: 'once' | 'always' | 'reject') => void
}

export default function PermissionBanner(props: PermissionBannerProps): JSX.Element {
  return (
    <Show when={props.permissions.length > 0}>
      <div class="flex flex-col gap-2">
        <For each={props.permissions}>
          {(perm) => (
            <div class="flex items-center gap-2 text-[12px]">
              <div class="flex items-center gap-1.5 flex-1 min-w-0">
                <Sparkles size={12} class="text-heading flex-shrink-0" />
                <span class="font-medium text-content truncate" title={perm.title}>
                  {perm.title}
                </span>
              </div>
              <button
                type="button"
                onClick={() => props.onRespond(perm.id, 'once')}
                class="flex items-center gap-1 bg-accent hover:bg-accent/85 text-white border-none cursor-pointer px-2.5 py-1 rounded-md text-[11px] font-medium shadow-sm transition-colors"
              >
                <Check size={11} />
                Allow
              </button>
              <button
                type="button"
                onClick={() => props.onRespond(perm.id, 'always')}
                class="bg-success/20 hover:bg-success/30 text-success border-none cursor-pointer px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors"
              >
                Always
              </button>
              <button
                type="button"
                onClick={() => props.onRespond(perm.id, 'reject')}
                class="bg-transparent border border-border text-muted cursor-pointer px-2.5 py-1 rounded-md text-[11px] font-medium hover:bg-error/10 hover:text-error hover:border-error/30 transition-colors"
              >
                Deny
              </button>
            </div>
          )}
        </For>
      </div>
    </Show>
  )
}
