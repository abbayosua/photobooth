import { NextRequest, NextResponse } from 'next/server'
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { image, type, style, backgroundPrompt } = body

    if (!image) {
      return NextResponse.json(
        { error: 'Image is required' },
        { status: 400 }
      )
    }

    const zai = await getZAI()

    if (type === 'style') {
      // Style transfer: Analyze the photo and generate a styled version
      return await handleStyleTransfer(zai, image, style)
    } else if (type === 'background') {
      // Background generation: Generate new background and create composite
      return await handleBackgroundGeneration(zai, image, backgroundPrompt)
    }

    return NextResponse.json(
      { error: 'Invalid transformation type' },
      { status: 400 }
    )
  } catch (error) {
    console.error('Transformation error:', error)
    return NextResponse.json(
      { error: 'Failed to process image' },
      { status: 500 }
    )
  }
}

async function handleStyleTransfer(
  zai: NonNullable<typeof zaiInstance>,
  imageBase64: string,
  styleId: string
) {
  const stylePrompt = STYLE_PROMPTS[styleId]
  if (!stylePrompt) {
    return NextResponse.json(
      { error: 'Invalid style' },
      { status: 400 }
    )
  }

  // Step 1: Analyze the photo to understand the subject
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

  // Step 2: Generate the styled image
  const generationPrompt = `A ${stylePrompt} portrait artwork of ${subjectDescription}. High quality, detailed, professional artistic transformation.`

  const imageResponse = await zai.images.generations.create({
    prompt: generationPrompt,
    size: '1024x1024'
  })

  const generatedImageBase64 = imageResponse.data[0]?.base64

  if (!generatedImageBase64) {
    return NextResponse.json(
      { error: 'Failed to generate styled image' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    processedImage: `data:image/png;base64,${generatedImageBase64}`,
    type: 'style',
    styleId
  })
}

async function handleBackgroundGeneration(
  zai: NonNullable<typeof zaiInstance>,
  imageBase64: string,
  backgroundPrompt: string
) {
  // Step 1: Analyze the photo to understand the subject and their position
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

  // Step 2: Generate a background image
  const backgroundGenPrompt = `${backgroundPrompt}, professional photography background, high quality, detailed, suitable for portrait backdrop`

  const backgroundResponse = await zai.images.generations.create({
    prompt: backgroundGenPrompt,
    size: '1024x1024'
  })

  const backgroundImageBase64 = backgroundResponse.data[0]?.base64

  if (!backgroundImageBase64) {
    return NextResponse.json(
      { error: 'Failed to generate background' },
      { status: 500 }
    )
  }

  // Step 3: Generate a new portrait with the subject on the new background
  const compositePrompt = `Professional portrait photograph: ${analysis}. The person is positioned against a beautiful ${backgroundPrompt}. High quality, natural lighting, realistic photography, seamless background integration.`

  const compositeResponse = await zai.images.generations.create({
    prompt: compositePrompt,
    size: '1024x1024'
  })

  const compositeImageBase64 = compositeResponse.data[0]?.base64

  if (!compositeImageBase64) {
    return NextResponse.json(
      { error: 'Failed to create composite image' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    processedImage: `data:image/png;base64,${compositeImageBase64}`,
    type: 'background',
    backgroundPrompt
  })
}
