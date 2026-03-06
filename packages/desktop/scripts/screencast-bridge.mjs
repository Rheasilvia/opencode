#!/usr/bin/env node
/**
 * screencast-bridge.mjs
 * Connects to Chrome via CDP, starts screencasting, forwards JPEG frames over WebSocket.
 * Usage: node screencast-bridge.mjs [--cdp-port 9222] [--ws-port 8765]
 */

import http from "node:http"
import { createHash } from "node:crypto"

const args = process.argv.slice(2)
const arg = (flag, def) => {
  const i = args.indexOf(flag)
  return i !== -1 ? parseInt(args[i + 1], 10) : def
}

const cdpPort = arg("--cdp-port", 9222)
const wsPort = arg("--ws-port", 8765)

// Shared state
const state = { connected: false, clients: new Set() }
let cdp = null
let cmdId = 1
let retryTimer = null

// --- WebSocket server (manual, no ws package) ---

function accept(req, socket, head) {
  const key = req.headers["sec-websocket-key"]
  if (!key) {
    socket.destroy()
    return
  }

  const accept = createHash("sha1")
    .update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
    .digest("base64")

  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\n" +
      "Connection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
  )

  state.clients.add(socket)
  socket.on("close", () => state.clients.delete(socket))
  socket.on("error", () => {
    socket.destroy()
    state.clients.delete(socket)
  })
}

function frame(data) {
  const buf = Buffer.from(data, "utf8")
  const len = buf.length
  let header
  if (len < 126) {
    header = Buffer.from([0x82, len])
  } else if (len < 65536) {
    header = Buffer.allocUnsafe(4)
    header[0] = 0x82
    header[1] = 126
    header.writeUInt16BE(len, 2)
  } else {
    header = Buffer.allocUnsafe(10)
    header[0] = 0x82
    header[1] = 127
    header.writeBigUInt64BE(BigInt(len), 2)
  }
  return Buffer.concat([header, buf])
}

function broadcast(data) {
  if (!state.clients.size) return
  const msg = frame(data)
  for (const sock of state.clients) {
    if (!sock.destroyed) sock.write(msg)
  }
}

const server = http.createServer((req, res) => {
  if (req.url === "/status" && req.method === "GET") {
    const body = JSON.stringify({ status: state.connected ? "connected" : "disconnected", clients: state.clients.size })
    res.writeHead(200, { "Content-Type": "application/json" })
    return res.end(body)
  }
  res.writeHead(404)
  res.end()
})

server.on("upgrade", accept)
server.listen(wsPort, () => console.log(`WS server on :${wsPort}`))

// --- CDP connection ---

function send(method, params = {}) {
  if (!cdp || cdp.readyState !== "open") return
  cdp.send(JSON.stringify({ id: cmdId++, method, params }))
}

async function connect() {
  let url
  try {
    const res = await fetch(`http://localhost:${cdpPort}/json/version`)
    const json = await res.json()
    url = json.webSocketDebuggerUrl
  } catch {
    state.connected = false
    retryTimer = setTimeout(connect, 3000)
    return
  }

  // Use built-in WebSocket (Node 22+) or fall back to http upgrade
  const ws = new WebSocket(url)
  cdp = ws

  ws.addEventListener("open", () => {
    state.connected = true
    console.log("CDP connected")
    send("Page.enable")
    send("Page.startScreencast", { format: "jpeg", quality: 80, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 })
  })

  ws.addEventListener("message", (evt) => {
    let msg
    try {
      msg = JSON.parse(evt.data)
    } catch {
      return
    }
    if (msg.method !== "Page.screencastFrame") return
    // Ack IMMEDIATELY before anything else
    send("Page.screencastFrameAck", { sessionId: msg.params.sessionId })
    broadcast(msg.params.data)
  })

  ws.addEventListener("close", () => {
    state.connected = false
    cdp = null
    console.log("CDP disconnected, retrying in 3s…")
    retryTimer = setTimeout(connect, 3000)
  })

  ws.addEventListener("error", () => {
    state.connected = false
    cdp = null
    retryTimer = setTimeout(connect, 3000)
  })
}

// --- Graceful shutdown ---

function shutdown() {
  clearTimeout(retryTimer)
  if (cdp) {
    send("Page.stopScreencast")
    cdp.close()
  }
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 2000)
}

process.on("SIGTERM", shutdown)
process.on("SIGINT", shutdown)

connect()
