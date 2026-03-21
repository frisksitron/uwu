import { Select as KSelect } from '@kobalte/core/select'
import { Check, ChevronDown } from 'lucide-solid'
import { type JSX, Show } from 'solid-js'

type ValueAccessor<T> = keyof T | ((item: T) => string)

export interface SelectGroup<T> {
  label: string
  options: T[]
}

export interface SelectProps<T> {
  options?: T[]
  groups?: SelectGroup<T>[]
  value: T | undefined
  onChange: (value: T | undefined) => void
  placeholder?: string
  optionValue?: ValueAccessor<T>
  optionLabel?: ValueAccessor<T>
  itemRender?: (item: T) => JSX.Element
  size?: 'compact' | 'default'
  label?: string
  triggerClass?: string
  class?: string
}

function resolve<T>(accessor: ValueAccessor<T> | undefined, item: T): string {
  if (!accessor) return String(item)
  if (typeof accessor === 'function') return accessor(item)
  return String(item[accessor])
}

export default function Select<T>(props: SelectProps<T>): JSX.Element {
  const compact = () => (props.size ?? 'default') === 'compact'
  const grouped = () => !!props.groups

  const resolvedOptionValue = () =>
    props.optionValue
      ? typeof props.optionValue === 'function'
        ? props.optionValue
        : (String(props.optionValue) as keyof T & string)
      : undefined

  const resolvedOptionTextValue = () =>
    props.optionLabel ? (item: T) => resolve(props.optionLabel, item) : undefined

  const itemComponent = (itemProps: { item: { rawValue: T } }) => (
    <KSelect.Item
      // biome-ignore lint/suspicious/noExplicitAny: Kobalte expects CollectionNode but we only need rawValue
      item={itemProps.item as any}
      class="flex items-center justify-between px-2 py-1 text-content cursor-pointer rounded outline-none transition-colors data-[highlighted]:bg-hover data-[selected]:text-accent"
      classList={{
        'text-[11px]': compact(),
        'text-[13px]': !compact()
      }}
    >
      <KSelect.ItemLabel class="truncate">
        {props.itemRender
          ? props.itemRender(itemProps.item.rawValue)
          : resolve(props.optionLabel, itemProps.item.rawValue)}
      </KSelect.ItemLabel>
      <KSelect.ItemIndicator class="ml-2 flex-shrink-0 text-accent">
        <Check size={compact() ? 10 : 12} />
      </KSelect.ItemIndicator>
    </KSelect.Item>
  )

  const triggerClass = () =>
    props.triggerClass ??
    (compact()
      ? 'inline-flex items-center gap-0.5 bg-transparent border-none rounded px-1 py-0.5 text-[11px] text-muted hover:text-content cursor-pointer focus:outline-none transition-colors min-w-0 max-w-28 truncate'
      : 'w-full flex items-center justify-between bg-terminal border border-input text-content text-[13px] px-2 py-1.5 rounded-lg cursor-pointer hover:border-accent transition-colors text-left')

  return (
    <Show
      when={grouped()}
      fallback={
        <KSelect<T>
          options={props.options ?? []}
          optionValue={resolvedOptionValue()}
          optionTextValue={resolvedOptionTextValue()}
          value={props.value ?? null}
          onChange={(val) => props.onChange(val ?? undefined)}
          sameWidth
          fitViewport
          hideWhenDetached
          placeholder={props.placeholder ?? 'Select...'}
          itemComponent={itemComponent}
          class={props.class}
        >
          <KSelect.Trigger class={triggerClass()} aria-label={props.label}>
            <KSelect.Value<T> class="truncate">
              {(state) => {
                const selected = state.selectedOption()
                return selected ? resolve(props.optionLabel, selected) : props.placeholder
              }}
            </KSelect.Value>
            <Show when={!compact()}>
              <KSelect.Icon class="flex-shrink-0 text-muted ml-1">
                <ChevronDown size={14} />
              </KSelect.Icon>
            </Show>
          </KSelect.Trigger>
          <KSelect.Portal>
            <KSelect.Content class="kobalte-dropdown bg-sidebar border border-border rounded-lg shadow-lg z-50 overflow-hidden">
              <KSelect.Listbox class="max-h-48 overflow-y-auto p-1 outline-none" />
            </KSelect.Content>
          </KSelect.Portal>
        </KSelect>
      }
    >
      <KSelect<T, SelectGroup<T>>
        options={props.groups ?? []}
        optionValue={resolvedOptionValue()}
        optionTextValue={resolvedOptionTextValue()}
        optionGroupChildren="options"
        value={props.value ?? null}
        onChange={(val) => props.onChange(val ?? undefined)}
        sameWidth
        fitViewport
        hideWhenDetached
        placeholder={props.placeholder ?? 'Select...'}
        itemComponent={itemComponent}
        sectionComponent={(sectionProps) => (
          <KSelect.Section
            class="text-muted text-[10px] uppercase tracking-wider font-medium px-2 pt-2 pb-0.5"
            classList={{ 'pt-1': compact() }}
          >
            {sectionProps.section.rawValue.label}
          </KSelect.Section>
        )}
        class={props.class}
      >
        <KSelect.Trigger class={triggerClass()} aria-label={props.label}>
          <KSelect.Value<T> class="truncate">
            {(state) => {
              const selected = state.selectedOption()
              return selected ? resolve(props.optionLabel, selected) : props.placeholder
            }}
          </KSelect.Value>
          <Show when={!compact()}>
            <KSelect.Icon class="flex-shrink-0 text-muted ml-1">
              <ChevronDown size={14} />
            </KSelect.Icon>
          </Show>
        </KSelect.Trigger>
        <KSelect.Portal>
          <KSelect.Content class="kobalte-dropdown bg-sidebar border border-border rounded-lg shadow-lg z-50 overflow-hidden">
            <KSelect.Listbox class="max-h-48 overflow-y-auto p-1 outline-none" />
          </KSelect.Content>
        </KSelect.Portal>
      </KSelect>
    </Show>
  )
}
