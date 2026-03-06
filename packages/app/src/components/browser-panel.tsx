import { Show, onMount, onCleanup, createSignal } from "solid-js"
import { connect, disconnect } from "@/lib/screencast"

export type BrowserStatus = "disconnected" | "connecting" | "connected"

const WS_PORT = 8765

function Panel(props: { width: number; onClose: () => void }) {
  const [status, setStatus] = createSignal<BrowserStatus>("disconnected")
  let el!: HTMLCanvasElement

  onMount(() => connect(el, `ws://localhost:${WS_PORT}`, setStatus))
  onCleanup(disconnect)

  return (
    <div
      class="flex flex-col border-l border-border-weak-base bg-background-base h-full relative"
      style={{ width: `${props.width}px` }}
    >
      <div class="flex items-center justify-between px-4 py-2 border-b border-border-weak-base flex-shrink-0">
        <div class="flex items-center gap-2">
          <span class="text-14-medium text-text-strong">Browser</span>
          <div
            class="w-2 h-2 rounded-full"
            classList={{
              "bg-red-500": status() === "disconnected",
              "bg-yellow-500": status() === "connecting",
              "bg-green-500": status() === "connected",
            }}
          />
        </div>
        <button
          class="text-text-weak hover:text-text-strong transition-colors"
          onClick={props.onClose}
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <div class="relative flex-1 w-full h-full overflow-hidden">
        <canvas ref={el} style={{ width: "100%", height: "100%" }} class="block" />
        <Show when={status() === "disconnected"}>
          <div class="absolute inset-0 flex items-center justify-center bg-background-base/80 z-10 backdrop-blur-sm">
            <span class="text-14-regular text-text-weak">Connect to Chrome to start browsing</span>
          </div>
        </Show>
      </div>
    </div>
  )
}

export default function BrowserPanel(props: { opened: boolean; width: number; onClose: () => void }) {
  return (
    <Show when={props.opened}>
      <Panel width={props.width} onClose={props.onClose} />
    </Show>
  )
}
