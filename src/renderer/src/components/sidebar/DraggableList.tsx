import { createSignal, For, type JSX } from 'solid-js'

interface DraggableListProps<T> {
  items: T[]
  keyFn: (item: T) => string
  children: (item: T, index: () => number) => JSX.Element
  onReorder: (newItems: T[]) => void
}

export default function DraggableList<T>(props: DraggableListProps<T>): JSX.Element {
  const [draggedKey, setDraggedKey] = createSignal<string | null>(null)
  const [dropTargetKey, setDropTargetKey] = createSignal<string | null>(null)
  const [dropPosition, setDropPosition] = createSignal<'before' | 'after'>('after')

  function handleDragStart(key: string, e: DragEvent): void {
    setDraggedKey(key)
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', key)
    }
  }

  function handleDragOver(key: string, e: DragEvent): void {
    e.preventDefault()
    if (!draggedKey() || draggedKey() === key) {
      setDropTargetKey(null)
      return
    }
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const midpoint = rect.top + rect.height * 0.4
    setDropPosition(e.clientY < midpoint ? 'before' : 'after')
    setDropTargetKey(key)
  }

  function handleDrop(e: DragEvent): void {
    e.preventDefault()
    const fromKey = draggedKey()
    const toKey = dropTargetKey()
    if (!fromKey || !toKey || fromKey === toKey) {
      reset()
      return
    }

    const items = [...props.items]
    const fromIndex = items.findIndex((i) => props.keyFn(i) === fromKey)
    const toIndex = items.findIndex((i) => props.keyFn(i) === toKey)
    if (fromIndex === -1 || toIndex === -1) {
      reset()
      return
    }

    const [moved] = items.splice(fromIndex, 1)
    const insertAt = dropPosition() === 'before' ? toIndex : toIndex + 1
    const adjustedInsert = fromIndex < toIndex ? insertAt - 1 : insertAt
    items.splice(adjustedInsert, 0, moved)
    props.onReorder(items)
    reset()
  }

  function handleDragEnd(): void {
    reset()
  }

  function reset(): void {
    setDraggedKey(null)
    setDropTargetKey(null)
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: drop zone for DnD reordering
    <div onDrop={handleDrop}>
      <For each={props.items}>
        {(item, index) => {
          const key = props.keyFn(item)
          return (
            // biome-ignore lint/a11y/noStaticElementInteractions: draggable item
            <div
              draggable={true}
              onDragStart={(e) => handleDragStart(key, e)}
              onDragOver={(e) => handleDragOver(key, e)}
              onDragEnd={handleDragEnd}
              classList={{
                'dnd-dragging': draggedKey() === key,
                'dnd-indicator-before': dropTargetKey() === key && dropPosition() === 'before',
                'dnd-indicator-after': dropTargetKey() === key && dropPosition() === 'after'
              }}
            >
              {props.children(item, index)}
            </div>
          )
        }}
      </For>
    </div>
  )
}
