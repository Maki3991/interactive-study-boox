import 'dotenv/config'
import OpenAI from 'openai'

let openaiClient: OpenAI | undefined

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY?.trim()

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured')
  }

  openaiClient ??= new OpenAI({ apiKey })
  return openaiClient
}

export async function generateText(input: string) {
  if (input.trim() === '') {
    throw new Error('AI input cannot be empty')
  }

  const response = await getOpenAIClient().responses.create({
    model: process.env.OPENAI_MODEL?.trim() || 'gpt-5',
    input,
  })

  return response.output_text.trim()
}
