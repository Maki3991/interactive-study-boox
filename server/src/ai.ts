import 'dotenv/config'
import OpenAI from 'openai'

let aiClient: OpenAI | undefined

function getAIClient() {
  const apiKey =
    process.env.AI_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim()

  if (!apiKey) {
    throw new Error('AI_API_KEY is not configured')
  }

  const baseURL =
    process.env.AI_BASE_URL?.trim() || process.env.OPENAI_BASE_URL?.trim()

  aiClient ??= new OpenAI({
    apiKey,
    ...(baseURL ? { baseURL } : {}),
  })
  return aiClient
}

function getAIModel() {
  return (
    process.env.AI_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    'gpt-5'
  )
}

export async function generateText(input: string) {
  if (input.trim() === '') {
    throw new Error('AI input cannot be empty')
  }

  const response = await getAIClient().responses.create({
    model: getAIModel(),
    input,
  })

  return response.output_text.trim()
}
