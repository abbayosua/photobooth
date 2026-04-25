import { NextRequest } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'

// Style prompt mappings
const STYLE_PROMPTS: Record<string, string> = {
  'cartoon': 'colorful cartoon illustration style, vibrant colors, clean lines, animated character design',
  'oil-painting': 'classic oil painting style, rich textures, dramatic brushstrokes, renaissance art',
  'watercolor': 'soft watercolor painting style, gentle color washes, dreamy atmosphere, artistic',
  'cyberpunk': 'cyberpunk style, neon lights, futuristic, dark city atmosphere, glowing effects, sci-fi',
  'vintage': 'vintage film photography style, warm sepia tones, film grain, retro 1970s aesthetic',
  'anime': 'Japanese anime style, cel-shaded, vibrant colors, big expressive eyes, manga aesthetic',
  'sketch': 'pencil sketch drawing style, detailed linework, artistic hand-drawn look, graphite',
  'pop-art': 'pop art style, bold colors, comic book aesthetic, Roy Lichtenstein inspired, halftone dots'
}

// Initialize ZAI instance
let zaiInstance: Awaited<ReturnType<typeof ZAI.create>> | null = null

async function getZAI() {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create()
  }
  return zaiInstance
}

// Helper to create a streaming response with periodic heartbeats
function createStreamingResponse() {
  const encoder = new TextEncoder()
  let controller: ReadableStreamDefaultController | null = null
  
  const stream = new ReadableStream({
    start(c) {
      controller = c
    }
  })

  const sendEvent = (data: object) => {
    if (controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
    }
  }

  const close = () => {
    if (controller) {
      controller.close()
    }
  }

  return { stream, sendEvent, close }
}

export async function POST(request: NextRequest) {
  const { stream, sendEvent, close } = createStreamingResponse()

  // Process in background
  ;(async () => {
    try {
      const body = await request.json()
      const { image, type, style, backgroundPrompt } = body

      console.log('Received transform request:', { type, style, hasImage: !!image })

      if (!image) {
        sendEvent({ type: 'error', error: 'Image is required' })
        close()
        return
      }

      sendEvent({ type: 'status', message: 'Initializing AI...' })

      const zai = await getZAI()
      console.log('ZAI instance ready')

      if (type === 'style') {
        await handleStyleTransfer(zai, image, style, sendEvent)
      } else if (type === 'background') {
        await handleBackgroundGeneration(zai, image, backgroundPrompt, sendEvent)
      } else {
        sendEvent({ type: 'error', error: 'Invalid transformation type' })
      }
    } catch (error) {
      console.error('Transformation error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to process image'
      sendEvent({ type: 'error', error: errorMessage })
    } finally {
      close()
    }
  })()

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}

async function handleStyleTransfer(
  zai: NonNullable<typeof zaiInstance>,
  imageBase64: string,
  styleId: string,
  sendEvent: (data: object) => void
) {
  console.log('Starting style transfer for:', styleId)
  
  const stylePrompt = STYLE_PROMPTS[styleId]
  if (!stylePrompt) {
    sendEvent({ type: 'error', error: 'Invalid style' })
    return
  }

  try {
    // Step 1: Analyze the photo to understand the subject
    sendEvent({ type: 'status', message: 'Analyzing photo...' })
    console.log('Step 1: Analyzing photo with VLM...')
    
    const analysisResponse = await zai.chat.completions.createVision({
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Analyze this photo and describe the person's appearance in detail for an artistic transformation. Include:
- Gender and approximate age
- Hair color and style
- Skin tone
- Clothing and outfit details
- Pose and expression
- Any notable features

Be descriptive but concise. Focus on visual elements only.`
            },
            {
              type: 'image_url',
              image_url: { url: imageBase64 }
            }
          ]
        }
      ],
      thinking: { type: 'disabled' }
    })

    const subjectDescription = analysisResponse.choices[0]?.message?.content || 'a person'
    console.log('Analysis complete:', subjectDescription.substring(0, 100) + '...')

    // Step 2: Generate the styled image
    sendEvent({ type: 'status', message: 'Generating styled image...' })
    console.log('Step 2: Generating styled image...')
    
    const generationPrompt = `A ${stylePrompt} portrait artwork of ${subjectDescription}. High quality, detailed, professional artistic transformation.`

    const imageResponse = await zai.images.generations.create({
      prompt: generationPrompt,
      size: '1024x1024'
    })

    const generatedImageBase64 = imageResponse.data[0]?.base64

    if (!generatedImageBase64) {
      sendEvent({ type: 'error', error: 'Failed to generate styled image' })
      return
    }

    console.log('Style transfer complete!')
    sendEvent({ 
      type: 'complete', 
      processedImage: `data:image/png;base64,${generatedImageBase64}`,
      styleId 
    })
  } catch (error) {
    console.error('Style transfer error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Style transfer failed'
    sendEvent({ type: 'error', error: errorMessage })
  }
}

async function handleBackgroundGeneration(
  zai: NonNullable<typeof zaiInstance>,
  imageBase64: string,
  backgroundPrompt: string,
  sendEvent: (data: object) => void
) {
  console.log('Starting background generation...')
  
  try {
    // Step 1: Analyze the photo to understand the subject and their position
    sendEvent({ type: 'status', message: 'Analyzing photo...' })
    console.log('Step 1: Analyzing photo with VLM...')
    
    const analysisResponse = await zai.chat.completions.createVision({
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Analyze this photo and describe:
1. The person's appearance (briefly): gender, age range, clothing, pose
2. Their position in the frame (left, center, right)
3. The lighting direction and quality
4. The current background (briefly)

Keep the description focused and concise.`
            },
            {
              type: 'image_url',
              image_url: { url: imageBase64 }
            }
          ]
        }
      ],
      thinking: { type: 'disabled' }
    })

    const analysis = analysisResponse.choices[0]?.message?.content || 'a person in center frame'
    console.log('Analysis complete')

    // Step 2: Generate a new portrait with the subject on the new background
    sendEvent({ type: 'status', message: 'Generating new background...' })
    console.log('Step 2: Generating composite image...')
    
    const compositePrompt = `Professional portrait photograph: ${analysis}. The person is positioned against a beautiful ${backgroundPrompt}. High quality, natural lighting, realistic photography, seamless background integration.`

    const compositeResponse = await zai.images.generations.create({
      prompt: compositePrompt,
      size: '1024x1024'
    })

    const compositeImageBase64 = compositeResponse.data[0]?.base64

    if (!compositeImageBase64) {
      sendEvent({ type: 'error', error: 'Failed to create composite image' })
      return
    }

    console.log('Background generation complete!')
    sendEvent({ 
      type: 'complete', 
      processedImage: `data:image/png;base64,${compositeImageBase64}`,
      backgroundPrompt 
    })
  } catch (error) {
    console.error('Background generation error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Background generation failed'
    sendEvent({ type: 'error', error: errorMessage })
  }
}
