"use client"

import { useParams } from "next/navigation"
import { VoiceChatUI } from "../page"

export default function SessionPage() {
  const params = useParams()
  const sessionId = params?.sessionId as string | undefined

  return <VoiceChatUI initialSessionId={sessionId || null} />
}
