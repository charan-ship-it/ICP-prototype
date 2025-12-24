import { NextResponse } from "next/server"
import mammoth from "mammoth"
import { createWorker } from "tesseract.js"

// Ensure this runs in Node.js environment
export const runtime = "nodejs"

export async function POST(req: Request) {
    try {
        console.log("File upload request received")

        const formData = await req.formData()
        const file = formData.get("file") as File

        if (!file) {
            console.error("No file found in form data")
            return NextResponse.json({ error: "No file uploaded" }, { status: 400 })
        }

        console.log(`Processing file: ${file.name}, type: ${file.type}, size: ${file.size}`)

        const arrayBuffer = await file.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)
        let extractedText = ""

        const mimeType = file.type

        if (mimeType === "application/pdf") {
            try {
                // Use require for pdf-parse to avoid default export issues
                const pdf = require("pdf-parse")
                const data = await pdf(buffer)
                extractedText = data.text
            } catch (err) {
                console.error("PDF Parsing failed:", err)
                throw new Error("Failed to parse PDF")
            }
        } else if (
            mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        ) {
            try {
                const result = await mammoth.extractRawText({ buffer })
                extractedText = result.value
            } catch (err) {
                console.error("DOCX Parsing failed:", err)
                throw new Error("Failed to parse DOCX")
            }
        } else if (mimeType.startsWith("image/")) {
            try {
                const worker = await createWorker("eng")
                const {
                    data: { text },
                } = await worker.recognize(buffer)
                await worker.terminate()
                extractedText = text
            } catch (err) {
                console.error("OCR failed:", err)
                throw new Error("Failed to perform OCR")
            }
        } else if (mimeType === "text/plain") {
            extractedText = buffer.toString("utf-8")
        } else {
            console.error("Unsupported mime type:", mimeType)
            return NextResponse.json({ error: "Unsupported file type" }, { status: 400 })
        }

        // Clean up text
        extractedText = extractedText.replace(/\s+/g, " ").trim()

        console.log(`Extraction successful. Length: ${extractedText.length}`)

        return NextResponse.json({
            extractedText,
            charCount: extractedText.length,
        })
    } catch (error) {
        console.error("File processing error:", error)
        // Return explicit error message to frontend
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to process file" },
            { status: 500 }
        )
    }
}
