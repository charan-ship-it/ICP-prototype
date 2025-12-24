import { NextResponse } from "next/server"

// This endpoint generates a summary using the ElevenLabs agent
// Alternative: Could use OpenAI API if available
export const runtime = "nodejs"

export async function POST(req: Request) {
    try {
        const { text } = await req.json()

        if (!text || typeof text !== "string") {
            return NextResponse.json(
                { error: "Text is required" },
                { status: 400 }
            )
        }

        // Truncate if too long (to avoid token limits)
        const textToSummarize = text.slice(0, 50000) // Adjust based on API limits

        // Option 1: Use OpenAI API if available (recommended for summarization)
        if (process.env.OPENAI_API_KEY) {
            const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
                },
                body: JSON.stringify({
                    model: "gpt-4o-mini", // or "gpt-3.5-turbo" for cost efficiency
                    messages: [
                        {
                            role: "system",
                            content: "You are a helpful assistant that creates concise, informative summaries. Summarize the following document content in 2-3 paragraphs, highlighting key points and main ideas."
                        },
                        {
                            role: "user",
                            content: `Please summarize the following document:\n\n${textToSummarize}`
                        }
                    ],
                    max_tokens: 500,
                    temperature: 0.7,
                }),
            })

            if (!openaiResponse.ok) {
                throw new Error("OpenAI API request failed")
            }

            const openaiData = await openaiResponse.json()
            const summary = openaiData.choices[0]?.message?.content

            if (!summary) {
                throw new Error("No summary generated")
            }

            return NextResponse.json({ summary })
        }

        // Option 2: Fallback - Simple extractive summary (first 500 chars + "...")
        // This is a basic fallback if no AI service is configured
        const fallbackSummary = textToSummarize.slice(0, 500).trim()
        const summary = fallbackSummary.length < textToSummarize.length
            ? `${fallbackSummary}...`
            : fallbackSummary

        return NextResponse.json({
            summary,
            note: "Using extractive summary. Configure OPENAI_API_KEY for AI-generated summaries."
        })

    } catch (error) {
        console.error("Summary generation error:", error)
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to generate summary" },
            { status: 500 }
        )
    }
}

