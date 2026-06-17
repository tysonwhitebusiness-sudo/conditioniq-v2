"use client"

import { useState } from "react"

export default function SentryTestPage() {
  const [triggered, setTriggered] = useState(false)

  return (
    <main style={{ padding: 40, fontFamily: "sans-serif" }}>
      <h1>Sentry Test Page</h1>
      <p>Use the buttons below to trigger test errors in Sentry.</p>

      <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
        <button
          onClick={() => {
            setTriggered(true)
            throw new Error("Sentry test error - this is expected")
          }}
          style={{ padding: "10px 20px", fontSize: 14, cursor: "pointer" }}
        >
          Throw Test Error (client)
        </button>

        <button
          onClick={async () => {
            await fetch("/api/sentry-example-api")
          }}
          style={{ padding: "10px 20px", fontSize: 14, cursor: "pointer" }}
        >
          Trigger API Error (server)
        </button>
      </div>

      {triggered && (
        <p style={{ marginTop: 20, color: "red" }}>
          Client error thrown — check Sentry dashboard.
        </p>
      )}
    </main>
  )
}
