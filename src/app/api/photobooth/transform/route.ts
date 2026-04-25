import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs'
import { join } from 'path'
import sharp from 'sharp'

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

// In-memory job storage
const jobs = new Map<string, {
  status: 'pending' | 'processing' | 'complete' | 'error'
  type: 'style' | 'background'
  image?: string
  style?: string
  backgroundPrompt?: string
  result?: string
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

// Save image locally
function saveImageLocally(base64Data: string, filename: string): string {
  try {
    // Remove data URL prefix if present
    const base64 = base64Data.replace(/^data:image\/\w+;base64,/, '')
    
    // Ensure directory exists
    const outputDir = join(process.cwd(), 'public', 'generated')
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true })
    }
    
    // Write file
    const filePath = join(outputDir, filename)
    const buffer = Buffer.from(base64, 'base64')
    writeFileSync(filePath, buffer)
    
    // Return public URL path
    return `/generated/${filename}`
  } catch (error) {
    console.error('Error saving image:', error)
    throw new Error('Failed to save image')
  }
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

  console.log(`Job ${jobId}: Saving image locally...`)
  
  // Save locally and get URL
  const filename = `${jobId}.png`
  const imageUrl = saveImageLocally(generatedImageBase64, filename)
  
  job.result = imageUrl
  job.status = 'complete'
  console.log(`Job ${jobId}: Complete! URL: ${imageUrl}`)
}

interface PersonPosition {
  horizontal: 'left' | 'center' | 'right'
  vertical: 'top' | 'middle' | 'bottom'
  approximateSize: string
  lightingDirection: string
  lightingQuality: string
}

async function processBackgroundGeneration(
  zai: NonNullable<typeof zaiInstance>,
  job: NonNullable<typeof jobs extends Map<string, infer T> ? T : never>,
  jobId: string
) {
  console.log(`Job ${jobId}: Analyzing photo for person position and lighting...`)
  
  // Step 1: Analyze the photo to understand person position and lighting
  const analysisResponse = await zai.chat.completions.createVision({
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Analyze this portrait photo and provide the following information in a structured format:

1. Person's horizontal position: "left", "center", or "right"
2. Person's vertical position: "top", "middle", or "bottom"
3. Person's approximate size in frame: describe as percentage (e.g., "takes up about 60% of frame")
4. Lighting direction: where is the main light coming from? (e.g., "from the left", "from above", "front-lit", "from the right")
5. Lighting quality: describe the lighting (e.g., "soft diffused", "harsh direct", "warm golden hour", "cool overcast")

Respond in this exact JSON format:
{"horizontal": "center", "vertical": "middle", "approximateSize": "60%", "lightingDirection": "from the left", "lightingQuality": "soft diffused"}`
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

  const analysisText = analysisResponse.choices[0]?.message?.content || ''
  console.log(`Job ${jobId}: Raw analysis:`, analysisText)
  
  // Parse the position info
  let position: PersonPosition = {
    horizontal: 'center',
    vertical: 'middle',
    approximateSize: '60%',
    lightingDirection: 'front-lit',
    lightingQuality: 'soft diffused'
  }
  
  try {
    // Extract JSON from the response
    const jsonMatch = analysisText.match(/\{[^}]+\}/s)
    if (jsonMatch) {
      position = { ...position, ...JSON.parse(jsonMatch[0]) }
    }
  } catch (e) {
    console.log(`Job ${jobId}: Could not parse position, using defaults`)
  }
  
  console.log(`Job ${jobId}: Person position:`, position)

  // Step 2: Generate background-only image with matching lighting
  console.log(`Job ${jobId}: Generating new background...`)
  
  const backgroundPrompt = `Beautiful ${job.backgroundPrompt}, professional photography background, 
    ${position.lightingQuality} lighting ${position.lightingDirection}, 
    empty space for subject, no people, high quality, detailed, 
    depth of field, cinematic composition, 1024x1024 aspect ratio`

  const backgroundResponse = await zai.images.generations.create({
    prompt: backgroundPrompt,
    size: '1024x1024'
  })

  const backgroundBase64 = backgroundResponse.data[0]?.base64

  if (!backgroundBase64) {
    job.status = 'error'
    job.error = 'Failed to generate background'
    return
  }

  console.log(`Job ${jobId}: Compositing original photo onto new background...`)

  // Step 3: Composite the original photo onto the new background
  try {
    const compositedBase64 = await compositePersonOntoBackground(
      job.image!,
      backgroundBase64,
      position
    )

    console.log(`Job ${jobId}: Saving composited image locally...`)
    
    // Save locally and get URL
    const filename = `${jobId}.png`
    const imageUrl = saveImageLocally(compositedBase64, filename)
    
    job.result = imageUrl
    job.status = 'complete'
    console.log(`Job ${jobId}: Complete! URL: ${imageUrl}`)
  } catch (compositeError) {
    console.error(`Job ${jobId}: Compositing failed:`, compositeError)
    job.status = 'error'
    job.error = 'Failed to composite images'
  }
}

// Composite the original person onto the new background
async function compositePersonOntoBackground(
  originalImageBase64: string,
  backgroundBase64: string,
  position: PersonPosition
): Promise<string> {
  // Decode base64 images
  const originalData = originalImageBase64.replace(/^data:image\/\w+;base64,/, '')
  const bgData = backgroundBase64.replace(/^data:image\/\w+;base64,/, '')
  
  const originalBuffer = Buffer.from(originalData, 'base64')
  const bgBuffer = Buffer.from(bgData, 'base64')
  
  // Load images with sharp
  const originalImage = sharp(originalBuffer)
  const bgImage = sharp(bgBuffer)
  
  // Get metadata
  const originalMeta = await originalImage.metadata()
  const bgMeta = await bgImage.metadata()
  
  const targetSize = 1024
  
  // Resize original to fit within the composition (keep aspect ratio)
  // Scale to ~80% of target size to leave room for background
  const personHeight = Math.round(targetSize * 0.85)
  const personWidth = Math.round(targetSize * 0.85)
  
  const resizedOriginal = await originalImage
    .resize(personWidth, personHeight, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .toBuffer()
  
  // Resize background to target size
  const resizedBg = await bgImage
    .resize(targetSize, targetSize, { fit: 'cover' })
    .toBuffer()
  
  // Calculate position for the person
  const resizedMeta = await sharp(resizedOriginal).metadata()
  const actualWidth = resizedMeta.width || personWidth
  const actualHeight = resizedMeta.height || personHeight
  
  let left: number, top: number
  
  // Horizontal position
  switch (position.horizontal) {
    case 'left':
      left = Math.round(targetSize * 0.05)
      break
    case 'right':
      left = Math.round(targetSize - actualWidth - targetSize * 0.05)
      break
    default: // center
      left = Math.round((targetSize - actualWidth) / 2)
  }
  
  // Vertical position
  switch (position.vertical) {
    case 'top':
      top = Math.round(targetSize * 0.05)
      break
    case 'bottom':
      top = Math.round(targetSize - actualHeight - targetSize * 0.05)
      break
    default: // middle
      top = Math.round((targetSize - actualHeight) / 2)
  }
  
  // Ensure we don't go negative
  left = Math.max(0, left)
  top = Math.max(0, top)
  
  console.log(`Compositing: position (${left}, ${top}), size (${actualWidth}x${actualHeight})`)
  
  // Create a soft mask for the edges to blend better
  const mask = await createSoftMask(actualWidth, actualHeight, 15)
  
  // Apply the mask to the original image (make edges transparent)
  const maskedOriginal = await sharp(resizedOriginal)
    .composite([
      {
        input: mask,
        blend: 'dest-in'
      }
    ])
    .toBuffer()
  
  // Composite the masked person onto the background
  const composited = await sharp(resizedBg)
    .composite([
      {
        input: maskedOriginal,
        left: left,
        top: top,
        blend: 'over'
      }
    ])
    .png()
    .toBuffer()
  
  return composited.toString('base64')
}

// Create a soft elliptical mask for smoother blending
async function createSoftMask(width: number, height: number, featherAmount: number): Promise<Buffer> {
  // Create an elliptical gradient mask
  const svg = `
    <svg width="${width}" height="${height}">
      <defs>
        <radialGradient id="maskGradient" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="white" stop-opacity="1"/>
          <stop offset="${Math.max(0, 70 - featherAmount)}%" stop-color="white" stop-opacity="1"/>
          <stop offset="100%" stop-color="white" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <ellipse cx="${width / 2}" cy="${height / 2}" rx="${width / 2}" ry="${height / 2}" fill="url(#maskGradient)"/>
    </svg>
  `
  
  const maskBuffer = await sharp(Buffer.from(svg))
    .resize(width, height)
    .png()
    .toBuffer()
  
  return maskBuffer
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
    result: job.result,
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
