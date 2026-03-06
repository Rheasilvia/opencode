import { commands } from "./bindings"

const CDP_PORT = 9222
const WS_PORT = 8765

export async function isChrome(port = CDP_PORT): Promise<boolean> {
  try {
    const res = await fetch(`http://localhost:${port}/json/version`)
    return res.ok
  } catch {
    return false
  }
}

export async function startBridge(cdp = CDP_PORT, ws = WS_PORT) {
  return commands.startBrowserBridge(cdp, ws)
}

export async function stopBridge() {
  return commands.stopBrowserBridge()
}

export async function isBridgeRunning() {
  return commands.getBridgeStatus()
}
