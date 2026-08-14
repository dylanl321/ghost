export interface AIServiceDefinition {
  name: string
  category: 'generative-ai' | 'ml-platform' | 'applied-ai'
  deepTelemetry: boolean
}

export const AI_SERVICE_CATALOG: AIServiceDefinition[] = [
  { name: 'Amazon Bedrock', category: 'generative-ai', deepTelemetry: true },
  { name: 'Amazon Bedrock Service', category: 'generative-ai', deepTelemetry: true },
  { name: 'Amazon Bedrock AgentCore', category: 'generative-ai', deepTelemetry: false },
  { name: 'Amazon Q', category: 'generative-ai', deepTelemetry: false },
  { name: 'Amazon Q Developer', category: 'generative-ai', deepTelemetry: false },
  { name: 'Amazon Quick', category: 'generative-ai', deepTelemetry: false },
  { name: 'Amazon SageMaker', category: 'ml-platform', deepTelemetry: false },
  { name: 'Amazon SageMaker AI', category: 'ml-platform', deepTelemetry: false },
  { name: 'Amazon Textract', category: 'applied-ai', deepTelemetry: false },
  { name: 'Amazon Rekognition', category: 'applied-ai', deepTelemetry: false },
  { name: 'Amazon Transcribe', category: 'applied-ai', deepTelemetry: false },
  { name: 'Amazon Translate', category: 'applied-ai', deepTelemetry: false },
  { name: 'Amazon Comprehend', category: 'applied-ai', deepTelemetry: false },
  { name: 'Amazon Comprehend Medical', category: 'applied-ai', deepTelemetry: false },
  { name: 'Amazon Lex', category: 'applied-ai', deepTelemetry: false },
  { name: 'Amazon Polly', category: 'applied-ai', deepTelemetry: false },
  { name: 'Amazon Kendra', category: 'applied-ai', deepTelemetry: false },
  { name: 'Amazon Personalize', category: 'applied-ai', deepTelemetry: false },
  { name: 'Amazon Forecast', category: 'applied-ai', deepTelemetry: false }
]

export const AI_COST_EXPLORER_SERVICES = AI_SERVICE_CATALOG.map(service => service.name)

export function isBedrockService(service: string): boolean {
  return service.toLowerCase().includes('bedrock')
}
