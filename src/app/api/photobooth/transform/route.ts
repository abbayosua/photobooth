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

// FreeImage.host API key
const FREEIMAGE_API_KEY = '6d207e02198a847aa98d0a2a901485a5'

// In-memory job storage
const jobs = new Map<string, {
  status: 'pending' | 'processing' | 'complete' | 'error'
  type: 'style' | 'background'
  image?: string
  style?: string
  backgroundPrompt?: string
  result?: string  // Will be the hosted URL
  error?: string
  createdAt: number
}>()

// Initialize ZAI instance
let zaiInstance: Awaited<ReturnType<typeof ZAI.create>> | null = null

async function getZAI() {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create()
  }
  return zaiInstance
}

// Generate unique job ID
function generateJobId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

// Upload image to freeimage.host
async function uploadToFreeImage(base64Data: string): Promise<string> {
  // Remove data URL prefix if present
  const base64 = base64Data.replace(/^data:image\/\w+;base64,/, '')
  
  const formData = new URLSearchParams()
  formData.append('key', FREEIMAGE_API_KEY)
  formData.append('action', 'upload')
  formData.append('source', base64)
  formData.append('format', 'json')

  const response = await fetch('https://freeimage.host/api/1/upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: formData.toString()
  })

  if (!response.ok) {
    const text = await response.text()
    console.error('FreeImage upload failed:', text)
    throw new Error('Failed to upload image to hosting service')
  }

  const data = await response.json()
  
  if (data.status_code !== 200 || !data.image) {
    console.error('FreeImage response:', data)
    throw new Error(data.error?.message || 'Failed to get image URL')
  }

  return data.image.url
}

// Process job in background
async function processJob(jobId: string) {
  const job = jobs.get(jobId)
  if (!job) return

  job.status = 'processing'
  console.log(`Processing job ${jobId}:`, job.type)

  try {
    const zai = await getZAI()

    if (job.type === 'style') {
      await processStyleTransfer(zai, job, jobId)
    } else if (job.type === 'background') {
      await processBackgroundGeneration(zai, job, jobId)
    }
  } catch (error) {
    console.error(`Job ${jobId} error:`, error)
    job.status = 'error'
    job.error = error instanceof Error ? error.message : 'Processing failed'
  }
}

async function processStyleTransfer(
  zai: NonNullable<typeof zaiInstance>,
  job: NonNullable<typeof jobs extends Map<string, infer T> ? T : never>,
  jobId: string
) {
  const stylePrompt = STYLE_PROMPTS[job.style!]
  if (!stylePrompt) {
    job.status = 'error'
    job.error = 'Invalid style'
    return
  }

  console.log(`Job ${jobId}: Analyzing photo...`)
  
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
            image_url: { url: job.image! }
          }
        ]
      }
    ],
    thinking: { type: 'disabled' }
  })

  const subjectDescription = analysisResponse.choices[0]?.message?.content || 'a person'
  console.log(`Job ${jobId}: Analysis complete`)

  console.log(`Job ${jobId}: Generating styled image...`)
  const generationPrompt = `A ${stylePrompt} portrait artwork of ${subjectDescription}. High quality, detailed, professional artistic transformation.`

  const imageResponse = await zai.images.generations.create({
    prompt: generationPrompt,
    size: '1024x1024'
  })

  const generatedImageBase64 = imageResponse.data[0]?.base64

  if (!generatedImageBase64) {
    job.status = 'error'
    job.error = 'Failed to generate styled image'
    return
  }

  console.log(`Job ${jobId}: Uploading to image host...`)
  
  // Upload to freeimage.host
  const imageUrl = await uploadToFreeImage(`data:image/png;base64,${generatedImageBase64}`)
  
  job.result = imageUrl
  job.status = 'complete'
  console.log(`Job ${jobId}: Complete! URL: ${imageUrl}`)
}

async function processBackgroundGeneration(
  zai: NonNullable<typeof zaiInstance>,
  job: NonNullable<typeof jobs extends Map<string, infer T> ? T : never>,
  jobId: string
) {
  console.log(`Job ${jobId}: Analyzing photo...`)
  
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
            image_url: { url: job.image! }
          }
        ]
      }
    ],
    thinking: { type: 'disabled' }
  })

  const analysis = analysisResponse.choices[0]?.message?.content || 'a person in center frame'
  console.log(`Job ${jobId}: Analysis complete`)

  console.log(`Job ${jobId}: Generating composite image...`)
  const compositePrompt = `Professional portrait photograph: ${analysis}. The person is positioned against a beautiful ${job.backgroundPrompt}. High quality, natural lighting, realistic photography, seamless background integration.`

  const compositeResponse = await zai.images.generations.create({
    prompt: compositePrompt,
    size: '1024x1024'
  })

  const compositeImageBase64 = compositeResponse.data[0]?.base64

  if (!compositeImageBase64) {
    job.status = 'error'
    job.error = 'Failed to create composite image'
    return
  }

  console.log(`Job ${jobId}: Uploading to image host...`)
  
  // Upload to freeimage.host
  const imageUrl = await uploadToFreeImage(`data:image/png;base64,${compositeImageBase64}`)
  
  job.result = imageUrl
  job.status = 'complete'
  console.log(`Job ${jobId}: Complete! URL: ${imageUrl}`)
}

// GET - Check job status
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const jobId = searchParams.get('jobId')

  if (!jobId) {
    return NextResponse.json({ error: 'Job ID required' }, { status: 400 })
  }

  const job = jobs.get(jobId)
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  return NextResponse.json({
    status: job.status,
    result: job.result,  // Now a URL instead of base64
    error: job.error
  })
}

// POST - Create new job
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { image, type, style, backgroundPrompt } = body

    console.log('Received transform request:', { type, style, hasImage: !!image })

    if (!image) {
      return NextResponse.json({ error: 'Image is required' }, { status: 400 })
    }

    if (type !== 'style' && type !== 'background') {
      return NextResponse.json({ error: 'Invalid transformation type' }, { status: 400 })
    }

    // Create job
    const jobId = generateJobId()
    jobs.set(jobId, {
      status: 'pending',
      type,
      image,
      style,
      backgroundPrompt,
      createdAt: Date.now()
    })

    // Start processing in background (don't await)
    processJob(jobId).catch(err => {
      console.error(`Job ${jobId} failed:`, err)
    })

    // Return job ID immediately
    return NextResponse.json({ jobId, status: 'pending' })
  } catch (error) {
    console.error('Error creating job:', error)
    return NextResponse.json(
      { error: 'Failed to create job' },
      { status: 500 }
    )
  }
}
