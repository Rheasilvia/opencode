import type { BrowserStatus } from "@/components/browser-panel"

let ws: WebSocket | null = null
let raf: number | null = null
let canvas: HTMLCanvasElement | null = null
let ctx: CanvasRenderingContext2D | null = null
let pending: ImageBitmap | null = null

function draw() {
  if (!canvas || !ctx) return
  if (pending) {
    canvas.width = pending.width
    canvas.height = pending.height
    ctx.drawImage(pending, 0, 0)
    pending.close()
    pending = null
  }
  raf = requestAnimationFrame(draw)
}

export function connect(el: HTMLCanvasElement, url: string, cb: (s: BrowserStatus) => void) {
  canvas = el
  ctx = el.getContext("2d")
  cb("connecting")

  ws = new WebSocket(url)

  ws.onopen = () => cb("connected")
  ws.onclose = () => {
    cb("disconnected")
    ws = null
  }
  ws.onerror = () => {
    cb("disconnected")
    ws = null
  }

  ws.onmessage = (evt) => {
    fetch(`data:image/jpeg;base64,${evt.data as string}`)
      .then((r) => r.blob())
      .then((blob) => createImageBitmap(blob))
      .then((bmp) => {
        pending?.close()
        pending = bmp
      })
  }

  raf = requestAnimationFrame(draw)
}

export function disconnect() {
  if (raf !== null) {
    cancelAnimationFrame(raf)
    raf = null
  }
  if (ws) {
    ws.close()
    ws = null
  }
  pending?.close()
  pending = null
  canvas = null
  ctx = null
}
